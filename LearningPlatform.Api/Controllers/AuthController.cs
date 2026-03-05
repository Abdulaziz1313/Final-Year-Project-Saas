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

    // =========================================================
    // LOGIN
    // =========================================================
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

    // =========================================================
    // PUBLIC: ACADEMY INFO
    // Used by the instructor registration page to show academy branding.
    // GET /api/auth/academy-info?slug={slug}
    // =========================================================
    [HttpGet("academy-info")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAcademyInfo([FromQuery] string slug)
    {
        if (string.IsNullOrWhiteSpace(slug))
            return BadRequest("slug is required.");

        var academy = await _db.Academies
            .AsNoTracking()
            .Where(a => a.Slug == slug && !a.IsHidden)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.LogoUrl,
                a.PrimaryColor,
                a.Description,
                a.IsPublished,
                OrgName = a.Organization != null ? a.Organization.Name : null,
                OrgIsActive = a.Organization != null && a.Organization.IsActive
            })
            .FirstOrDefaultAsync();

        if (academy is null) return NotFound("Academy not found.");
        if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

        return Ok(academy);
    }

    // =========================================================
    // ORGANIZATION REGISTER — Step 1: send OTP
    // POST /api/auth/org-register-start
    // =========================================================
    public record OrgRegisterStartRequest(string Email, string Password, string Phone);

    [HttpPost("org-register-start")]
    [AllowAnonymous]
    public async Task<IActionResult> OrgRegisterStart(OrgRegisterStartRequest req)
    {
        return await StartPendingRegistration(req.Email, req.Password, req.Phone, "OrgAdmin");
    }

    // ORGANIZATION REGISTER — Step 2: verify OTP + create user + create org
    // POST /api/auth/org-register-confirm
    public record OrgRegisterConfirmRequest(
        string Email,
        string Code,
        string OrgName,
        string? Website,
        string? Description
    );

    [HttpPost("org-register-confirm")]
    [AllowAnonymous]
    public async Task<IActionResult> OrgRegisterConfirm(OrgRegisterConfirmRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();

        var (user, error) = await VerifyAndCreateUser(email, (req.Code ?? "").Trim(), "OrgAdmin");
        if (error != null) return BadRequest(error);

        var orgName = (req.OrgName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(orgName))
            return BadRequest("Organization name is required.");

        var slug = await EnsureUniqueOrgSlug(Slugify(orgName));

        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = orgName,
            Slug = slug,
            Website = string.IsNullOrWhiteSpace(req.Website) ? null : req.Website.Trim(),
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            PrimaryColor = "#7c3aed",
            InviteCode = GenerateCode(10, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"),
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Organizations.Add(org);

        user!.OrganizationId = org.Id;
        await _userManager.UpdateAsync(user);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            message = "Organization account created. You can login now.",
            orgName = org.Name,
            orgSlug = org.Slug
        });
    }

    // =========================================================
    // INSTRUCTOR REGISTER — Step 1: send OTP
    // POST /api/auth/instructor-register-start
    // =========================================================
    public record InstructorRegisterStartRequest(
        string Email,
        string Password,
        string Phone,
        string AcademySlug
    );

    [HttpPost("instructor-register-start")]
    [AllowAnonymous]
    public async Task<IActionResult> InstructorRegisterStart(InstructorRegisterStartRequest req)
    {
        var academy = await GetActiveAcademy(req.AcademySlug);
        if (academy is null) return BadRequest("Academy not found. Check your registration link.");
        if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

        return await StartPendingRegistration(req.Email, req.Password, req.Phone, "Instructor");
    }

    // INSTRUCTOR REGISTER — Step 2: verify OTP + create user + link to academy
    // POST /api/auth/instructor-register-confirm
    public record InstructorRegisterConfirmRequest(
        string Email,
        string Code,
        string AcademySlug,
        string? DisplayName
    );

    [HttpPost("instructor-register-confirm")]
    [AllowAnonymous]
    public async Task<IActionResult> InstructorRegisterConfirm(InstructorRegisterConfirmRequest req)
    {
        var academy = await GetActiveAcademy(req.AcademySlug);
        if (academy is null) return BadRequest("Academy not found.");
        if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var (user, error) = await VerifyAndCreateUser(email, (req.Code ?? "").Trim(), "Instructor");
        if (error != null) return BadRequest(error);

        // Link instructor → academy + org
        user!.AcademyId = academy.Id;
        user.OrganizationId = academy.OrganizationId;

        if (!string.IsNullOrWhiteSpace(req.DisplayName))
            user.DisplayName = req.DisplayName.Trim();

        await _userManager.UpdateAsync(user);

        return Ok(new { message = "Instructor account created. You can login now." });
    }

    // =========================================================
    // STUDENT REGISTER — Step 1
    // POST /api/auth/register-start  (legacy — now only for students)
    // =========================================================
    public record RegisterStartRequest(string Email, string Password, string Role, string Phone);

    [HttpPost("register-start")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterStart(RegisterStartRequest req)
    {
        var role = string.IsNullOrWhiteSpace(req.Role) ? "Student" : req.Role.Trim();

        if (role is "OrgAdmin" or "Instructor")
            return BadRequest(role == "OrgAdmin"
                ? "Use /api/auth/org-register-start to register as an organization."
                : "Use /api/auth/instructor-register-start to register as an instructor.");

        if (role != "Student")
            return BadRequest("Invalid role.");

        return await StartPendingRegistration(req.Email, req.Password, req.Phone, role);
    }

    // STUDENT REGISTER — Step 2
    public record RegisterConfirmRequest(string Email, string Code);

    [HttpPost("register-confirm")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterConfirm(RegisterConfirmRequest req)
    {
        var (_, error) = await VerifyAndCreateUser(
            (req.Email ?? "").Trim().ToLowerInvariant(),
            (req.Code ?? "").Trim(),
            null);

        if (error != null) return BadRequest(error);
        return Ok(new { message = "Account verified and created. You can login now." });
    }

    // =========================================================
    // SHARED HELPERS
    // =========================================================

    private async Task<IActionResult> StartPendingRegistration(
        string rawEmail, string password, string phone, string role)
    {
        var email = (rawEmail ?? "").Trim().ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            return BadRequest("Valid email is required.");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
            return BadRequest("Password must be at least 6 characters.");
        if (!await _db.Roles.AnyAsync(r => r.Name == role))
            return BadRequest($"Role '{role}' does not exist on the server.");

        var normalizedPhone = NormalizeToE164(phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
            return BadRequest("Phone must be a valid number (e.g. +353851234567).");

        var exists = await _userManager.FindByEmailAsync(email);
        if (exists != null) return Conflict("Email already registered. Please login.");

        var pending = await _db.PendingRegistrations.FirstOrDefaultAsync(x => x.Email == email);
        if (pending?.LastSentAt != null && pending.LastSentAt > DateTimeOffset.UtcNow.AddSeconds(-30))
            return BadRequest("Please wait 30 seconds before requesting a new code.");

        var code   = GenerateCode(6);
        var secret = _config["Otp:Secret"] ?? throw new Exception("Otp:Secret missing");
        var hash   = HashCode(code, email, secret);
        var tempUser = new ApplicationUser { Email = email, UserName = email };

        if (pending == null)
        {
            _db.PendingRegistrations.Add(new PendingRegistration
            {
                Email = email, Role = role, Phone = normalizedPhone,
                PasswordHash = _passwordHasher.HashPassword(tempUser, password),
                CodeHash = hash, ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
                Attempts = 0, LastSentAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            pending.Role = role; pending.Phone = normalizedPhone;
            pending.PasswordHash = _passwordHasher.HashPassword(tempUser, password);
            pending.CodeHash = hash; pending.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10);
            pending.Attempts = 0; pending.LastSentAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();

        try
        {
            await _sms.SendAsync(normalizedPhone, $"Alef verification code: {code}. Expires in 10 minutes.");
            return Ok(new { email, expiresInSeconds = 600 });
        }
        catch (Exception ex)
        {
            Console.WriteLine("SMS send failed: " + ex);
            if (_env.IsDevelopment() && _smsOpt.EnableDevFallback)
                return Ok(new { email, expiresInSeconds = 600, devNote = "SMS failed. Code below (dev only).", code });

            return StatusCode(500, "Failed to send verification SMS. Please try again.");
        }
    }

    /// <summary>Verify OTP, create Identity user, add role, remove pending record.</summary>
    private async Task<(ApplicationUser? user, string? error)> VerifyAndCreateUser(
        string email, string code, string? expectedRole)
    {
        var pending = await _db.PendingRegistrations.FirstOrDefaultAsync(x => x.Email == email);
        if (pending == null) return (null, "No pending registration. Please request a new code.");
        if (pending.ExpiresAt < DateTimeOffset.UtcNow) return (null, "Code expired. Please request a new code.");
        if (pending.Attempts >= 5) return (null, "Too many attempts. Please request a new code.");

        var secret = _config["Otp:Secret"] ?? throw new Exception("Otp:Secret missing");
        if (HashCode(code, email, secret) != pending.CodeHash)
        {
            pending.Attempts++;
            await _db.SaveChangesAsync();
            return (null, "Invalid code.");
        }

        var role = string.IsNullOrWhiteSpace(pending.Role) ? "Student" : pending.Role.Trim();
        if (expectedRole != null && role != expectedRole)
            return (null, "Role mismatch. Please request a new code.");

        if (!await _db.Roles.AnyAsync(r => r.Name == role))
            return (null, $"Role '{role}' does not exist on the server.");

        var user = new ApplicationUser
        {
            Email = email, UserName = email,
            EmailConfirmed = true, PhoneNumber = pending.Phone,
            PasswordHash = pending.PasswordHash
        };

        var result = await _userManager.CreateAsync(user);
        if (!result.Succeeded)
            return (null, string.Join(", ", result.Errors.Select(e => e.Description)));

        await _userManager.AddToRoleAsync(user, role);

        _db.PendingRegistrations.Remove(pending);
        await _db.SaveChangesAsync();

        return (user, null);
    }

    private async Task<dynamic?> GetActiveAcademy(string slug)
    {
        return await _db.Academies
            .AsNoTracking()
            .Where(a => a.Slug == slug && !a.IsHidden)
            .Select(a => new
            {
                a.Id,
                a.OrganizationId,
                OrgIsActive = a.Organization != null && a.Organization.IsActive
            })
            .FirstOrDefaultAsync();
    }

    private async Task<string> CreateJwt(ApplicationUser user)
    {
        var jwtKey      = _config["Jwt:Key"]      ?? throw new Exception("Jwt:Key missing");
        var jwtIssuer   = _config["Jwt:Issuer"]   ?? "LearningPlatform";
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

        // Embed academy + org IDs so frontend doesn't need an extra call
        if (user.AcademyId.HasValue)
            claims.Add(new Claim("academyId", user.AcademyId.Value.ToString()));
        if (user.OrganizationId.HasValue)
            claims.Add(new Claim("organizationId", user.OrganizationId.Value.ToString()));

        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer, audience: jwtAudience, claims: claims,
            expires: DateTime.UtcNow.AddHours(6),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateCode(int length, string? charset = null)
    {
        if (charset == null)
        {
            // numeric OTP
            return RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        }
        var bytes = new byte[length];
        RandomNumberGenerator.Fill(bytes);
        return new string(bytes.Select(b => charset[b % charset.Length]).ToArray());
    }

    private static string HashCode(string code, string email, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToBase64String(
            hmac.ComputeHash(Encoding.UTF8.GetBytes($"{email.ToLowerInvariant()}:{code}")));
    }

    private static string Slugify(string input)
    {
        input = input.Trim().ToLowerInvariant();
        var sb = new StringBuilder();
        foreach (var ch in input)
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(ch);
            else if (char.IsWhiteSpace(ch) || ch == '-' || ch == '_') sb.Append('-');
        }
        var slug = sb.ToString();
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        return slug.Trim('-') is { Length: > 0 } s ? s : "org";
    }

    private async Task<string> EnsureUniqueOrgSlug(string baseSlug)
    {
        var slug = baseSlug; var i = 1;
        while (await _db.Organizations.AnyAsync(o => o.Slug == slug))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    private static string NormalizeToE164(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return "";
        var p = input.Trim().Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "");
        if (p.StartsWith("00")) p = "+" + p[2..];
        if (p.StartsWith("+") && p.Length >= 8)
        {
            if (p.StartsWith("+9660")) p = "+966" + p[5..];
            return p;
        }
        if (p.StartsWith("05") && p.Length >= 9) return "+966" + p[1..];
        if (p.StartsWith("5")  && p.Length is >= 8 and <= 10) return "+966" + p;
        if (p.StartsWith("966") && p.Length >= 11) return p.StartsWith("9660") ? "+966" + p[4..] : "+" + p;
        if (p.StartsWith("353") && p.Length >= 11) return "+" + p;
        if (p.StartsWith("08")  && p.Length >= 9)  return "+353" + p[1..];
        return "";
    }

    [HttpPost("sms-test")]
    [AllowAnonymous]
    public async Task<IActionResult> SmsTest([FromBody] string phone)
    {
        try
        {
            var to = NormalizeToE164(phone);
            if (string.IsNullOrWhiteSpace(to)) return BadRequest("Invalid phone.");
            await _sms.SendAsync(to, "Alef SMS test ✅");
            return Ok("sent");
        }
        catch (Exception ex) { return BadRequest("SMS failed: " + ex.Message); }
    }

    public record StudentRegisterStartRequest(
    string Email,
    string Password,
    string Phone,
    string AcademySlug  // used to validate the academy exists
);

[HttpPost("student-register-start")]
[AllowAnonymous]
public async Task<IActionResult> StudentRegisterStart(StudentRegisterStartRequest req)
{
    // Validate academy exists and is active
    var academy = await GetActiveAcademy(req.AcademySlug);
    if (academy is null) return BadRequest("Academy not found. Check your registration link.");
    if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

    return await StartPendingRegistration(req.Email, req.Password, req.Phone, "Student");
}

// =========================================================
// STUDENT REGISTER — Step 2: verify OTP + create user + link to academy
// POST /api/auth/student-register-confirm
// =========================================================
public record StudentRegisterConfirmRequest(
    string Email,
    string Code,
    string AcademySlug,
    string? DisplayName
);

[HttpPost("student-register-confirm")]
[AllowAnonymous]
public async Task<IActionResult> StudentRegisterConfirm(StudentRegisterConfirmRequest req)
{
    var academy = await GetActiveAcademy(req.AcademySlug);
    if (academy is null) return BadRequest("Academy not found.");
    if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

    var email = (req.Email ?? "").Trim().ToLowerInvariant();
    var (user, error) = await VerifyAndCreateUser(email, (req.Code ?? "").Trim(), "Student");
    if (error != null) return BadRequest(error);

    // Link student → academy + org (same pattern as instructor)
    user!.AcademyId = academy.Id;
    user.OrganizationId = academy.OrganizationId;

    if (!string.IsNullOrWhiteSpace(req.DisplayName))
        user.DisplayName = req.DisplayName.Trim();

    await _userManager.UpdateAsync(user);

    return Ok(new { message = "Student account created. You can login now." });
}
}