// AuthController.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LearningPlatform.Api.Services;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly AppDbContext _db;
    private readonly ISmsSender _sms;
    private readonly SmsOptions _smsOpt;
    private readonly IPasswordHasher<ApplicationUser> _passwordHasher;
    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        ISmsSender sms,
        SmsOptions smsOpt,
        IPasswordHasher<ApplicationUser> passwordHasher,
        IConfiguration config,
        IWebHostEnvironment env)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _db = db;
        _sms = sms;
        _smsOpt = smsOpt;
        _passwordHasher = passwordHasher;
        _config = config;
        _env = env;
    }

    // ---------- LOGIN ----------
    public record LoginRequest(string Email, string Password);

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var user = await _userManager.FindByEmailAsync(email);
        if (user is null) return Unauthorized("Incorrect email or password.");

        var ok = await _signInManager.CheckPasswordSignInAsync(user, req.Password, lockoutOnFailure: false);
        if (!ok.Succeeded) return Unauthorized("Incorrect email or password.");

        var token = await CreateJwt(user);
        return Ok(new { accessToken = token });
    }

    // ---------- REGISTER START (send code via SMS) ----------
    public record RegisterStartRequest(string Email, string Password, string Role, string Phone);
    public record RegisterStartResponse(string Email, int ExpiresInSeconds);

    [HttpPost("register-start")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterStart(RegisterStartRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var role = string.IsNullOrWhiteSpace(req.Role) ? "Student" : req.Role.Trim();

        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
            return BadRequest("Valid email is required.");

        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 6)
            return BadRequest("Password must be at least 6 characters.");

        if (role is not ("Student" or "Instructor"))
            return BadRequest("Role must be Student or Instructor.");

        // Phone normalize + validate (E.164, with Irish convenience)
        var phone = NormalizeToE164(req.Phone);
        if (string.IsNullOrWhiteSpace(phone))
            return BadRequest("Phone must be a valid number. Use E.164 like +353851234567 (or Irish local 08...).");

        // already registered?
        var exists = await _userManager.FindByEmailAsync(email);
        if (exists != null) return Conflict("Email already registered. Please login.");

        // cooldown resend
        var pending = await _db.PendingRegistrations.FirstOrDefaultAsync(x => x.Email == email);
        if (pending != null && pending.LastSentAt != null && pending.LastSentAt > DateTimeOffset.UtcNow.AddSeconds(-30))
            return BadRequest("Please wait 30 seconds before requesting a new code.");

        var code = GenerateCode();
        var secret = _config["Otp:Secret"] ?? throw new Exception("Otp:Secret missing");
        var codeHash = HashCode(code, email, secret);

        // Hash password now (do NOT store raw password)
        var tempUser = new ApplicationUser { Email = email, UserName = email };
        var passwordHash = _passwordHasher.HashPassword(tempUser, req.Password);

        var expires = DateTimeOffset.UtcNow.AddMinutes(10);

        if (pending == null)
        {
            pending = new PendingRegistration
            {
                Email = email,
                Role = role,
                Phone = phone,
                PasswordHash = passwordHash,
                CodeHash = codeHash,
                ExpiresAt = expires,
                Attempts = 0,
                LastSentAt = DateTimeOffset.UtcNow
            };
            _db.PendingRegistrations.Add(pending);
        }
        else
        {
            pending.Role = role;
            pending.Phone = phone;
            pending.PasswordHash = passwordHash;
            pending.CodeHash = codeHash;
            pending.ExpiresAt = expires;
            pending.Attempts = 0;
            pending.LastSentAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();

        try
        {
            var smsText = $"Alef verification code: {code}. Expires in 10 minutes.";
            await _sms.SendAsync(phone, smsText);

            return Ok(new RegisterStartResponse(email, 600));
        }
        catch (Exception ex)
        {
            Console.WriteLine("SMS send failed:");
            Console.WriteLine(ex);

            // Dev fallback (optional)
            if (_env.IsDevelopment() && _smsOpt.EnableDevFallback)
            {
                return Ok(new
                {
                    email,
                    expiresInSeconds = 600,
                    devNote = "SMS failed in Development. Returning code for testing only.",
                    code
                });
            }

            return StatusCode(500, "Failed to send verification SMS. Please try again later.");
        }
    }

    // ---------- REGISTER CONFIRM (verify code + create user) ----------
    public record RegisterConfirmRequest(string Email, string Code);

    [HttpPost("register-confirm")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterConfirm(RegisterConfirmRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var code = (req.Code ?? "").Trim();

        var pending = await _db.PendingRegistrations.FirstOrDefaultAsync(x => x.Email == email);
        if (pending == null) return BadRequest("No pending registration found. Please request a new code.");

        if (pending.ExpiresAt < DateTimeOffset.UtcNow)
            return BadRequest("Code expired. Please request a new code.");

        if (pending.Attempts >= 5)
            return BadRequest("Too many attempts. Please request a new code.");

        var secret = _config["Otp:Secret"] ?? throw new Exception("Otp:Secret missing");
        var expected = HashCode(code, email, secret);

        if (expected != pending.CodeHash)
        {
            pending.Attempts += 1;
            await _db.SaveChangesAsync();
            return BadRequest("Invalid code.");
        }

        // Create Identity user now
        var user = new ApplicationUser
        {
            Email = email,
            UserName = email,
            EmailConfirmed = true,
            PhoneNumber = pending.Phone
        };

        user.PasswordHash = pending.PasswordHash;

        var createResult = await _userManager.CreateAsync(user);
        if (!createResult.Succeeded)
        {
            var msg = string.Join(", ", createResult.Errors.Select(e => e.Description));
            return BadRequest(msg);
        }

        await _userManager.AddToRoleAsync(user, pending.Role);

        _db.PendingRegistrations.Remove(pending);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Account verified and created. You can login now." });
    }

    // ---------- helpers ----------
    private static string GenerateCode()
    {
        var n = RandomNumberGenerator.GetInt32(100000, 999999);
        return n.ToString();
    }

    private static string HashCode(string code, string email, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var bytes = Encoding.UTF8.GetBytes($"{email.ToLowerInvariant()}:{code}");
        return Convert.ToBase64String(hmac.ComputeHash(bytes));
    }

    private async Task<string> CreateJwt(ApplicationUser user)
    {
        var jwtKey = _config["Jwt:Key"] ?? throw new Exception("Jwt:Key missing");
        var jwtIssuer = _config["Jwt:Issuer"] ?? "LearningPlatform";
        var jwtAudience = _config["Jwt:Audience"] ?? "LearningPlatform";

        var roles = await _userManager.GetRolesAsync(user);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email ?? ""),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Name, user.Email ?? "")
        };

        foreach (var r in roles)
            claims.Add(new Claim(ClaimTypes.Role, r));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(6),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [HttpPost("sms-test")]
    [AllowAnonymous]
    public async Task<IActionResult> SmsTest([FromBody] string phone)
    {
        try
        {
            var to = NormalizeToE164(phone);
            if (string.IsNullOrWhiteSpace(to))
                return BadRequest("Phone must be valid E.164, e.g. +353851234567.");

            await _sms.SendAsync(to, "Alef SMS test ✅");
            return Ok("sent");
        }
        catch (Exception ex)
        {
            return BadRequest("SMS failed: " + ex.Message);
        }
    }

    private static string NormalizeToE164(string? input)
{
    if (string.IsNullOrWhiteSpace(input)) return "";

    var p = input.Trim()
        .Replace(" ", "")
        .Replace("-", "")
        .Replace("(", "")
        .Replace(")", "");

    
    if (p.StartsWith("00"))
        p = "+" + p.Substring(2);

    
    if (p.StartsWith("+") && p.Length >= 8)
    {
        
        if (p.StartsWith("+9660"))
            p = "+966" + p.Substring(5);

        return p;
    }

    
    if (p.StartsWith("05") && p.Length >= 9)
        return "+966" + p.Substring(1); 

    
    if (p.StartsWith("5") && p.Length >= 8 && p.Length <= 10)
        return "+966" + p;

    
    if (p.StartsWith("966") && p.Length >= 11)
    {
        
        if (p.StartsWith("9660"))
            return "+966" + p.Substring(4);

        return "+" + p;
    }

 
    if (p.StartsWith("353") && p.Length >= 11)
        return "+" + p;

  
    if (p.StartsWith("08") && p.Length >= 9)
        return "+353" + p.Substring(1);

    return "";
}

}
