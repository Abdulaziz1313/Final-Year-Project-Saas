// AdminController.cs
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using LearningPlatform.Api.Services;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly RoleManager<IdentityRole> _roles;
    private readonly NotificationWriter _notifs;
    private readonly AdminAuditWriter _audit;

    public AdminController(
        AppDbContext db,
        UserManager<ApplicationUser> users,
        RoleManager<IdentityRole> roles,
        NotificationWriter notifs,
        AdminAuditWriter audit)
    {
        _db = db;
        _users = users;
        _roles = roles;
        _notifs = notifs;
        _audit = audit;
    }

    private string? AdminId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    // ---------------- USERS ----------------

    [HttpGet("users")]
    public async Task<IActionResult> ListUsers(string? q = null, string? role = null, int page = 1, int pageSize = 25)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 25 : pageSize;

        var query = _db.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim().ToLowerInvariant();
            query = query.Where(u =>
                (u.Email != null && u.Email.ToLower().Contains(q)) ||
                (u.DisplayName != null && u.DisplayName.ToLower().Contains(q)));
        }

        var total = await query.CountAsync();

        var users = await query
            .OrderBy(u => u.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = new List<object>();

        foreach (var u in users)
        {
            var rs = await _users.GetRolesAsync(u);

            if (!string.IsNullOrWhiteSpace(role) && role != "all" && !rs.Contains(role))
                continue;

            items.Add(new
            {
                id = u.Id,
                email = u.Email,
                displayName = u.DisplayName,
                profileImageUrl = u.ProfileImageUrl,
                roles = rs,
                lockoutEnd = u.LockoutEnd,
                organizationId = u.OrganizationId
            });
        }

        return Ok(new { total, page, pageSize, items });
    }

    public record SetUserRolesRequest(List<string> Roles);

    [HttpPut("users/{userId}/roles")]
    public async Task<IActionResult> SetRoles(string userId, SetUserRolesRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var u = await _users.FindByIdAsync(userId);
        if (u is null) return NotFound();

        var desired = (req.Roles ?? new List<string>())
            .Select(r => r.Trim())
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var r in desired)
        {
            if (!await _roles.RoleExistsAsync(r))
                return BadRequest($"Role does not exist: {r}");
        }

        var current = await _users.GetRolesAsync(u);

        var remove = current.Where(r => !desired.Contains(r, StringComparer.OrdinalIgnoreCase)).ToList();
        var add = desired.Where(r => !current.Contains(r, StringComparer.OrdinalIgnoreCase)).ToList();

        if (remove.Count > 0)
        {
            var rr = await _users.RemoveFromRolesAsync(u, remove);
            if (!rr.Succeeded) return BadRequest("Failed to remove roles.");
        }

        if (add.Count > 0)
        {
            var ar = await _users.AddToRolesAsync(u, add);
            if (!ar.Succeeded) return BadRequest("Failed to add roles.");
        }

        await _audit.Add(
            actorUserId: adminId,
            action: "user.roles",
            targetType: "user",
            targetId: u.Id,
            targetLabel: u.Email,
            reason: null,
            meta: new
            {
                before = current,
                after = desired
            }
        );

        return NoContent();
    }

    public record SetUserAcademyRequest(Guid? AcademyId);

[HttpPut("users/{userId}/academy")]
public async Task<IActionResult> SetUserAcademy(string userId, [FromBody] SetUserAcademyRequest req)
{
    var adminId = AdminId();
    if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

    var u = await _users.FindByIdAsync(userId);
    if (u is null) return NotFound();

    var roles = await _users.GetRolesAsync(u);
    if (!roles.Contains("Instructor"))
        return BadRequest("Only instructors can be assigned to an academy.");

    Guid? academyId = req.AcademyId;

    Academy? academy = null;
    if (academyId.HasValue)
    {
        academy = await _db.Academies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == academyId.Value);

        if (academy is null)
            return BadRequest("Academy not found.");

        if (academy.IsHidden)
            return BadRequest("Cannot assign instructor to a hidden academy.");

        if (academy.OrganizationId == null)
            return BadRequest("Academy is not linked to an organization.");

        // keep org + academy in sync
        u.OrganizationId = academy.OrganizationId;
    }
    else
    {
        // unassign academy only
        u.OrganizationId = null;
    }

    var beforeAcademyId = u.AcademyId;
    var beforeOrganizationId = u.OrganizationId;

    u.AcademyId = academyId;

    var res = await _users.UpdateAsync(u);
    if (!res.Succeeded)
        return BadRequest("Failed to update user academy.");

    await _audit.Add(
        actorUserId: adminId,
        action: "user.academy",
        targetType: "user",
        targetId: u.Id,
        targetLabel: u.Email,
        reason: null,
        meta: new
        {
            beforeAcademyId,
            afterAcademyId = academyId,
            academyName = academy?.Name,
            beforeOrganizationId,
            afterOrganizationId = u.OrganizationId
        }
    );

    return NoContent();
}

    // ✅ lock supports duration + permanent
    public record SetUserLockRequest(bool Locked, int? Days = null, bool Permanent = false);

    [HttpPut("users/{userId}/lock")]
    public async Task<IActionResult> LockUser(string userId, SetUserLockRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var u = await _users.FindByIdAsync(userId);
        if (u is null) return NotFound();

        u.LockoutEnabled = true;

        DateTimeOffset? newEnd = null;

        if (!req.Locked)
        {
            u.LockoutEnd = null;
        }
        else
        {
            if (req.Permanent || req.Days is null)
            {
                newEnd = DateTimeOffset.UtcNow.AddYears(50);
            }
            else
            {
                var days = Math.Clamp(req.Days.Value, 1, 3650); // 1..10 years
                newEnd = DateTimeOffset.UtcNow.AddDays(days);
            }

            u.LockoutEnd = newEnd;
        }

        var res = await _users.UpdateAsync(u);
        if (!res.Succeeded) return BadRequest("Failed to update lock state.");

        await _audit.Add(
            actorUserId: adminId,
            action: req.Locked ? "user.lock" : "user.unlock",
            targetType: "user",
            targetId: u.Id,
            targetLabel: u.Email,
            reason: null,
            meta: new
            {
                locked = req.Locked,
                days = req.Days,
                permanent = req.Permanent,
                lockoutEnd = newEnd
            }
        );

        return NoContent();
    }

    // ✅ Assign user to organization (frontend already calls this)
    public record SetUserOrganizationRequest(Guid? OrganizationId);

    [HttpPut("users/{userId}/organization")]
    public async Task<IActionResult> SetUserOrganization(string userId, [FromBody] SetUserOrganizationRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var u = await _users.FindByIdAsync(userId);
        if (u is null) return NotFound();

        Guid? orgId = req.OrganizationId;

        Organization? org = null;
        if (orgId.HasValue)
        {
            org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orgId.Value);
            if (org is null) return BadRequest("Organization not found.");

            // ✅ Block assigning users into a disabled org
            if (!org.IsActive) return BadRequest("Organization is disabled.");
        }

        var before = u.OrganizationId;
        u.OrganizationId = orgId;

        var res = await _users.UpdateAsync(u);
        if (!res.Succeeded) return BadRequest("Failed to update user organization.");

        await _audit.Add(
            actorUserId: adminId,
            action: "user.organization",
            targetType: "user",
            targetId: u.Id,
            targetLabel: u.Email,
            reason: null,
            meta: new
            {
                before,
                after = orgId,
                organizationName = org?.Name
            }
        );

        return NoContent();
    }

    // ✅ NEW: delete user
    // DELETE /api/admin/users/{id}?reason=...
    [HttpDelete("users/{userId}")]
    public async Task<IActionResult> DeleteUser(string userId, [FromQuery] string? reason = null)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var u = await _users.FindByIdAsync(userId);
        if (u is null) return NotFound();

        var finalReason = string.IsNullOrWhiteSpace(reason) ? "Policy violation" : reason.Trim();

        // safety: prevent deleting self
        if (u.Id == adminId) return BadRequest("You cannot delete your own account.");

        await _audit.Add(
            actorUserId: adminId,
            action: "user.delete",
            targetType: "user",
            targetId: u.Id,
            targetLabel: u.Email,
            reason: finalReason,
            meta: new
            {
                u.DisplayName,
                u.OrganizationId
            }
        );

        var res = await _users.DeleteAsync(u);
        if (!res.Succeeded) return BadRequest("Failed to delete user.");

        return NoContent();
    }

    // ---------------- ORGANIZATIONS ----------------

    private static string Slugify(string input)
    {
        input = (input ?? "").Trim().ToLowerInvariant();
        input = Regex.Replace(input, @"\s+", "-");
        input = Regex.Replace(input, @"[^a-z0-9\-]", "");
        input = Regex.Replace(input, @"\-{2,}", "-").Trim('-');
        return string.IsNullOrWhiteSpace(input) ? "org" : input;
    }

    private static string GenerateInviteCode(int bytes = 16)
    {
        var b = RandomNumberGenerator.GetBytes(bytes);
        // url-safe-ish token
        return Convert.ToBase64String(b)
            .Replace("+", "-")
            .Replace("/", "_")
            .Replace("=", "");
    }

    public record CreateOrganizationRequest(
        string Name,
        string? Slug = null,
        string? Website = null,
        string? PrimaryColor = null,
        string? Description = null,
        string? LogoUrl = null
    );

    [HttpPost("organizations")]
    public async Task<IActionResult> CreateOrganization([FromBody] CreateOrganizationRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var desiredSlug = string.IsNullOrWhiteSpace(req.Slug) ? Slugify(req.Name) : Slugify(req.Slug);

        // ensure uniqueness (append -2, -3, ...)
        var baseSlug = desiredSlug;
        var i = 2;
        while (await _db.Organizations.AsNoTracking().AnyAsync(o => o.Slug == desiredSlug))
        {
            desiredSlug = $"{baseSlug}-{i}";
            i++;
            if (i > 200) return BadRequest("Could not generate a unique slug.");
        }

        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = req.Name.Trim(),
            Slug = desiredSlug,
            Website = string.IsNullOrWhiteSpace(req.Website) ? null : req.Website.Trim(),
            PrimaryColor = string.IsNullOrWhiteSpace(req.PrimaryColor) ? "#7c3aed" : req.PrimaryColor.Trim(),
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            LogoUrl = string.IsNullOrWhiteSpace(req.LogoUrl) ? null : req.LogoUrl.Trim(),
            InviteCode = GenerateInviteCode(),
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        };

        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        await _audit.Add(
            actorUserId: adminId,
            action: "org.create",
            targetType: "organization",
            targetId: org.Id.ToString(),
            targetLabel: org.Name,
            reason: null,
            meta: new { org.Slug }
        );

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

    [HttpGet("organizations")]
    public async Task<IActionResult> ListOrganizations(string? q = null, int page = 1, int pageSize = 25)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 25 : pageSize;

        var query = _db.Organizations.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim().ToLowerInvariant();
            query = query.Where(o =>
                o.Name.ToLower().Contains(q) ||
                o.Slug.ToLower().Contains(q));
        }

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new
            {
                o.Id,
                o.Name,
                o.Slug,
                o.Website,
                o.PrimaryColor,
                o.LogoUrl,
                o.InviteCode,
                o.CreatedAt,
                o.IsActive,
                academiesCount = _db.Academies.Count(a => a.OrganizationId == o.Id),
                usersCount = _db.Users.Count(u => u.OrganizationId == o.Id)
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    public record UpdateOrganizationRequest(
        string? Name = null,
        string? Slug = null,
        string? Website = null,
        string? PrimaryColor = null,
        string? Description = null,
        string? LogoUrl = null,
        bool? RegenerateInviteCode = null
    );

    [HttpPut("organizations/{orgId:guid}")]
    public async Task<IActionResult> UpdateOrganization(Guid orgId, [FromBody] UpdateOrganizationRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId);
        if (org is null) return NotFound();

        var before = new
        {
            org.Name,
            org.Slug,
            org.Website,
            org.PrimaryColor,
            org.Description,
            org.LogoUrl,
            org.InviteCode,
            org.IsActive
        };

        if (!string.IsNullOrWhiteSpace(req.Name))
            org.Name = req.Name.Trim();

        if (!string.IsNullOrWhiteSpace(req.Website))
            org.Website = req.Website.Trim();
        else if (req.Website is not null && string.IsNullOrWhiteSpace(req.Website))
            org.Website = null;

        if (!string.IsNullOrWhiteSpace(req.Description))
            org.Description = req.Description.Trim();
        else if (req.Description is not null && string.IsNullOrWhiteSpace(req.Description))
            org.Description = null;

        if (!string.IsNullOrWhiteSpace(req.LogoUrl))
            org.LogoUrl = req.LogoUrl.Trim();
        else if (req.LogoUrl is not null && string.IsNullOrWhiteSpace(req.LogoUrl))
            org.LogoUrl = null;

        if (!string.IsNullOrWhiteSpace(req.PrimaryColor))
            org.PrimaryColor = req.PrimaryColor.Trim();

        if (!string.IsNullOrWhiteSpace(req.Slug))
        {
            var desiredSlug = Slugify(req.Slug);

            // unique check excluding this org
            var exists = await _db.Organizations.AsNoTracking()
                .AnyAsync(o => o.Slug == desiredSlug && o.Id != org.Id);

            if (exists)
                return BadRequest("Slug already exists.");

            org.Slug = desiredSlug;
        }

        if (req.RegenerateInviteCode == true)
            org.InviteCode = GenerateInviteCode();

        await _db.SaveChangesAsync();

        var after = new
        {
            org.Name,
            org.Slug,
            org.Website,
            org.PrimaryColor,
            org.Description,
            org.LogoUrl,
            org.InviteCode,
            org.IsActive
        };

        await _audit.Add(
            actorUserId: adminId,
            action: "org.update",
            targetType: "organization",
            targetId: org.Id.ToString(),
            targetLabel: org.Name,
            reason: null,
            meta: new
            {
                before,
                after
            }
        );

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

    // ✅ NEW: enable/disable organization
    public record SetOrgActiveRequest(bool IsActive, string? Reason = null);

    [HttpPut("organizations/{orgId:guid}/active")]
    public async Task<IActionResult> SetOrganizationActive(Guid orgId, [FromBody] SetOrgActiveRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId);
        if (org is null) return NotFound();

        var before = org.IsActive;
        org.IsActive = req.IsActive;

        await _db.SaveChangesAsync();

        var reason = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim();

        await _audit.Add(
            actorUserId: adminId,
            action: req.IsActive ? "org.enable" : "org.disable",
            targetType: "organization",
            targetId: org.Id.ToString(),
            targetLabel: org.Name,
            reason: reason,
            meta: new { before, after = org.IsActive }
        );

        return NoContent();
    }

    // ✅ NEW: delete organization
    // DELETE /api/admin/organizations/{id}?reason=...
    [HttpDelete("organizations/{orgId:guid}")]
    public async Task<IActionResult> DeleteOrganization(Guid orgId, [FromQuery] string? reason = null)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId);
        if (org is null) return NotFound();

        var finalReason = string.IsNullOrWhiteSpace(reason) ? "Policy violation" : reason.Trim();

        // safest policy: block delete when org still has academies/users
        var hasAcademies = await _db.Academies.AnyAsync(a => a.OrganizationId == orgId);
        var hasUsers = await _db.Users.AnyAsync(u => u.OrganizationId == orgId);

        if (hasAcademies || hasUsers)
            return BadRequest("Organization has academies/users. Remove them first or unassign users.");

        await _audit.Add(
            actorUserId: adminId,
            action: "org.delete",
            targetType: "organization",
            targetId: org.Id.ToString(),
            targetLabel: org.Name,
            reason: finalReason,
            meta: new { org.Slug }
        );

        _db.Organizations.Remove(org);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // ---------------- MODERATION ----------------
    public record ModerateRequest(bool IsHidden, string? Reason);

    [HttpGet("academies")]
    public async Task<IActionResult> ListAcademies(string? q = null, string status = "all", int page = 1, int pageSize = 25)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 25 : pageSize;

        var query = _db.Academies.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim().ToLowerInvariant();
            query = query.Where(a => a.Name.ToLower().Contains(q) || a.Slug.ToLower().Contains(q));
        }

        query = status switch
        {
            "published" => query.Where(a => a.IsPublished && !a.IsHidden),
            "draft" => query.Where(a => !a.IsPublished && !a.IsHidden),
            "hidden" => query.Where(a => a.IsHidden),
            _ => query
        };

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.OwnerUserId,
                a.OrganizationId,
                a.IsPublished,
                a.PublishedAt,
                a.IsHidden,
                a.HiddenReason,
                a.HiddenAt,
                a.HiddenByUserId,
                a.PrimaryColor,
                a.LogoUrl,
                a.BannerUrl,
                a.CreatedAt
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpPut("academies/{academyId:guid}/moderate")]
    public async Task<IActionResult> ModerateAcademy(Guid academyId, ModerateRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var a = await _db.Academies.FirstOrDefaultAsync(x => x.Id == academyId);
        if (a is null) return NotFound();

        var reason = req.IsHidden
            ? (string.IsNullOrWhiteSpace(req.Reason) ? "Policy violation" : req.Reason.Trim())
            : null;

        a.IsHidden = req.IsHidden;
        a.HiddenReason = reason;
        a.HiddenAt = req.IsHidden ? DateTimeOffset.UtcNow : null;
        a.HiddenByUserId = req.IsHidden ? adminId : null;

        if (req.IsHidden)
        {
            a.IsPublished = false;
            a.PublishedAt = null;
        }

        await _db.SaveChangesAsync();

        await _audit.Add(
            actorUserId: adminId,
            action: req.IsHidden ? "academy.hide" : "academy.unhide",
            targetType: "academy",
            targetId: a.Id.ToString(),
            targetLabel: a.Name,
            reason: reason,
            meta: new { a.Slug }
        );

        if (!string.IsNullOrWhiteSpace(a.OwnerUserId))
        {
            if (req.IsHidden)
            {
                await _notifs.Add(
                    a.OwnerUserId,
                    "Academy hidden by admin",
                    $"Your academy \"{a.Name}\" was hidden. Reason: {reason}",
                    "warning",
                    $"/instructor/courses/{a.Id}"
                );
            }
            else
            {
                await _notifs.Add(
                    a.OwnerUserId,
                    "Academy unhidden by admin",
                    $"Your academy \"{a.Name}\" is visible again.",
                    "success",
                    $"/instructor/courses/{a.Id}"
                );
            }
        }

        return NoContent();
    }

    [HttpGet("courses")]
    public async Task<IActionResult> ListCourses(string? q = null, string status = "all", int page = 1, int pageSize = 25)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 25 : pageSize;

        var query = _db.Courses.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim().ToLowerInvariant();
            query = query.Where(c =>
                c.Title.ToLower().Contains(q) ||
                (c.Category != null && c.Category.ToLower().Contains(q)));
        }

        query = status switch
        {
            "published" => query.Where(c => c.Status == CourseStatus.Published && !c.IsHidden),
            "draft" => query.Where(c => c.Status == CourseStatus.Draft && !c.IsHidden),
            "private" => query.Where(c => c.Status == CourseStatus.Private && !c.IsHidden),
            "hidden" => query.Where(c => c.IsHidden),
            _ => query
        };

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new
            {
                c.Id,
                c.AcademyId,
                c.Title,
                c.Category,
                c.Status,
                c.IsFree,
                c.Price,
                c.Currency,
                c.IsHidden,
                c.HiddenReason,
                c.HiddenAt,
                c.HiddenByUserId,
                c.CreatedAt
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpPut("courses/{courseId:guid}/moderate")]
    public async Task<IActionResult> ModerateCourse(Guid courseId, ModerateRequest req)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var c = await _db.Courses.FirstOrDefaultAsync(x => x.Id == courseId);
        if (c is null) return NotFound();

        var reason = req.IsHidden
            ? (string.IsNullOrWhiteSpace(req.Reason) ? "Policy violation" : req.Reason.Trim())
            : null;

        c.IsHidden = req.IsHidden;
        c.HiddenReason = reason;
        c.HiddenAt = req.IsHidden ? DateTimeOffset.UtcNow : null;
        c.HiddenByUserId = req.IsHidden ? adminId : null;

        if (req.IsHidden && c.Status == CourseStatus.Published)
            c.Status = CourseStatus.Private;

        await _db.SaveChangesAsync();

        await _audit.Add(
            actorUserId: adminId,
            action: req.IsHidden ? "course.hide" : "course.unhide",
            targetType: "course",
            targetId: c.Id.ToString(),
            targetLabel: c.Title,
            reason: reason,
            meta: new { c.AcademyId, c.Status }
        );

        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == c.AcademyId);
        if (academy != null && !string.IsNullOrWhiteSpace(academy.OwnerUserId))
        {
            if (req.IsHidden)
            {
                await _notifs.Add(
                    academy.OwnerUserId,
                    "Course hidden by admin",
                    $"Your course \"{c.Title}\" was hidden. Reason: {reason}",
                    "warning",
                    $"/instructor/course-builder/{c.Id}"
                );
            }
            else
            {
                await _notifs.Add(
                    academy.OwnerUserId,
                    "Course unhidden by admin",
                    $"Your course \"{c.Title}\" is visible again.",
                    "success",
                    $"/instructor/course-builder/{c.Id}"
                );
            }
        }

        return NoContent();
    }

    // DELETE /api/admin/academies/{id}?reason=...
    [HttpDelete("academies/{academyId:guid}")]
    public async Task<IActionResult> DeleteAcademy(Guid academyId, [FromQuery] string? reason = null)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var a = await _db.Academies.FirstOrDefaultAsync(x => x.Id == academyId);
        if (a is null) return NotFound();

        var finalReason = string.IsNullOrWhiteSpace(reason) ? "Policy violation" : reason.Trim();

        await _audit.Add(
            actorUserId: adminId,
            action: "academy.delete",
            targetType: "academy",
            targetId: a.Id.ToString(),
            targetLabel: a.Name,
            reason: finalReason,
            meta: new { a.Slug, a.OwnerUserId }
        );

        if (!string.IsNullOrWhiteSpace(a.OwnerUserId))
        {
            await _notifs.Add(
                a.OwnerUserId,
                "Academy deleted by admin",
                $"Your academy \"{a.Name}\" was deleted. Reason: {finalReason}",
                "error",
                "/instructor"
            );
        }

        _db.Academies.Remove(a);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/admin/courses/{id}?reason=...
    [HttpDelete("courses/{courseId:guid}")]
    public async Task<IActionResult> DeleteCourse(Guid courseId, [FromQuery] string? reason = null)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var c = await _db.Courses.FirstOrDefaultAsync(x => x.Id == courseId);
        if (c is null) return NotFound();

        var finalReason = string.IsNullOrWhiteSpace(reason) ? "Policy violation" : reason.Trim();

        await _audit.Add(
            actorUserId: adminId,
            action: "course.delete",
            targetType: "course",
            targetId: c.Id.ToString(),
            targetLabel: c.Title,
            reason: finalReason,
            meta: new { c.AcademyId }
        );

        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == c.AcademyId);
        if (academy != null && !string.IsNullOrWhiteSpace(academy.OwnerUserId))
        {
            await _notifs.Add(
                academy.OwnerUserId,
                "Course deleted by admin",
                $"Your course \"{c.Title}\" was deleted. Reason: {finalReason}",
                "error",
                $"/instructor/courses/{academy.Id}"
            );
        }

        _db.Courses.Remove(c);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------------- AUDIT ----------------

    [HttpGet("audit")]
    public async Task<IActionResult> ListAudit(
        string? q = null,
        string? action = null,
        string? targetType = null,
        int page = 1,
        int pageSize = 25)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 25 : pageSize;

        var query = _db.AdminAuditLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(action) && action != "all")
        {
            action = action.Trim();
            query = query.Where(x => x.Action == action);
        }

        if (!string.IsNullOrWhiteSpace(targetType) && targetType != "all")
        {
            targetType = targetType.Trim();
            query = query.Where(x => x.TargetType == targetType);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim().ToLowerInvariant();
            query = query.Where(x =>
                (x.Action != null && x.Action.ToLower().Contains(q)) ||
                (x.TargetType != null && x.TargetType.ToLower().Contains(q)) ||
                (x.TargetId != null && x.TargetId.ToLower().Contains(q)) ||
                (x.TargetLabel != null && x.TargetLabel.ToLower().Contains(q)) ||
                (x.Reason != null && x.Reason.ToLower().Contains(q)) ||
                (x.ActorUserId != null && x.ActorUserId.ToLower().Contains(q)));
        }

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.ActorUserId,
                x.Action,
                x.TargetType,
                x.TargetId,
                x.TargetLabel,
                x.Reason,
                x.MetaJson,
                x.CreatedAt
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }


    [HttpGet("courses/{courseId:guid}/lessons")]
public async Task<IActionResult> GetCourseLessons(Guid courseId)
{
    var course = await _db.Courses
        .AsNoTracking()
        .Include(c => c.Modules)
            .ThenInclude(m => m.Lessons)
        .FirstOrDefaultAsync(c => c.Id == courseId);

    if (course is null) return NotFound();

    return Ok(new
    {
        course.Id,
        course.Title,
        course.ShortDescription,
        course.FullDescription,
        course.Category,
        course.ThumbnailUrl,
        course.Status,
        course.IsHidden,
        course.HiddenReason,
        Modules = course.Modules
            .OrderBy(m => m.SortOrder)
            .Select(m => new
            {
                m.Id,
                m.Title,
                m.SortOrder,
                Lessons = m.Lessons
                .OrderBy(l => l.SortOrder)
                .Select(l => new
                {
                    l.Id,
                    l.Title,
                    l.Type,
                    l.ContentUrl,
                    l.HtmlContent,
                    QuizId = _db.Quizzes
                        .Where(q => q.LessonId == l.Id)
                        .Select(q => (Guid?)q.Id)
                        .FirstOrDefault(),
                    l.SortOrder,
                    l.IsPreviewFree,
                    l.IsDownloadable
                })
            })
    });
}
}