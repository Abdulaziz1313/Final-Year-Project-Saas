using System.Security.Claims;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/academies")]
public class AcademyAssetsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public AcademyAssetsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // POST /api/academies/{academyId}/logo
    [HttpPost("{academyId:guid}/logo")]
    [Authorize(Roles = "Instructor")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(Guid academyId, [FromForm] IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (academy.OwnerUserId != userId)
            return Forbid("You don't own this academy.");

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
        var dir = Path.Combine(wwwroot, "uploads", "academies");
        Directory.CreateDirectory(dir);

        var filename = $"{academyId}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
        {
            await file.CopyToAsync(stream);
        }

        academy.LogoUrl = $"/uploads/academies/{filename}";
        await _db.SaveChangesAsync();

        return Ok(new { logoUrl = academy.LogoUrl });
    }
}
