using System.Security.Claims;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/profile")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IWebHostEnvironment _env;
    private readonly AppDbContext _db;

    public ProfileController(
        UserManager<ApplicationUser> userManager,
        IWebHostEnvironment env,
        AppDbContext db)
    {
        _userManager = userManager;
        _env = env;
        _db = db;
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

            // ✅ Phone number from Identity (what user registered with)
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
    [RequestSizeLimit(5 * 1024 * 1024)] // 5MB
    public async Task<IActionResult> UploadPhoto([FromForm] IFormFile file)
    {
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

        // ✅ Correct place for static served files
        var webRoot = _env.WebRootPath;
        if (string.IsNullOrWhiteSpace(webRoot))
        {
            // fallback (rare)
            webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");
        }

        var dir = Path.Combine(webRoot, "uploads", "users");
        Directory.CreateDirectory(dir);

        // ✅ Delete previous avatar file if it exists (optional but good)
        TryDeleteOldAvatarFile(user.ProfileImageUrl, webRoot);

        // ✅ Unique file name prevents caching issues
        var filename = $"{userId}_{DateTime.UtcNow:yyyyMMddHHmmssfff}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
        {
            await file.CopyToAsync(stream);
        }

        user.ProfileImageUrl = $"/uploads/users/{filename}";
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

        // ✅ Optional: delete avatar file
        var webRoot = _env.WebRootPath;
        if (string.IsNullOrWhiteSpace(webRoot))
            webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");

        TryDeleteOldAvatarFile(user.ProfileImageUrl, webRoot);

        // ✅ IMPORTANT:
        // Do NOT hard-code deletions of tables that might not exist in your project,
        // otherwise the API won't compile. Prefer cascade deletes in DB.
        // If you need manual cleanup, add it here based on your real DbSets.

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

            // profileImageUrl example: "/uploads/users/xxx.webp"
            var relative = profileImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var full = Path.Combine(webRoot, relative);

            if (System.IO.File.Exists(full))
                System.IO.File.Delete(full);
        }
        catch
        {
            // ignore file delete failures
        }
    }

    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
    public record UpdateProfileRequest(string? DisplayName);
    public record DeleteAccountRequest(string Password);
}
