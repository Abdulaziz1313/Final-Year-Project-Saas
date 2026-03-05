// InstructorAcademiesController.cs
// CHANGED: Academy creation is now done by OrgAdmin via OrgController.
// Instructors can only VIEW and MANAGE their assigned academy.
using System.Security.Claims;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/instructor/academies")]
[Authorize(Roles = "Instructor")]
public class InstructorAcademiesController : ControllerBase
{
    private readonly AppDbContext _db;
    public InstructorAcademiesController(AppDbContext db) => _db = db;

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    /// <summary>
    /// Returns the academy this instructor is linked to.
    /// An instructor is linked to exactly one academy (set at registration).
    /// </summary>
    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        // Get the AcademyId that was stamped on the user at registration
        var user = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.AcademyId, u.OrganizationId })
            .FirstOrDefaultAsync();

        if (user is null) return Unauthorized();
        if (user.AcademyId is null)
            return Ok(new { items = Array.Empty<object>(), message = "No academy assigned to this instructor." });

        var items = await _db.Academies
            .AsNoTracking()
            .Where(a => a.Id == user.AcademyId.Value && a.OrganizationId == user.OrganizationId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id, a.OrganizationId, a.Name, a.Slug,
                a.Description, a.Website, a.PrimaryColor,
                a.LogoUrl, a.BannerUrl, a.FontKey,
                a.CustomFontUrl, a.CustomFontFamily,
                a.IsPublished, a.PublishedAt, a.CreatedAt,
                a.IsHidden, a.HiddenReason, a.HiddenAt,
                CourseCount = _db.Courses.Count(c => c.AcademyId == a.Id)
            })
            .ToListAsync();

        return Ok(items);
    }

    // Get one academy by id (for courses page header)
    // Instructor can only access the academy they are linked to.
    [HttpGet("{academyId:guid}")]
    public async Task<IActionResult> GetOne(Guid academyId)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.AcademyId, u.OrganizationId })
            .FirstOrDefaultAsync();

        if (user is null) return Unauthorized();

        // Ensure the requested academy is the one assigned to this instructor
        if (user.AcademyId != academyId)
            return Forbid("You are not assigned to this academy.");

        var a = await _db.Academies
            .AsNoTracking()
            .Where(x => x.Id == academyId && x.OrganizationId == user.OrganizationId)
            .Select(x => new
            {
                x.Id, x.OrganizationId, x.Name, x.Slug,
                x.Description, x.Website, x.PrimaryColor,
                x.LogoUrl, x.BannerUrl, x.FontKey,
                x.CustomFontUrl, x.CustomFontFamily,
                x.IsPublished, x.PublishedAt, x.CreatedAt,
                x.IsHidden, x.HiddenReason, x.HiddenAt,
                CourseCount = _db.Courses.Count(c => c.AcademyId == x.Id)
            })
            .FirstOrDefaultAsync();

        if (a is null) return NotFound();
        return Ok(a);
    }
}