using System.Security.Claims;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/courses")]
public class CourseAssetsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public CourseAssetsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // POST /api/courses/{courseId}/thumbnail
    [HttpPost("{courseId:guid}/thumbnail")]
    [Authorize(Roles = "Instructor")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadThumbnail(Guid courseId, [FromForm] IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        // Must own the academy that owns the course
        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == course.AcademyId);
        if (academy is null) return NotFound();
        if (academy.OwnerUserId != userId) return Forbid();

        var allowed = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowed.Contains(file.ContentType))
            return BadRequest("Only JPG, PNG, or WEBP allowed.");

        var ext = file.ContentType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".img"
        };

        var wwwroot = Path.Combine(_env.ContentRootPath, "wwwroot");
        var dir = Path.Combine(wwwroot, "uploads", "courses");
        Directory.CreateDirectory(dir);

        var filename = $"{courseId}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
            await file.CopyToAsync(stream);

        course.ThumbnailUrl = $"/uploads/courses/{filename}";
        await _db.SaveChangesAsync();

        return Ok(new { thumbnailUrl = course.ThumbnailUrl });
    }
}
