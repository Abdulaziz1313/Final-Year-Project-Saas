using System.Security.Claims;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using LearningPlatform.Api.Services;
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

    public AdminController(
        AppDbContext db,
        UserManager<ApplicationUser> users,
        RoleManager<IdentityRole> roles,
        NotificationWriter notifs)
    {
        _db = db;
        _users = users;
        _roles = roles;
        _notifs = notifs;
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
                lockoutEnd = u.LockoutEnd
            });
        }

        return Ok(new { total, page, pageSize, items });
    }

    public record SetUserRolesRequest(List<string> Roles);

    [HttpPut("users/{userId}/roles")]
    public async Task<IActionResult> SetRoles(string userId, SetUserRolesRequest req)
    {
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

        return NoContent();
    }

    public record SetUserLockRequest(bool Locked);

    [HttpPut("users/{userId}/lock")]
    public async Task<IActionResult> LockUser(string userId, SetUserLockRequest req)
    {
        var u = await _users.FindByIdAsync(userId);
        if (u is null) return NotFound();

        u.LockoutEnabled = true;
        u.LockoutEnd = req.Locked ? DateTimeOffset.UtcNow.AddYears(50) : null;

        var res = await _users.UpdateAsync(u);
        if (!res.Succeeded) return BadRequest("Failed to update lock state.");

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

        // safety: hidden academy should not be published
        if (req.IsHidden)
        {
            a.IsPublished = false;
            a.PublishedAt = null;
        }

        await _db.SaveChangesAsync();

        // ✅ Notify owner
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

        // safety: hidden course should never be public
        if (req.IsHidden && c.Status == CourseStatus.Published)
            c.Status = CourseStatus.Private;

        await _db.SaveChangesAsync();

        // ✅ Notify academy owner
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

    // ✅ Delete endpoints with reason query string
    // DELETE /api/admin/academies/{id}?reason=...
    [HttpDelete("academies/{academyId:guid}")]
    public async Task<IActionResult> DeleteAcademy(Guid academyId, [FromQuery] string? reason = null)
    {
        var adminId = AdminId();
        if (string.IsNullOrWhiteSpace(adminId)) return Unauthorized();

        var a = await _db.Academies.FirstOrDefaultAsync(x => x.Id == academyId);
        if (a is null) return NotFound();

        var finalReason = string.IsNullOrWhiteSpace(reason) ? "Policy violation" : reason.Trim();

        // ✅ notify before delete
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
}
