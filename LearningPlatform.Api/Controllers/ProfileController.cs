using System.Security.Claims;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using LearningPlatform.Api.Dto;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/profile")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IWebHostEnvironment _env;
    private readonly AppDbContext _db;
    private readonly BlobServiceClient _blobServiceClient;
    private readonly StorageOptions _storage;

    public ProfileController(
        UserManager<ApplicationUser> userManager,
        IWebHostEnvironment env,
        AppDbContext db,
        BlobServiceClient blobServiceClient,
        IOptions<StorageOptions> storage)
    {
        _userManager = userManager;
        _env = env;
        _db = db;
        _blobServiceClient = blobServiceClient;
        _storage = storage.Value;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        var roles = await _userManager.GetRolesAsync(user);

        return Ok(new
        {
            userId = user.Id,
            email = user.Email,
            roles,
            displayName = user.DisplayName,
            profileImageUrl = user.ProfileImageUrl,
            phoneNumber = user.PhoneNumber
        });
    }

    [HttpPut]
    public async Task<IActionResult> Update(UpdateProfileRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        user.DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? null : req.DisplayName.Trim();
        await _userManager.UpdateAsync(user);

        return Ok(new { displayName = user.DisplayName });
    }

    [HttpPost("photo")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadPhoto([FromForm] UploadImageRequest request)
    {

         var file = request.File;
         
        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg",
            "image/png",
            "image/webp"
        };

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
            var container = _blobServiceClient.GetBlobContainerClient(_storage.UserAvatarsContainer);
            await container.CreateIfNotExistsAsync();

            // delete old blob if same container/blob url
            await TryDeleteOldAvatarBlobAsync(user.ProfileImageUrl);

            var blobName = $"{userId}_{DateTime.UtcNow:yyyyMMddHHmmssfff}{ext}";
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

            user.ProfileImageUrl = blob.Uri.ToString();
        }
        else
        {
            var webRoot = _env.WebRootPath;
            if (string.IsNullOrWhiteSpace(webRoot))
                webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");

            var dir = Path.Combine(webRoot, "uploads", "users");
            Directory.CreateDirectory(dir);

            TryDeleteOldAvatarFile(user.ProfileImageUrl, webRoot);

            var filename = $"{userId}_{DateTime.UtcNow:yyyyMMddHHmmssfff}{ext}";
            var fullPath = Path.Combine(dir, filename);

            await using (var stream = System.IO.File.Create(fullPath))
                await file.CopyToAsync(stream);

            user.ProfileImageUrl = $"/uploads/users/{filename}";
        }

        await _userManager.UpdateAsync(user);
        return Ok(new { profileImageUrl = user.ProfileImageUrl });
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CurrentPassword) || string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest("CurrentPassword and NewPassword are required.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        var result = await _userManager.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);

        if (!result.Succeeded)
        {
            var msg = string.Join(", ", result.Errors.Select(e => e.Description));
            return BadRequest(msg);
        }

        await _userManager.UpdateSecurityStampAsync(user);

        return Ok(new { message = "Password updated successfully. Please sign in again." });
    }

    [HttpPost("delete")]
    public async Task<IActionResult> DeleteAccount(DeleteAccountRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Password is required.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return Unauthorized();

        var ok = await _userManager.CheckPasswordAsync(user, req.Password);
        if (!ok) return BadRequest("Incorrect password.");

        if (_storage.UseBlob)
            await TryDeleteOldAvatarBlobAsync(user.ProfileImageUrl);
        else
        {
            var webRoot = _env.WebRootPath;
            if (string.IsNullOrWhiteSpace(webRoot))
                webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");

            TryDeleteOldAvatarFile(user.ProfileImageUrl, webRoot);
        }

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
        {
            var msg = string.Join(", ", result.Errors.Select(e => e.Description));
            return BadRequest(msg);
        }

        return Ok(new { message = "Account deleted." });
    }

    private static void TryDeleteOldAvatarFile(string? profileImageUrl, string webRoot)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(profileImageUrl)) return;
            if (profileImageUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return;

            var relative = profileImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var full = Path.Combine(webRoot, relative);

            if (System.IO.File.Exists(full))
                System.IO.File.Delete(full);
        }
        catch
        {
        }
    }

    private async Task TryDeleteOldAvatarBlobAsync(string? profileImageUrl)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(profileImageUrl)) return;
            if (!Uri.TryCreate(profileImageUrl, UriKind.Absolute, out var uri)) return;

            var container = _blobServiceClient.GetBlobContainerClient(_storage.UserAvatarsContainer);
            var blobName = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));

            var expectedPrefix = $"{container.Name}/";
            if (!blobName.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase)) return;

            blobName = blobName.Substring(expectedPrefix.Length);
            var blob = container.GetBlobClient(blobName);
            await blob.DeleteIfExistsAsync();
        }
        catch
        {
        }
    }

    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
    public record UpdateProfileRequest(string? DisplayName);
    public record DeleteAccountRequest(string Password);
}