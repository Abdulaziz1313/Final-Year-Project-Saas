using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/catalog")]
public class CatalogController : ControllerBase
{
    private readonly AppDbContext _db;
    public CatalogController(AppDbContext db) => _db = db;

    // List published courses for a PUBLISHED + NOT HIDDEN academy by slug, with optional search
    // GET /api/catalog/academies/{slug}/courses?q=web&page=1&pageSize=12
    [HttpGet("academies/{slug}/courses")]
    [AllowAnonymous]
    public async Task<IActionResult> ListCourses(
        string slug,
        string? q = null,
        string? tag = null,
        string sort = "newest",
        int page = 1,
        int pageSize = 12)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 50 ? 12 : pageSize;

        // ✅ Only allow published + not hidden academies in public catalog
        var academy = await _db.Academies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Slug == slug && a.IsPublished && !a.IsHidden);

        if (academy is null) return NotFound("Academy not found.");

        // ✅ Only published + not hidden courses
        var query = _db.Courses.AsNoTracking()
            .Where(c => c.AcademyId == academy.Id
                        && c.Status == LearningPlatform.Domain.Entities.CourseStatus.Published
                        && !c.IsHidden);

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim();
            query = query.Where(c =>
                c.Title.Contains(q) ||
                (c.ShortDescription != null && c.ShortDescription.Contains(q)));
        }

        // Tag filter (simple contains on TagsJson)
        if (!string.IsNullOrWhiteSpace(tag))
        {
            tag = tag.Trim().ToLowerInvariant();
            query = query.Where(c => c.TagsJson != null && c.TagsJson.ToLower().Contains(tag));
        }

        // Sorting
        query = sort switch
        {
            "title" => query.OrderBy(c => c.Title),
            "price" => query.OrderBy(c => c.IsFree).ThenBy(c => c.Price ?? 0),
            _ => query.OrderByDescending(c => c.CreatedAt) // newest
        };

        var total = await query.CountAsync();

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new
            {
                c.Id,
                c.Title,
                c.ShortDescription,
                c.IsFree,
                c.Price,
                c.Currency,
                c.Category,
                c.TagsJson,
                c.ThumbnailUrl,
                c.CreatedAt
            })
            .ToListAsync();

        return Ok(new
        {
            academy = new
            {
                academy.Id,
                academy.Name,
                academy.Slug,
                academy.LogoUrl,
                academy.BannerUrl,
                academy.PrimaryColor,
                academy.Description,

                // ✅ font branding
                academy.FontKey,
                academy.CustomFontUrl,
                academy.CustomFontFamily,

                academy.PublishedAt
            },
            total,
            page,
            pageSize,
            items
        });
    }

    // Public course detail (published only) AND must belong to a PUBLISHED + NOT HIDDEN academy
  // Public course detail (published only) AND must belong to a PUBLISHED + NOT HIDDEN academy
[HttpGet("courses/{id:guid}")]
[AllowAnonymous]
public async Task<IActionResult> CourseDetail(Guid id)
{
    // Load published course (even if hidden, so we can show reason)
    var course = await _db.Courses.AsNoTracking()
        .Include(c => c.Modules.OrderBy(m => m.SortOrder))
            .ThenInclude(m => m.Lessons.OrderBy(l => l.SortOrder))
        .FirstOrDefaultAsync(c => c.Id == id
            && c.Status == LearningPlatform.Domain.Entities.CourseStatus.Published);

    if (course is null) return NotFound();

    // ✅ If hidden, show reason (students will see this message)
    if (course.IsHidden)
    {
        var reason = string.IsNullOrWhiteSpace(course.HiddenReason) ? "Policy violation" : course.HiddenReason;
        return StatusCode(StatusCodes.Status410Gone, $"This course is not available. Hidden by admin. Reason: {reason}");
    }

    // ✅ Academy must be published + not hidden
    var academy = await _db.Academies.AsNoTracking()
        .FirstOrDefaultAsync(a => a.Id == course.AcademyId && a.IsPublished && !a.IsHidden);

    if (academy is null)
        return StatusCode(StatusCodes.Status410Gone, "This course is not available.");

   var dto = new
{
    id = course.Id,
    title = course.Title,
    shortDescription = course.ShortDescription,
    fullDescription = course.FullDescription,
    isFree = course.IsFree,
    price = course.Price,
    currency = course.Currency,
    category = course.Category,
    tagsJson = course.TagsJson,
    thumbnailUrl = course.ThumbnailUrl,

    academy = new
    {
        id = academy.Id,
        name = academy.Name,
        slug = academy.Slug,
        logoUrl = academy.LogoUrl,
        bannerUrl = academy.BannerUrl,
        primaryColor = academy.PrimaryColor,

        fontKey = academy.FontKey,
        customFontUrl = academy.CustomFontUrl,
        customFontFamily = academy.CustomFontFamily
    },

    modules = course.Modules.Select(m => new
    {
        id = m.Id,
        title = m.Title,
        sortOrder = m.SortOrder,
        lessons = m.Lessons.Select(l => new
        {
            id = l.Id,
            title = l.Title,
            type = l.Type,
            sortOrder = l.SortOrder,
            isPreviewFree = l.IsPreviewFree
        })
    })
};

return Ok(dto);
}


    // ✅ Shows ALL published academies even if they have 0 published courses, AND not hidden
    // GET /api/catalog/academies?q=&sort=
    [HttpGet("academies")]
    [AllowAnonymous]
    public async Task<IActionResult> ListAcademies(string? q = null, string sort = "newest")
    {
        var query = _db.Academies.AsNoTracking()
            .Where(a => a.IsPublished && !a.IsHidden);

        if (!string.IsNullOrWhiteSpace(q))
        {
            q = q.Trim();
            query = query.Where(a =>
                a.Name.Contains(q) ||
                (a.Description != null && a.Description.Contains(q)));
        }

        query = sort switch
        {
            "name" => query.OrderBy(a => a.Name),
            _ => query.OrderByDescending(a => a.PublishedAt ?? a.CreatedAt)
        };

        var items = await query
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.Slug,
                a.Description,
                a.LogoUrl,
                a.BannerUrl,
                a.PrimaryColor,

                // ✅ font branding
                a.FontKey,
                a.CustomFontUrl,
                a.CustomFontFamily,

                a.PublishedAt
            })
            .ToListAsync();

        return Ok(items);
    }
}
