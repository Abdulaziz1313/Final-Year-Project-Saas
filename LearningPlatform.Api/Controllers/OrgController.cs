// OrgController.cs
using System.Security.Claims;
using System.Text;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/orgs")]
public class OrgController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;

    public OrgController(AppDbContext db, UserManager<ApplicationUser> users)
    {
        _db = db;
        _users = users;
    }

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    private async Task<Guid?> GetMyOrgId(string userId) =>
        await _users.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.OrganizationId)
            .FirstOrDefaultAsync();

    // =========================================================
    // ME
    // GET /api/orgs/me
    // =========================================================
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
            .Select(o => new { o.Id, o.Name, o.Slug, o.Website, o.PrimaryColor, o.Description, o.LogoUrl, o.CreatedAt, o.IsActive })
            .FirstOrDefaultAsync();

        if (org is null)
        {
            var user = await _users.FindByIdAsync(userId);
            if (user != null) { user.OrganizationId = null; await _users.UpdateAsync(user); }
            return Ok(new { userId = u.Id, organization = (object?)null });
        }

        return Ok(new { userId = u.Id, organization = org });
    }

    // =========================================================
    // ORG ADMIN: CREATE ORG
    // POST /api/orgs
    // =========================================================
    public record CreateOrgRequest(string Name, string? Website, string? Description, string? PrimaryColor, string? LogoUrl);

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
            Name = name, Slug = slug,
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

        return Ok(new { org.Id, org.Name, org.Slug, org.Website, org.PrimaryColor, org.Description, org.LogoUrl, org.InviteCode, org.CreatedAt, org.IsActive });
    }

    // =========================================================
    // ORG ADMIN: ACADEMY MANAGEMENT
    // =========================================================

    // GET /api/orgs/academies  — list all academies belonging to my org
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
                a.Id, a.Name, a.Slug, a.Description, a.LogoUrl,
                a.PrimaryColor, a.IsPublished, a.IsHidden,
                a.CreatedAt, a.PublishedAt,
                CourseCount  = _db.Courses.Count(c => c.AcademyId == a.Id),
                InstructorCount = _db.Users.Count(u => u.AcademyId == a.Id)
            })
            .ToListAsync();

        return Ok(academies);
    }

    // POST /api/orgs/academies  — org admin creates a new academy
    public record CreateAcademyRequest(
        string Name,
        string? Description,
        string? Website,
        string? PrimaryColor,
        string? LogoUrl,
        string? FontKey
    );

    [HttpPost("academies")]
    [Authorize(Roles = "OrgAdmin")]
    public async Task<IActionResult> CreateAcademy([FromBody] CreateAcademyRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrgId(userId);
        if (orgId is null) return BadRequest("You don't have an organization yet. Create one first.");

        var name = (req.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Academy name is required.");

        // Slug must be unique globally across all academies
        var baseSlug = Slugify(name);
        var slug = baseSlug; var i = 1;
        while (await _db.Academies.AnyAsync(a => a.Slug == slug))
            slug = $"{baseSlug}-{++i}";

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
            FontKey = NullIfEmpty(req.FontKey) ?? "system",
            OwnerUserId = userId,        // org admin is the creator/owner
            IsPublished = false,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Academies.Add(academy);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            academy.Id, academy.Name, academy.Slug, academy.OrganizationId,
            academy.Description, academy.Website, academy.PrimaryColor,
            academy.LogoUrl, academy.FontKey, academy.IsPublished, academy.CreatedAt,
            // Share the instructor registration link slug so they can copy it
            instructorRegisterPath = $"/#/register-instructor?academy={academy.Slug}"
        });
    }

    // GET /api/orgs/academies/{academyId}  — get one academy (org admin)
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
                x.Id, x.Name, x.Slug, x.Description, x.Website,
                x.PrimaryColor, x.LogoUrl, x.BannerUrl, x.FontKey,
                x.IsPublished, x.IsHidden, x.HiddenReason,
                x.CreatedAt, x.PublishedAt,
                CourseCount = _db.Courses.Count(c => c.AcademyId == x.Id),
                InstructorCount = _db.Users.Count(u => u.AcademyId == x.Id)
            })
            .FirstOrDefaultAsync();

        if (a is null) return NotFound();
        return Ok(a);
    }

    // =========================================================
    // INVITE CODE (for instructor join — kept but now secondary
    //              to the direct academy-slug-based register flow)
    // =========================================================
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

    // =========================================================
    // MEMBERS
    // GET /api/orgs/members?role=Instructor&q=abc
    // =========================================================
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

        var users = await baseQuery.OrderBy(u => u.Email)
            .Select(u => new { u.Id, u.Email, u.DisplayName, u.PhoneNumber, u.AcademyId, u.LockoutEnd })
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

        // Load academy names for display
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
                academyName = u.AcademyId.HasValue && academyNames.TryGetValue(u.AcademyId.Value, out var n) ? n : null
            });
        }

        return Ok(new { items });
    }

    // =========================================================
    // LEAVE
    // =========================================================
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

    // =========================================================
    // HELPERS
    // =========================================================
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
        var slug = baseSlug; var i = 1;
        while (await _db.Organizations.AnyAsync(o => o.Slug == slug))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    private static string? NullIfEmpty(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();



        // PATCH /api/orgs/academies/{academyId}/publish
[HttpPatch("academies/{academyId:guid}/publish")]
[Authorize(Roles = "OrgAdmin")]
public async Task<IActionResult> PublishAcademy(Guid academyId, [FromBody] PublishRequest req)
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

    await _db.SaveChangesAsync();
    return Ok(new { academy.Id, academy.IsPublished, academy.PublishedAt });
}

public record PublishRequest(bool IsPublished);

// DELETE /api/orgs/academies/{academyId}
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
}