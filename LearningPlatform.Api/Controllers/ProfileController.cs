using System.Linq;
using System.Security.Claims;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
            profileImageUrl = user.ProfileImageUrl
        });
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
        var dir = Path.Combine(wwwroot, "uploads", "users");
        Directory.CreateDirectory(dir);

        var filename = $"{userId}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
        {
            await file.CopyToAsync(stream);
        }

        user.ProfileImageUrl = $"/uploads/users/{filename}";
        await _userManager.UpdateAsync(user);

        return Ok(new { profileImageUrl = user.ProfileImageUrl });
    }

    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

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

    public record UpdateProfileRequest(string? DisplayName);

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

    public record DeleteAccountRequest(string Password);

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

        // ✅ Student data (only if these tables exist in your project)
        _db.Enrollments.RemoveRange(_db.Enrollments.Where(e => e.StudentUserId == userId));
        _db.LessonProgress.RemoveRange(_db.LessonProgress.Where(p => p.StudentUserId == userId));

        // ✅ Instructor data: academies + courses tree
        var academyIds = await _db.Academies
            .Where(a => a.OwnerUserId == userId)
            .Select(a => a.Id)
            .ToListAsync();

        if (academyIds.Count > 0)
        {
            var courseIds = await _db.Courses
                .Where(c => academyIds.Contains(c.AcademyId))
                .Select(c => c.Id)
                .ToListAsync();

            if (courseIds.Count > 0)
            {
                var moduleIds = await _db.Modules
                    .Where(m => courseIds.Contains(m.CourseId))
                    .Select(m => m.Id)
                    .ToListAsync();

                if (moduleIds.Count > 0)
                {
                    var lessonIds = await _db.Lessons
                        .Where(l => moduleIds.Contains(l.ModuleId))
                        .Select(l => l.Id)
                        .ToListAsync();

                    if (lessonIds.Count > 0)
                    {
                        // remove progress for those lessons (all students)
                        _db.LessonProgress.RemoveRange(_db.LessonProgress.Where(p => lessonIds.Contains(p.LessonId)));
                        _db.Lessons.RemoveRange(_db.Lessons.Where(l => lessonIds.Contains(l.Id)));
                    }

                    _db.Modules.RemoveRange(_db.Modules.Where(m => moduleIds.Contains(m.Id)));
                }

                // remove enrollments for those courses (all students)
                _db.Enrollments.RemoveRange(_db.Enrollments.Where(e => courseIds.Contains(e.CourseId)));
                _db.Courses.RemoveRange(_db.Courses.Where(c => courseIds.Contains(c.Id)));
            }

            _db.Academies.RemoveRange(_db.Academies.Where(a => academyIds.Contains(a.Id)));
        }

        await _db.SaveChangesAsync();

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
        {
            var msg = string.Join(", ", result.Errors.Select(e => e.Description));
            return BadRequest(msg);
        }

        return Ok(new { message = "Account deleted." });
    }
}
