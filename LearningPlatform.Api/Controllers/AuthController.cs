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
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using LearningPlatform.Application.Common.Interfaces;
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
    private readonly IEmailSender _email;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        ISmsSender sms,
        SmsOptions smsOpt,
        IPasswordHasher<ApplicationUser> passwordHasher,
        IConfiguration config,
        IWebHostEnvironment env,
        IEmailSender email)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _db = db;
        _sms = sms;
        _smsOpt = smsOpt;
        _passwordHasher = passwordHasher;
        _config = config;
        _env = env;
        _email = email;
    }

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

        var isAdmin = await _userManager.IsInRoleAsync(user, "Admin");
        var isOrgAdmin = await _userManager.IsInRoleAsync(user, "OrgAdmin");

        if (!isAdmin && !isOrgAdmin)
            return Unauthorized("This sign-in page is for admins and organizations only. Please use academy sign-in for students/instructors.");

        if (isOrgAdmin)
        {
            if (!user.OrganizationId.HasValue)
                return Unauthorized("This account is not linked to an organization.");

            var orgIsActive = await _db.Organizations
                .AsNoTracking()
                .Where(o => o.Id == user.OrganizationId.Value)
                .Select(o => o.IsActive)
                .FirstOrDefaultAsync();

            if (!orgIsActive)
                return Unauthorized("Your organization is currently inactive. Please contact support.");
        }

        var token = await CreateJwt(user);
        return Ok(new { accessToken = token });
    }

    public record ForgotPasswordRequest(string Email, string? AcademySlug);

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
            return BadRequest("Valid email is required.");

        string? academyName = null;
        string? academySlug = string.IsNullOrWhiteSpace(req.AcademySlug) ? null : req.AcademySlug.Trim();

        if (!string.IsNullOrWhiteSpace(academySlug))
        {
            var academy = await _db.Academies
                .AsNoTracking()
                .Where(a => a.Slug == academySlug && !a.IsHidden)
                .Select(a => new
                {
                    a.Name,
                    OrgIsActive = a.Organization != null && a.Organization.IsActive
                })
                .FirstOrDefaultAsync();

            if (academy != null && academy.OrgIsActive)
                academyName = academy.Name;
        }

        var user = await _userManager.FindByEmailAsync(email);

        if (user == null || !(await _userManager.IsEmailConfirmedAsync(user)))
            return Ok(new { message = "If the email exists, a reset link has been sent." });

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var tokenBytes = Encoding.UTF8.GetBytes(token);
        var tokenB64 = WebEncoders.Base64UrlEncode(tokenBytes);

        var feBase = _config["Frontend:BaseUrl"] ?? "http://localhost:4201/#";

        var qs = new Dictionary<string, string?>
        {
            ["email"] = email,
            ["token"] = tokenB64,
        };

        if (!string.IsNullOrWhiteSpace(academySlug))
            qs["academy"] = academySlug;

        var query = string.Join("&", qs
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"));

        var resetUrl = $"{feBase}/reset-password?{query}";

        var subject = academyName != null
            ? $"Reset your password — {academyName} on Alef"
            : "Reset your password — Alef";

        var html = $@"
<div style='font-family:Arial,sans-serif;line-height:1.6'>
  <h2>Password reset</h2>
  <p>We received a request to reset your password{(academyName != null ? $" for <b>{academyName}</b>" : "")}.</p>
  <p>
    <a href='{resetUrl}' style='display:inline-block;padding:10px 16px;background:#0a0f1e;color:#fff;text-decoration:none;border-radius:10px'>
      Reset password
    </a>
  </p>
  <p>If you didn’t request this, you can ignore this email.</p>
  <p style='color:#6b7280;font-size:12px'>This link may expire or be used once.</p>
</div>";

        await _email.SendAsync(email, subject, html);

        return Ok(new { message = "If the email exists, a reset link has been sent." });
    }

    public record ResetPasswordRequest(string Email, string Token, string NewPassword);

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
            return BadRequest("Valid email is required.");

        if (string.IsNullOrWhiteSpace(req.Token))
            return BadRequest("Token is required.");

        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest("Password must be at least 6 characters.");

        var user = await _userManager.FindByEmailAsync(email);
        if (user == null)
            return BadRequest("Invalid reset request.");

        string decodedToken;
        try
        {
            var bytes = WebEncoders.Base64UrlDecode(req.Token);
            decodedToken = Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return BadRequest("Invalid token.");
        }

        var result = await _userManager.ResetPasswordAsync(user, decodedToken, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(string.Join(", ", result.Errors.Select(e => e.Description)));

        if (user.MustChangePassword)
        {
            user.MustChangePassword = false;
            await _userManager.UpdateAsync(user);
        }

        return Ok(new { message = "Password updated successfully. You can login now." });
    }

    public record FirstLoginChangePasswordRequest(string CurrentPassword, string NewPassword);

    [HttpPost("first-login-change-password")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> FirstLoginChangePassword(FirstLoginChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CurrentPassword))
            return BadRequest("Current password is required.");

        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest("New password must be at least 6 characters.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        var change = await _userManager.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!change.Succeeded)
            return BadRequest(string.Join(", ", change.Errors.Select(e => e.Description)));

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);

        return Ok(new { message = "Password changed. Please sign in again." });
    }

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
            a.BannerUrl,
            a.Website,
            a.PrimaryColor,
            a.Description,
            a.FontKey,
            a.BrandingJson,
            a.LayoutJson,
            a.IsPublished,
            OrgName = a.Organization != null ? a.Organization.Name : null,
            OrgIsActive = a.Organization != null && a.Organization.IsActive
        })
        .FirstOrDefaultAsync();

    if (academy is null) return NotFound("Academy not found.");
    if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

    return Ok(new
    {
        academy.Id,
        academy.Name,
        academy.Slug,
        academy.LogoUrl,
        academy.BannerUrl,
        academy.Website,
        academy.PrimaryColor,
        academy.Description,
        academy.FontKey,
        BrandingJson = string.IsNullOrWhiteSpace(academy.BrandingJson) ? "{}" : academy.BrandingJson,
        LayoutJson = string.IsNullOrWhiteSpace(academy.LayoutJson) ? "{}" : academy.LayoutJson,
        academy.IsPublished,
        academy.OrgName,
        academy.OrgIsActive
    });
}

    public record OrgRegisterStartRequest(string Email, string Password, string Phone);

    [HttpPost("org-register-start")]
    [AllowAnonymous]
    public async Task<IActionResult> OrgRegisterStart(OrgRegisterStartRequest req)
    {
        return await StartPendingRegistration(req.Email, req.Password, req.Phone, "OrgAdmin");
    }

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

    [HttpPost("instructor-register-start")]
    [AllowAnonymous]
    public IActionResult InstructorRegisterStartDisabled()
        => BadRequest("Instructor self-registration is disabled. Ask your organization admin to create your instructor account.");

    [HttpPost("instructor-register-confirm")]
    [AllowAnonymous]
    public IActionResult InstructorRegisterConfirmDisabled()
        => BadRequest("Instructor self-registration is disabled. Ask your organization admin to create your instructor account.");

    public record LoginInstructorRequest(string Email, string Password, string AcademySlug);

    [HttpPost("login-instructor")]
    [AllowAnonymous]
    public async Task<IActionResult> LoginInstructor(LoginInstructorRequest req)
    {
        var academySlug = (req.AcademySlug ?? "").Trim();
        if (string.IsNullOrWhiteSpace(academySlug))
            return BadRequest("academySlug is required.");

        var academy = await GetActiveAcademy(academySlug);
        if (academy is null) return BadRequest("Academy not found.");
        if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var user = await _userManager.FindByEmailAsync(email);
        if (user is null) return Unauthorized("Incorrect email or password.");

        var ok = await _signInManager.CheckPasswordSignInAsync(user, req.Password, lockoutOnFailure: false);
        if (!ok.Succeeded) return Unauthorized("Incorrect email or password.");

        var isInstructor = await _userManager.IsInRoleAsync(user, "Instructor");
        if (!isInstructor) return Unauthorized("This account is not an instructor account.");

        if (!user.AcademyId.HasValue || user.AcademyId.Value != academy.Id)
            return Unauthorized("This instructor account is not linked to this academy.");

        if (user.OrganizationId.HasValue && user.OrganizationId.Value != academy.OrganizationId)
            return Unauthorized("This instructor account is not linked to this academy.");

        var token = await CreateJwt(user);
        return Ok(new { accessToken = token });
    }

    public record LoginStudentRequest(string Email, string Password, string AcademySlug);

    [HttpPost("login-student")]
    [AllowAnonymous]
    public async Task<IActionResult> LoginStudent(LoginStudentRequest req)
    {
        var academySlug = (req.AcademySlug ?? "").Trim();
        if (string.IsNullOrWhiteSpace(academySlug))
            return BadRequest("academySlug is required.");

        var academy = await GetActiveAcademy(academySlug);
        if (academy is null) return BadRequest("Academy not found.");
        if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var user = await _userManager.FindByEmailAsync(email);
        if (user is null) return Unauthorized("Incorrect email or password.");

        var ok = await _signInManager.CheckPasswordSignInAsync(user, req.Password, lockoutOnFailure: false);
        if (!ok.Succeeded) return Unauthorized("Incorrect email or password.");

        var isStudent = await _userManager.IsInRoleAsync(user, "Student");
        if (!isStudent) return Unauthorized("This account is not a student account.");

        if (!user.AcademyId.HasValue || user.AcademyId.Value != academy.Id)
            return Unauthorized("This student account is not linked to this academy.");

        if (user.OrganizationId.HasValue && user.OrganizationId.Value != academy.OrganizationId)
            return Unauthorized("This student account is not linked to this academy.");

        var token = await CreateJwt(user);
        return Ok(new { accessToken = token });
    }

    public record RegisterStartRequest(string Email, string Password, string Role, string Phone);

    [HttpPost("register-start")]
    [AllowAnonymous]
    public IActionResult RegisterStart(RegisterStartRequest req)
        => BadRequest("This endpoint is deprecated. Use /api/auth/student-register-start to register as a student for an academy.");

    public record RegisterConfirmRequest(string Email, string Code);

    [HttpPost("register-confirm")]
    [AllowAnonymous]
    public IActionResult RegisterConfirm(RegisterConfirmRequest req)
        => BadRequest("This endpoint is deprecated. Use /api/auth/student-register-confirm to complete student registration for an academy.");

    public record StudentRegisterStartRequest(string Email, string Password, string Phone, string AcademySlug);

    [HttpPost("student-register-start")]
    [AllowAnonymous]
    public async Task<IActionResult> StudentRegisterStart(StudentRegisterStartRequest req)
    {
        var academy = await GetActiveAcademy(req.AcademySlug);
        if (academy is null) return BadRequest("Academy not found. Check your registration link.");
        if (!academy.OrgIsActive) return BadRequest("This academy's organization is currently inactive.");

        return await StartPendingRegistration(req.Email, req.Password, req.Phone, "Student");
    }

    public record StudentRegisterConfirmRequest(string Email, string Code, string AcademySlug, string? DisplayName);

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

        user!.AcademyId = academy.Id;
        user.OrganizationId = academy.OrganizationId;

        if (!string.IsNullOrWhiteSpace(req.DisplayName))
            user.DisplayName = req.DisplayName.Trim();

        await _userManager.UpdateAsync(user);

        return Ok(new { message = "Student account created. You can login now." });
    }

    private async Task<IActionResult> StartPendingRegistration(string rawEmail, string password, string phone, string role)
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

        var code = GenerateCode(6);
        var secret = _config["Otp:Secret"] ?? throw new Exception("Otp:Secret missing");
        var hash = HashCode(code, email, secret);
        var tempUser = new ApplicationUser { Email = email, UserName = email };

        if (pending == null)
        {
            _db.PendingRegistrations.Add(new PendingRegistration
            {
                Email = email,
                Role = role,
                Phone = normalizedPhone,
                PasswordHash = _passwordHasher.HashPassword(tempUser, password),
                CodeHash = hash,
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
                Attempts = 0,
                LastSentAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            pending.Role = role;
            pending.Phone = normalizedPhone;
            pending.PasswordHash = _passwordHasher.HashPassword(tempUser, password);
            pending.CodeHash = hash;
            pending.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10);
            pending.Attempts = 0;
            pending.LastSentAt = DateTimeOffset.UtcNow;
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

    private async Task<(ApplicationUser? user, string? error)> VerifyAndCreateUser(string email, string code, string? expectedRole)
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
            Email = email,
            UserName = email,
            EmailConfirmed = true,
            PhoneNumber = pending.Phone,
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
        var jwtKey = _config["Jwt:Key"] ?? throw new Exception("Jwt:Key missing");
        var jwtIssuer = _config["Jwt:Issuer"] ?? "LearningPlatform";
        var jwtAudience = _config["Jwt:Audience"] ?? "LearningPlatform";

        var roles = await _userManager.GetRolesAsync(user);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email ?? ""),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Name, user.Email ?? ""),
            new(ClaimTypes.Email, user.Email ?? "")
        };

        foreach (var r in roles)
            claims.Add(new Claim(ClaimTypes.Role, r));

        if (user.AcademyId.HasValue)
            claims.Add(new Claim("academyId", user.AcademyId.Value.ToString()));

        if (user.OrganizationId.HasValue)
            claims.Add(new Claim("organizationId", user.OrganizationId.Value.ToString()));

        claims.Add(new Claim("mustChangePassword", user.MustChangePassword ? "true" : "false"));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(6),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateCode(int length, string? charset = null)
    {
        if (charset == null)
            return RandomNumberGenerator.GetInt32(100000, 999999).ToString();

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
        var slug = baseSlug;
        var i = 1;
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
        if (p.StartsWith("5") && p.Length is >= 8 and <= 10) return "+966" + p;
        if (p.StartsWith("966") && p.Length >= 11) return p.StartsWith("9660") ? "+966" + p[4..] : "+" + p;
        if (p.StartsWith("353") && p.Length >= 11) return "+" + p;
        if (p.StartsWith("08") && p.Length >= 9) return "+353" + p[1..];
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
        catch (Exception ex)
        {
            return BadRequest("SMS failed: " + ex.Message);
        }
    }
}