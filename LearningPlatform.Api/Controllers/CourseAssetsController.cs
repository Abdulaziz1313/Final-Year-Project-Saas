using System.Security.Claims;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using LearningPlatform.Api.Dto;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/courses")]
public class CourseAssetsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly BlobServiceClient _blobServiceClient;
    private readonly StorageOptions _storage;

    public CourseAssetsController(
        AppDbContext db,
        IWebHostEnvironment env,
        BlobServiceClient blobServiceClient,
        IOptions<StorageOptions> storage)
    {
        _db = db;
        _env = env;
        _blobServiceClient = blobServiceClient;
        _storage = storage.Value;
    }

    private static string? UserId(ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier);

    private async Task<bool> IsAssignedToAcademyAsync(Guid academyId, string userId)
    {
        var claim = User.FindFirstValue("academyId");
        if (!string.IsNullOrEmpty(claim) && Guid.TryParse(claim, out var claimAcademyId))
            return claimAcademyId == academyId;

        return await _db.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == userId && u.AcademyId == academyId);
    }

    [HttpPost("{courseId:guid}/thumbnail")]
    [Authorize(Roles = "Instructor")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadThumbnail(Guid courseId, [FromForm] UploadImageRequest request)
    {
        var file = request.File;

        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");

        var userId = UserId(User);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (course.IsHidden)
            return BadRequest($"Course is hidden by admin. Reason: {course.HiddenReason ?? "Policy violation"}");

        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
        if (academy != null && academy.IsHidden)
            return BadRequest("Academy is hidden by admin. Uploads are disabled.");

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

        if (_storage.UseBlob)
        {
            var container = _blobServiceClient.GetBlobContainerClient(_storage.CourseAssetsContainer);
            await container.CreateIfNotExistsAsync();

            var blobName = $"thumbnails/{courseId}{ext}";
            var blob = container.GetBlobClient(blobName);

            await using var stream = file.OpenReadStream();
            await blob.UploadAsync(
                stream,
                new BlobUploadOptions
                {
                    HttpHeaders = new BlobHttpHeaders
                    {
                        ContentType = file.ContentType
                    }
                });

            course.ThumbnailUrl = blob.Uri.ToString();
        }
        else
        {
            var wwwroot = Path.Combine(_env.ContentRootPath, "wwwroot");
            var dir = Path.Combine(wwwroot, "uploads", "courses");
            Directory.CreateDirectory(dir);

            DeleteCourseThumbnailFiles(dir, courseId);

            var filename = $"{courseId}{ext}";
            var fullPath = Path.Combine(dir, filename);

            await using (var stream = System.IO.File.Create(fullPath))
                await file.CopyToAsync(stream);

            course.ThumbnailUrl = $"/uploads/courses/{filename}";
        }

        await _db.SaveChangesAsync();
        return Ok(new { thumbnailUrl = course.ThumbnailUrl });
    }

    [HttpDelete("{courseId:guid}/thumbnail")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> DeleteThumbnail(Guid courseId)
    {
        var userId = UserId(User);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (course.IsHidden)
            return BadRequest($"Course is hidden by admin. Reason: {course.HiddenReason ?? "Policy violation"}");

        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
        if (academy != null && academy.IsHidden)
            return BadRequest("Academy is hidden by admin. Changes are disabled.");

        if (_storage.UseBlob)
        {
            var container = _blobServiceClient.GetBlobContainerClient(_storage.CourseAssetsContainer);
            foreach (var ext in new[] { ".jpg", ".png", ".webp", ".jpeg" })
            {
                var blob = container.GetBlobClient($"thumbnails/{courseId}{ext}");
                try { await blob.DeleteIfExistsAsync(); } catch { }
            }
        }
        else
        {
            var wwwroot = Path.Combine(_env.ContentRootPath, "wwwroot");
            var dir = Path.Combine(wwwroot, "uploads", "courses");
            Directory.CreateDirectory(dir);
            DeleteCourseThumbnailFiles(dir, courseId);
        }

        course.ThumbnailUrl = null;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private static void DeleteCourseThumbnailFiles(string dir, Guid courseId)
    {
        var bases = courseId.ToString();
        var candidates = new[]
        {
            Path.Combine(dir, $"{bases}.jpg"),
            Path.Combine(dir, $"{bases}.png"),
            Path.Combine(dir, $"{bases}.webp"),
            Path.Combine(dir, $"{bases}.jpeg"),
        };

        foreach (var p in candidates)
        {
            try
            {
                if (System.IO.File.Exists(p)) System.IO.File.Delete(p);
            }
            catch
            {
            }
        }
    }
}