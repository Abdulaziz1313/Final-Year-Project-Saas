using System.Security.Claims;
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

    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var items = await _db.Academies.AsNoTracking()
            .Where(a => a.OwnerUserId == userId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.Description,
                a.Website,
                a.PrimaryColor,
                a.LogoUrl,
                a.BannerUrl,
                a.FontKey,
                a.CustomFontUrl,
                a.CustomFontFamily,
                a.IsPublished,
                a.PublishedAt,
                a.CreatedAt,
                a.IsHidden,
                a.HiddenReason,
                a.HiddenAt,

                // ✅ ADD THIS:
                CourseCount = _db.Courses.Count(c => c.AcademyId == a.Id)
            })
            .ToListAsync();

        return Ok(items);
    }

    // ✅ Get one academy by id (for courses page header)
    [HttpGet("{academyId:guid}")]
    public async Task<IActionResult> GetOne(Guid academyId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var a = await _db.Academies.AsNoTracking()
            .Where(x => x.Id == academyId && x.OwnerUserId == userId)
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
                x.CustomFontUrl,
                x.CustomFontFamily,
                x.IsPublished,
                x.PublishedAt,
                x.CreatedAt,

                // ✅ ADD THIS TOO (optional but useful):
                CourseCount = _db.Courses.Count(c => c.AcademyId == x.Id)
            })
            .FirstOrDefaultAsync();

        if (a is null) return NotFound();
        return Ok(a);
    }
}
