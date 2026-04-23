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
[Route("api/academies")]
public class AcademyAssetsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly BlobServiceClient _blobServiceClient;
    private readonly StorageOptions _storage;

    public AcademyAssetsController(
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

    private static readonly string[] AllowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

    private async Task<bool> CanManageAcademyAsync(Guid academyId, string userId)
    {
        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return false;

        if (User.IsInRole("Instructor"))
            return academy.OwnerUserId == userId;

        if (User.IsInRole("OrgAdmin"))
        {
            var user = await _db.Users.AsNoTracking()
                .Select(u => new { u.Id, u.OrganizationId })
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user is null) return false;
            return academy.OrganizationId == user.OrganizationId;
        }

        return false;
    }

    [HttpPost("{academyId:guid}/logo")]
    [Authorize(Roles = "Instructor,OrgAdmin")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(Guid academyId, [FromForm] UploadImageRequest request)
    {
        var file = request.File;

        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");
        if (!AllowedImageTypes.Contains(file.ContentType)) return BadRequest("Only JPG, PNG, or WEBP allowed.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        if (!await CanManageAcademyAsync(academyId, userId))
            return Forbid("You can't manage this academy.");

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        await DeleteStoredAssetAsync(academy.LogoUrl);

        var url = await SaveImageAsync(
            containerName: _storage.AcademyAssetsContainer,
            folder: "logos",
            ownerId: academyId,
            kind: "logo",
            file: file);

        academy.LogoUrl = url;
        await _db.SaveChangesAsync();

        return Ok(new { logoUrl = academy.LogoUrl });
    }

    [HttpPost("{academyId:guid}/banner")]
    [Authorize(Roles = "Instructor,OrgAdmin")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadBanner(Guid academyId, [FromForm] UploadImageRequest request)
    {
        var file = request.File;

        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");
        if (!AllowedImageTypes.Contains(file.ContentType)) return BadRequest("Only JPG, PNG, or WEBP allowed.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        if (!await CanManageAcademyAsync(academyId, userId))
            return Forbid("You can't manage this academy.");

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        await DeleteStoredAssetAsync(academy.BannerUrl);

        var url = await SaveImageAsync(
            containerName: _storage.AcademyAssetsContainer,
            folder: "banners",
            ownerId: academyId,
            kind: "banner",
            file: file);

        academy.BannerUrl = url;
        await _db.SaveChangesAsync();

        return Ok(new { bannerUrl = academy.BannerUrl });
    }

    [HttpDelete("{academyId:guid}/logo")]
    [Authorize(Roles = "Instructor,OrgAdmin")]
    public async Task<IActionResult> DeleteLogo(Guid academyId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        if (!await CanManageAcademyAsync(academyId, userId))
            return Forbid("You can't manage this academy.");

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound("Academy not found.");

        if (!string.IsNullOrWhiteSpace(academy.LogoUrl))
        {
            await DeleteStoredAssetAsync(academy.LogoUrl);
            academy.LogoUrl = null;
            await _db.SaveChangesAsync();
        }

        return Ok(new { logoUrl = (string?)null, message = "Logo deleted successfully." });
    }

    [HttpDelete("{academyId:guid}/banner")]
    [Authorize(Roles = "Instructor,OrgAdmin")]
    public async Task<IActionResult> DeleteBanner(Guid academyId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        if (!await CanManageAcademyAsync(academyId, userId))
            return Forbid("You can't manage this academy.");

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound("Academy not found.");

        if (!string.IsNullOrWhiteSpace(academy.BannerUrl))
        {
            await DeleteStoredAssetAsync(academy.BannerUrl);
            academy.BannerUrl = null;
            await _db.SaveChangesAsync();
        }

        return Ok(new { bannerUrl = (string?)null, message = "Banner deleted successfully." });
    }

    private async Task<string> SaveImageAsync(
        string containerName,
        string folder,
        Guid ownerId,
        string kind,
        IFormFile file)
    {
        var ext = file.ContentType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".img"
        };

        if (_storage.UseBlob)
        {
            var container = _blobServiceClient.GetBlobContainerClient(containerName);
            await container.CreateIfNotExistsAsync();

            var blobName = $"{folder}/{ownerId}/{kind}{ext}";
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

            return blob.Uri.ToString();
        }

        var wwwroot = Path.Combine(_env.ContentRootPath, "wwwroot");
        var dir = Path.Combine(wwwroot, "uploads", "academies", folder, ownerId.ToString("N"));
        Directory.CreateDirectory(dir);

        var filename = $"{kind}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
            await file.CopyToAsync(stream);

        return $"/uploads/academies/{folder}/{ownerId:N}/{filename}";
    }

    private async Task DeleteStoredAssetAsync(string? assetUrl)
    {
        if (string.IsNullOrWhiteSpace(assetUrl))
            return;

        if (_storage.UseBlob)
        {
            if (Uri.TryCreate(assetUrl, UriKind.Absolute, out var uri))
            {
                var container = _blobServiceClient.GetBlobContainerClient(_storage.AcademyAssetsContainer);
                var blobPath = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/');

                var containerPrefix = $"{_storage.AcademyAssetsContainer}/";
                if (blobPath.StartsWith(containerPrefix, StringComparison.OrdinalIgnoreCase))
                    blobPath = blobPath[containerPrefix.Length..];

                if (!string.IsNullOrWhiteSpace(blobPath))
                {
                    var blob = container.GetBlobClient(blobPath);
                    await blob.DeleteIfExistsAsync();
                }
            }

            return;
        }

        var clean = assetUrl.Replace('\\', '/');

        if (clean.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            return;

        clean = clean.TrimStart('~');
        if (clean.StartsWith("/"))
            clean = clean[1..];

        var fullPath = Path.Combine(_env.ContentRootPath, "wwwroot", clean.Replace('/', Path.DirectorySeparatorChar));

        if (System.IO.File.Exists(fullPath))
            System.IO.File.Delete(fullPath);
    }
}