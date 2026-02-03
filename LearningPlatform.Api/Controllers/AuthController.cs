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
    private readonly IEmailSender _email;
    private readonly IPasswordHasher<ApplicationUser> _passwordHasher;
    private readonly IConfiguration _config;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        IEmailSender email,
        IPasswordHasher<ApplicationUser> passwordHasher,
        IConfiguration config)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _db = db;
        _email = email;
        _passwordHasher = passwordHasher;
        _config = config;
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

    // ---------- REGISTER START (send code) ----------
    public record RegisterStartRequest(string Email, string Password, string Role);
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

        // Hash the password now (do NOT store raw password)
        var tempUser = new ApplicationUser { Email = email, UserName = email };
        var passwordHash = _passwordHasher.HashPassword(tempUser, req.Password);

        var expires = DateTimeOffset.UtcNow.AddMinutes(10);

        if (pending == null)
        {
            pending = new PendingRegistration
            {
                Email = email,
                Role = role,
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
            pending.PasswordHash = passwordHash;
            pending.CodeHash = codeHash;
            pending.ExpiresAt = expires;
            pending.Attempts = 0;
            pending.LastSentAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _email.SendAsync(
            email,
            "Alef verification code",
            $"<p>Your Alef verification code is:</p><h2>{code}</h2><p>It expires in 10 minutes.</p>"
        );

        return Ok(new RegisterStartResponse(email, 600));
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
            EmailConfirmed = true
        };

        // set password hash from pending (so we don't need raw password)
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

    [HttpPost("email-test")]
[AllowAnonymous]
public async Task<IActionResult> EmailTest([FromBody] string email)
{
    await _email.SendAsync(email, "Alef SMTP test", "<h2>SMTP works ✅</h2>");
    return Ok("sent");
}

}
