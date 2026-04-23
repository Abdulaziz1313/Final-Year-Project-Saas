using System.Security.Claims;
using System.Text;
using System.Text.Json;
using LearningPlatform.Api.Services;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using LearningPlatform.Application.Common.Interfaces;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/orgs")]
public class OrgController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IEmailSender _email;
    private readonly IConfiguration _config;

    public OrgController(
        AppDbContext db,
        UserManager<ApplicationUser> users,
        IEmailSender email,
        IConfiguration config)
    {
        _db = db;
        _users = users;
        _email = email;
        _config = config;
    }

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    private async Task<Guid?> GetMyOrgId(string userId) =>
        await _users.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.OrganizationId)
            .FirstOrDefaultAsync();

    public record CreateInstructorRequest(
        Guid AcademyId,
        string Email,
        string TempPassword,
        string? DisplayName,
        bool SendEmail = false
    );

    [HttpPost("instructors")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> CreateInstructor([FromBody] CreateInstructorRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("Create an organization first.");

        if (req.AcademyId == Guid.Empty) return BadRequest("AcademyId is required.");

        var academy = await _db.Academies
            .AsNoTracking()
            .Where(a => a.Id == req.AcademyId && a.OrganizationId == orgId.Value)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.OrganizationId,
                OrgIsActive = a.Organization != null && a.Organization.IsActive
            })
            .FirstOrDefaultAsync();

        if (academy is null) return BadRequest("Academy not found for your organization.");
        if (!academy.OrgIsActive) return BadRequest("Your organization is inactive.");

        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
            return BadRequest("Valid instructor email is required.");

        if (string.IsNullOrWhiteSpace(req.TempPassword) || req.TempPassword.Length < 6)
            return BadRequest("TempPassword must be at least 6 characters.");

        var exists = await _users.FindByEmailAsync(email);
        if (exists != null) return Conflict("This email is already registered.");

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? null : req.DisplayName.Trim(),
            OrganizationId = academy.OrganizationId,
            AcademyId = academy.Id,
            MustChangePassword = true
        };

        var created = await _users.CreateAsync(user, req.TempPassword);
        if (!created.Succeeded)
            return BadRequest(string.Join(", ", created.Errors.Select(e => e.Description)));

        var roleAdd = await _users.AddToRoleAsync(user, "Instructor");
        if (!roleAdd.Succeeded)
            return BadRequest(string.Join(", ", roleAdd.Errors.Select(e => e.Description)));

        if (req.SendEmail)
        {
            var feBase = _config["Frontend:BaseUrl"] ?? "http://localhost:4201/#";
            var loginUrl = $"{feBase}/login-instructor?academy={Uri.EscapeDataString(academy.Slug)}";

            var subject = $"Your instructor account — {academy.Name} on Alef";
            var safePass = System.Net.WebUtility.HtmlEncode(req.TempPassword);

            var html = $@"
<div style='font-family:Arial,sans-serif;line-height:1.6'>
  <h2>Instructor account created</h2>
  <p>Your organization admin created an instructor account for <b>{System.Net.WebUtility.HtmlEncode(academy.Name)}</b>.</p>
  <p>
    <b>Email:</b> {System.Net.WebUtility.HtmlEncode(email)}<br/>
    <b>Temporary password:</b> {safePass}
  </p>
  <p><b>Important:</b> On your first login, you will be required to change your password.</p>
  <p>
    <a href='{loginUrl}' style='display:inline-block;padding:10px 16px;background:#0a0f1e;color:#fff;text-decoration:none;border-radius:10px'>
      Sign in
    </a>
  </p>
  <p style='color:#6b7280;font-size:12px'>If you didn’t expect this email, contact your organization admin.</p>
</div>";

            await _email.SendAsync(email, subject, html);
        }

        return Ok(new
        {
            id = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            academyId = user.AcademyId,
            academyName = academy.Name,
            mustChangePassword = user.MustChangePassword,
            message = "Instructor created successfully."
        });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMyOrg()
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var u = await _users.Users.AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new { x.Id, x.OrganizationId })
            .FirstOrDefaultAsync();

        if (u is null) return Unauthorized();
        if (u.OrganizationId is null) return Ok(new { userId = u.Id, organization = (object?)null });

        var org = await _db.Organizations.AsNoTracking()
            .Where(o => o.Id == u.OrganizationId.Value)
            .Select(o => new
            {
                o.Id,
                o.Name,
                o.Slug,
                o.Website,
                o.PrimaryColor,
                o.Description,
                o.LogoUrl,
                o.CreatedAt,
                o.IsActive
            })
            .FirstOrDefaultAsync();

        if (org is null)
        {
            var user = await _users.FindByIdAsync(userId);
            if (user != null)
            {
                user.OrganizationId = null;
                await _users.UpdateAsync(user);
            }

            return Ok(new { userId = u.Id, organization = (object?)null });
        }

        return Ok(new { userId = u.Id, organization = org });
    }

    public record CreateOrgRequest(
        string Name,
        string? Website,
        string? Description,
        string? PrimaryColor,
        string? LogoUrl
    );

    [HttpPost]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> CreateOrg([FromBody] CreateOrgRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _users.FindByIdAsync(userId);
        if (user is null) return Unauthorized();
        if (user.OrganizationId != null) return BadRequest("You already belong to an organization.");

        var name = (req.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Organization name is required.");

        var slug = await EnsureUniqueOrgSlug(Slugify(name));
        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = slug,
            Website = NullIfEmpty(req.Website),
            Description = NullIfEmpty(req.Description),
            LogoUrl = NullIfEmpty(req.LogoUrl),
            PrimaryColor = NullIfEmpty(req.PrimaryColor) ?? "#7c3aed",
            InviteCode = GenerateInviteCode(10),
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Organizations.Add(org);
        user.OrganizationId = org.Id;
        await _users.UpdateAsync(user);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            org.Id,
            org.Name,
            org.Slug,
            org.Website,
            org.PrimaryColor,
            org.Description,
            org.LogoUrl,
            org.InviteCode,
            org.CreatedAt,
            org.IsActive
        });
    }

    [HttpGet("academies")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> ListAcademies()
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("You don't have an organization yet. Create one first.");

        var academies = await _db.Academies
            .AsNoTracking()
            .Where(a => a.OrganizationId == orgId.Value)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.Description,
                a.Website,
                a.LogoUrl,
                a.BannerUrl,
                a.PrimaryColor,
                a.FontKey,
                a.BrandingJson,
                a.LayoutJson,
                a.IsPublished,
                a.IsHidden,
                a.HiddenReason,
                a.HiddenAt,
                a.CreatedAt,
                a.PublishedAt,
                CourseCount = _db.Courses.Count(c => c.AcademyId == a.Id),
                InstructorCount = _db.Users.Count(u => u.AcademyId == a.Id && u.OrganizationId == a.OrganizationId)
            })
            .ToListAsync();

        return Ok(academies);
    }

    public record CreateOrgAcademyRequest(
        string Name,
        string? Description,
        string? Website,
        string? PrimaryColor,
        string? LogoUrl,
        string? FontKey,
        string? BrandingJson,
        string? LayoutJson,
        string? ThemeMode,
        string? AccentStyle,
        string? Tagline,
        string? Category,
        string? ContactEmail,
        string? SupportLabel,
        string? WelcomeTitle,
        string? CtaPrimaryText,
        string? CtaSecondaryText,
        string? NavLabelPrimary,
        string? NavLabelSecondary,
        string? FooterText,
        string? HeroLayout,
        string? SurfaceStyle,
        string? RadiusKey,
        bool? ShowStats,
        bool? ShowTestimonials
    );

    public record UpdateAcademyRequest(
        string Name,
        string Slug,
        string? Description,
        string? Website,
        string? PrimaryColor,
        string? FontKey,
        string? BrandingJson,
        string? LayoutJson
    );

    [HttpPost("academies")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> CreateAcademy([FromBody] CreateOrgAcademyRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("You don't have an organization yet. Create one first.");

        var name = (req.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Academy name is required.");

        var baseSlug = Slugify(name);
        var slug = baseSlug;
        var i = 1;
        while (await _db.Academies.AnyAsync(a => a.Slug == slug))
            slug = $"{baseSlug}-{++i}";

        var brandingJson = BuildBrandingJson(req);
        var layoutJson = BuildLayoutJson(req);

        var academy = new Academy
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Name = name,
            Slug = slug,
            Description = NullIfEmpty(req.Description),
            Website = NullIfEmpty(req.Website),
            PrimaryColor = NullIfEmpty(req.PrimaryColor) ?? "#7c3aed",
            LogoUrl = NullIfEmpty(req.LogoUrl),
            FontKey = NormalizeFontKey(req.FontKey),
            BrandingJson = brandingJson,
            LayoutJson = layoutJson,
            OwnerUserId = userId,
            IsPublished = false,
            PublishedAt = null,
            IsHidden = false,
            HiddenReason = null,
            HiddenAt = null,
            HiddenByUserId = null,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Academies.Add(academy);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            academy.Id,
            academy.Name,
            academy.Slug,
            academy.OrganizationId,
            academy.Description,
            academy.Website,
            academy.PrimaryColor,
            academy.LogoUrl,
            academy.BannerUrl,
            academy.FontKey,
            academy.BrandingJson,
            academy.LayoutJson,
            academy.IsPublished,
            academy.IsHidden,
            academy.HiddenReason,
            academy.HiddenAt,
            academy.CreatedAt
        });
    }

    [HttpGet("academies/{academyId:guid}")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> GetAcademy(Guid academyId)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("You don't have an organization.");

        var a = await _db.Academies
            .AsNoTracking()
            .Where(x => x.Id == academyId && x.OrganizationId == orgId.Value)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Slug,
                x.Description,
                x.Website,
                x.PrimaryColor,
                x.LogoUrl,
                x.BannerUrl,
                x.FontKey,
                x.BrandingJson,
                x.LayoutJson,
                x.IsPublished,
                x.IsHidden,
                x.HiddenReason,
                x.HiddenAt,
                x.CreatedAt,
                x.PublishedAt,
                CourseCount = _db.Courses.Count(c => c.AcademyId == x.Id),
                InstructorCount = _db.Users.Count(u => u.AcademyId == x.Id && u.OrganizationId == x.OrganizationId)
            })
            .FirstOrDefaultAsync();

        if (a is null) return NotFound();
        return Ok(a);
    }

    [HttpPut("academies/{academyId:guid}")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> UpdateAcademy(Guid academyId, [FromBody] UpdateAcademyRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("You don't have an organization.");

        var academy = await _db.Academies
            .FirstOrDefaultAsync(a => a.Id == academyId && a.OrganizationId == orgId.Value);

        if (academy is null) return NotFound();

        var name = (req.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest("Academy name is required.");

        var slug = Slugify(req.Slug ?? "");
        if (string.IsNullOrWhiteSpace(slug))
            return BadRequest("Academy slug is required.");

        var slugTaken = await _db.Academies
            .AsNoTracking()
            .AnyAsync(a => a.Id != academyId && a.Slug == slug);

        if (slugTaken)
            return BadRequest("This academy slug is already in use.");

        academy.Name = name;
        academy.Slug = slug;
        academy.Description = NullIfEmpty(req.Description);
        academy.Website = NullIfEmpty(req.Website);
        academy.PrimaryColor = NullIfEmpty(req.PrimaryColor) ?? academy.PrimaryColor;
        academy.FontKey = NormalizeFontKey(req.FontKey);

        if (req.BrandingJson != null)
            academy.BrandingJson = NormalizeJson(req.BrandingJson);

        if (req.LayoutJson != null)
            academy.LayoutJson = NormalizeJson(req.LayoutJson);

        await _db.SaveChangesAsync();

        var result = await _db.Academies
            .AsNoTracking()
            .Where(x => x.Id == academyId)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Slug,
                x.Description,
                x.Website,
                x.PrimaryColor,
                x.LogoUrl,
                x.BannerUrl,
                x.FontKey,
                x.BrandingJson,
                x.LayoutJson,
                x.IsPublished,
                x.IsHidden,
                x.HiddenReason,
                x.HiddenAt,
                x.CreatedAt,
                x.PublishedAt,
                CourseCount = _db.Courses.Count(c => c.AcademyId == x.Id),
                InstructorCount = _db.Users.Count(u => u.AcademyId == x.Id && u.OrganizationId == x.OrganizationId)
            })
            .FirstAsync();

        return Ok(result);
    }

    [HttpGet("invite-code")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> GetInviteCode()
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("Create an organization first.");

        var org = await _db.Organizations.AsNoTracking()
            .Where(o => o.Id == orgId.Value)
            .Select(o => new { o.Id, o.InviteCode, o.IsActive })
            .FirstOrDefaultAsync();

        if (org is null) return NotFound();
        return Ok(new { organizationId = org.Id, inviteCode = org.InviteCode, isActive = org.IsActive });
    }

    [HttpPost("invite-code/rotate")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> RotateInviteCode()
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("Create an organization first.");

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId.Value);
        if (org is null) return NotFound();

        org.InviteCode = GenerateInviteCode(10);
        await _db.SaveChangesAsync();

        return Ok(new { organizationId = org.Id, inviteCode = org.InviteCode, isActive = org.IsActive });
    }

    [HttpGet("members")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> ListMembers([FromQuery] string? q = null, [FromQuery] string? role = null)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("Create an organization first.");

        var baseQuery = _users.Users.AsNoTracking()
            .Where(u => u.OrganizationId == orgId);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var qq = q.Trim().ToLowerInvariant();
            baseQuery = baseQuery.Where(u =>
                (u.Email != null && u.Email.ToLower().Contains(qq)) ||
                (u.DisplayName != null && u.DisplayName.ToLower().Contains(qq)));
        }

        var users = await baseQuery
            .OrderBy(u => u.Email)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.PhoneNumber,
                u.AcademyId,
                u.LockoutEnd,
                u.MustChangePassword
            })
            .ToListAsync();

        var userIds = users.Select(x => x.Id).ToList();
        if (userIds.Count == 0) return Ok(new { items = Array.Empty<object>() });

        var roleRows = await (
            from ur in _db.UserRoles
            join r in _db.Roles on ur.RoleId equals r.Id
            where userIds.Contains(ur.UserId)
            select new { ur.UserId, RoleName = r.Name }
        ).ToListAsync();

        var roleMap = roleRows
            .GroupBy(x => x.UserId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.RoleName!).Distinct().ToList());

        var academyIds = users.Where(u => u.AcademyId.HasValue).Select(u => u.AcademyId!.Value).Distinct().ToList();
        var academyNames = await _db.Academies.AsNoTracking()
            .Where(a => academyIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, a => a.Name);

        var wantRole = string.IsNullOrWhiteSpace(role) ? null : role.Trim();
        var items = new List<object>();

        foreach (var u in users)
        {
            roleMap.TryGetValue(u.Id, out var roles);
            roles ??= new List<string>();

            if (wantRole != null && !roles.Contains(wantRole)) continue;

            items.Add(new
            {
                id = u.Id,
                email = u.Email,
                displayName = u.DisplayName,
                phoneNumber = u.PhoneNumber,
                roles,
                lockoutEnd = u.LockoutEnd,
                academyId = u.AcademyId,
                academyName = u.AcademyId.HasValue && academyNames.TryGetValue(u.AcademyId.Value, out var n) ? n : null,
                mustChangePassword = u.MustChangePassword
            });
        }

        return Ok(new { items });
    }

    public record OrgPublishRequest(bool IsPublished);

    [HttpPatch("academies/{academyId:guid}/publish")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> PublishAcademy(Guid academyId, [FromBody] OrgPublishRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("No organization found.");

        var academy = await _db.Academies
            .FirstOrDefaultAsync(a => a.Id == academyId && a.OrganizationId == orgId.Value);

        if (academy is null) return NotFound();
        if (academy.IsHidden) return BadRequest("Academy is hidden by admin and cannot be published.");

        academy.IsPublished = req.IsPublished;
        if (req.IsPublished && academy.PublishedAt is null)
            academy.PublishedAt = DateTimeOffset.UtcNow;
        if (!req.IsPublished)
            academy.PublishedAt = null;

        await _db.SaveChangesAsync();
        return Ok(new { academy.Id, academy.IsPublished, academy.PublishedAt });
    }

    [HttpDelete("academies/{academyId:guid}")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> DeleteAcademy(Guid academyId)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("No organization found.");

        var academy = await _db.Academies
            .FirstOrDefaultAsync(a => a.Id == academyId && a.OrganizationId == orgId.Value);

        if (academy is null) return NotFound();

        _db.Academies.Remove(academy);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("leave")]
    [Authorize]
    public async Task<IActionResult> Leave()
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _users.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        user.OrganizationId = null;
        await _users.UpdateAsync(user);
        return NoContent();
    }

    [HttpGet("public/{slug}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicOrgLanding(string slug)
    {
        slug = (slug ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(slug)) return NotFound();

        var org = await _db.Organizations
            .AsNoTracking()
            .Where(o => o.Slug == slug && o.IsActive)
            .Select(o => new
            {
                o.Id,
                o.Name,
                o.Slug,
                o.LogoUrl,
                o.PrimaryColor,
                o.Description,
                o.Website
            })
            .FirstOrDefaultAsync();

        if (org is null) return NotFound();

        var academies = await _db.Academies
            .AsNoTracking()
            .Where(a =>
                a.OrganizationId == org.Id &&
                a.IsPublished &&
                !a.IsHidden)
            .OrderByDescending(a => a.PublishedAt ?? a.CreatedAt)
            .ThenBy(a => a.Name)
            .Take(3)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.Description,
                a.LogoUrl,
                a.BannerUrl,
                a.PrimaryColor,
                a.FontKey,
                a.BrandingJson,
                a.LayoutJson,
                CourseCount = _db.Courses.Count(c => c.AcademyId == a.Id && !c.IsHidden)
            })
            .ToListAsync();

        return Ok(new
        {
            org.Id,
            org.Name,
            org.Slug,
            org.LogoUrl,
            PrimaryColor = string.IsNullOrWhiteSpace(org.PrimaryColor) ? "#1a56db" : org.PrimaryColor,
            org.Description,
            org.Website,
            academies
        });
    }

    private static string GenerateInviteCode(int length)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var bytes = new byte[length];
        System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
        return new string(bytes.Select(b => chars[b % chars.Length]).ToArray());
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

    private static string? NullIfEmpty(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string NormalizeFontKey(string? fontKey)
    {
        var fk = (fontKey ?? "system").Trim().ToLowerInvariant();
        var allowed = new HashSet<string>
        {
            "system", "inter", "poppins", "cairo", "tajawal", "ibmplexar", "custom"
        };

        return allowed.Contains(fk) ? fk : "system";
    }

    private static string NormalizeJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return "{}";

        var trimmed = json.Trim();
        return trimmed.Length == 0 ? "{}" : trimmed;
    }

    private static string BuildBrandingJson(CreateOrgAcademyRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.BrandingJson))
            return NormalizeJson(req.BrandingJson);

        var payload = new Dictionary<string, object?>
        {
            ["themeMode"] = NullIfEmpty(req.ThemeMode) ?? "light",
            ["accentStyle"] = NullIfEmpty(req.AccentStyle) ?? "solid",
            ["tagline"] = NullIfEmpty(req.Tagline),
            ["category"] = NullIfEmpty(req.Category) ?? "General",
            ["contactEmail"] = NullIfEmpty(req.ContactEmail),
            ["supportLabel"] = NullIfEmpty(req.SupportLabel) ?? "Contact us",
            ["welcomeTitle"] = NullIfEmpty(req.WelcomeTitle),
            ["ctaPrimaryText"] = NullIfEmpty(req.CtaPrimaryText) ?? "Browse courses",
            ["ctaSecondaryText"] = NullIfEmpty(req.CtaSecondaryText) ?? "Contact",
            ["navLabelPrimary"] = NullIfEmpty(req.NavLabelPrimary) ?? "Explore",
            ["navLabelSecondary"] = NullIfEmpty(req.NavLabelSecondary) ?? "About",
            ["footerText"] = NullIfEmpty(req.FooterText) ?? "Links · Contact · Terms",
            ["showStats"] = req.ShowStats ?? true,
            ["showTestimonials"] = req.ShowTestimonials ?? true
        };

        return JsonSerializer.Serialize(payload);
    }

    private static string BuildLayoutJson(CreateOrgAcademyRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.LayoutJson))
            return NormalizeJson(req.LayoutJson);

        var payload = new Dictionary<string, object?>
        {
            ["heroLayout"] = NullIfEmpty(req.HeroLayout) ?? "split",
            ["surfaceStyle"] = NullIfEmpty(req.SurfaceStyle) ?? "soft",
            ["radiusKey"] = NullIfEmpty(req.RadiusKey) ?? "rounded"
        };

        return JsonSerializer.Serialize(payload);
    }
}