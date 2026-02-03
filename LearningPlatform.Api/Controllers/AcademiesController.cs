using System.Security.Claims;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using LearningPlatform.Api.Services;
using System.Linq;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/academies")]
public class AcademiesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationWriter _notifs;
    private readonly IWebHostEnvironment _env;

    public AcademiesController(AppDbContext db, NotificationWriter notifs, IWebHostEnvironment env)
    {
        _db = db;
        _notifs = notifs;
        _env = env;
    }

    public record CreateAcademyRequest(
        string Name,
        string? Slug,
        string? Description,
        string? Website,
        string? PrimaryColor,
        string? FontKey,
        bool? IsPublished
    );

    public record UpdateBrandingRequest(
        string? PrimaryColor,
        string? FontKey
    );

    public record PublishRequest(bool IsPublished);

    public record AcademyPublicDto(
        string Name,
        string Slug,
        string? Description,
        string? Website,
        string PrimaryColor,
        string? LogoUrl,
        string? BannerUrl,
        string FontKey,
        string? CustomFontUrl,
        string? CustomFontFamily,
        string BrandingJson,
        string LayoutJson,
        bool IsPublished,
        DateTimeOffset? PublishedAt
    );

    [HttpPost]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> Create(CreateAcademyRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var baseSlug = string.IsNullOrWhiteSpace(req.Slug) ? req.Name : req.Slug;
        var slug = Slugify(baseSlug);

        if (string.IsNullOrWhiteSpace(slug))
            return BadRequest("Slug is invalid.");

        if (await _db.Academies.AnyAsync(a => a.Slug == slug))
            slug = $"{slug}-{Guid.NewGuid().ToString("N")[..6]}";

        var fontKey = NormalizeFontKey(req.FontKey);

        var publish = req.IsPublished ?? false;

        var academy = new Academy
        {
            Name = req.Name.Trim(),
            Slug = slug,
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            Website = string.IsNullOrWhiteSpace(req.Website) ? null : req.Website.Trim(),
            PrimaryColor = string.IsNullOrWhiteSpace(req.PrimaryColor) ? "#7c3aed" : req.PrimaryColor.Trim(),
            FontKey = fontKey,
            OwnerUserId = userId,

            IsPublished = publish,
            PublishedAt = publish ? DateTimeOffset.UtcNow : null,

            // if you added moderation fields to Academy, keep it not hidden by default
            IsHidden = false,
            HiddenReason = null,
            HiddenAt = null,
            HiddenByUserId = null
        };

        _db.Academies.Add(academy);
        await _db.SaveChangesAsync();

        await _notifs.Add(
            userId,
            "Academy created",
            $"Your academy \"{academy.Name}\" was created.",
            "success",
            $"/instructor/courses/{academy.Id}"
        );

        return CreatedAtAction(nameof(GetBySlug), new { slug = academy.Slug },
            new { academy.Id, academy.Slug });
    }

    // ✅ Public endpoint includes branding and publish state
    [HttpGet("by-slug/{slug}")]
    [AllowAnonymous]
    public async Task<ActionResult<AcademyPublicDto>> GetBySlug(string slug)
    {
        var a = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(x => x.Slug == slug);
        if (a is null) return NotFound();

        // ✅ Moderation: hidden academies should NOT be visible publicly.
        // Only Admin can view hidden academies (even owner shouldn't).
        if (a.IsHidden)
        {
            var isAdmin = User.IsInRole("Admin");
            if (!isAdmin) return NotFound();
        }

        // ✅ Hide drafts from anonymous/public users.
        // Allow owner (authenticated) to preview their own draft.
        if (!a.IsPublished)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var isOwner = !string.IsNullOrWhiteSpace(userId) && a.OwnerUserId == userId;
            var isAdmin = User.IsInRole("Admin");
            if (!isOwner && !isAdmin)
                return NotFound();
        }

        return new AcademyPublicDto(
            a.Name,
            a.Slug,
            a.Description,
            a.Website,
            a.PrimaryColor,
            a.LogoUrl,
            a.BannerUrl,
            a.FontKey ?? "system",
            a.CustomFontUrl,
            a.CustomFontFamily,
            a.BrandingJson,
            a.LayoutJson,
            a.IsPublished,
            a.PublishedAt
        );
    }

    // ✅ Publish/Unpublish
    [HttpPut("{academyId:guid}/publish")]
    [Authorize(Roles = "Instructor,Admin")]
    public async Task<IActionResult> SetPublish(Guid academyId, PublishRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (academy.OwnerUserId != userId && !User.IsInRole("Admin"))
            return Forbid("You don't own this academy.");

        // ✅ Prevent publishing hidden academies
        if (academy.IsHidden && req.IsPublished)
            return BadRequest("This academy is hidden by an admin and cannot be published.");

        academy.IsPublished = req.IsPublished;
        academy.PublishedAt = req.IsPublished ? (academy.PublishedAt ?? DateTimeOffset.UtcNow) : null;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ✅ Update branding like Salla (color/font selection)
    [HttpPut("{academyId:guid}/branding")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> UpdateBranding(Guid academyId, UpdateBrandingRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (academy.OwnerUserId != userId)
            return Forbid("You don't own this academy.");

        if (!string.IsNullOrWhiteSpace(req.PrimaryColor))
            academy.PrimaryColor = req.PrimaryColor.Trim();

        if (!string.IsNullOrWhiteSpace(req.FontKey))
        {
            var fk = NormalizeFontKey(req.FontKey);
            academy.FontKey = fk;

            if (fk != "custom")
            {
                academy.CustomFontFamily = null;
                academy.CustomFontUrl = null;
            }
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ✅ Upload custom font file
    [HttpPost("{academyId:guid}/font")]
    [Authorize(Roles = "Instructor")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadFont(Guid academyId, IFormFile file)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (academy.OwnerUserId != userId)
            return Forbid("You don't own this academy.");

        if (file == null || file.Length == 0) return BadRequest("No file uploaded.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowed = new HashSet<string> { ".woff2", ".woff", ".ttf", ".otf" };
        if (!allowed.Contains(ext))
            return BadRequest("Invalid font type. Allowed: .woff2, .woff, .ttf, .otf");

        if (file.Length > 10 * 1024 * 1024)
            return BadRequest("Font file is too large (max 10MB).");

        var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var folder = Path.Combine(webRoot, "uploads", "academies", "fonts", academyId.ToString("N"));
        Directory.CreateDirectory(folder);

        var safeName = $"font-{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(folder, safeName);

        await using (var stream = System.IO.File.Create(fullPath))
        {
            await file.CopyToAsync(stream);
        }

        var urlPath = $"/uploads/academies/fonts/{academyId:N}/{safeName}";

        academy.FontKey = "custom";
        academy.CustomFontUrl = urlPath;
        academy.CustomFontFamily = "AlefCustomFont";

        await _db.SaveChangesAsync();

        return Ok(new { academy.FontKey, academy.CustomFontUrl, academy.CustomFontFamily });
    }

    // ✅ Upload banner
    [HttpPost("{academyId:guid}/banner")]
    [Authorize(Roles = "Instructor")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadBanner(Guid academyId, IFormFile file)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (academy.OwnerUserId != userId)
            return Forbid("You don't own this academy.");

        if (file == null || file.Length == 0) return BadRequest("No file uploaded.");

        if (!new[] { "image/jpeg", "image/png", "image/webp" }.Contains(file.ContentType))
            return BadRequest("Invalid image type. Allowed: JPG, PNG, WEBP");

        if (file.Length > 5 * 1024 * 1024)
            return BadRequest("Max 5MB");

        var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var folder = Path.Combine(webRoot, "uploads", "academies", "banners", academyId.ToString("N"));
        Directory.CreateDirectory(folder);

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var safeName = $"banner-{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(folder, safeName);

        await using (var stream = System.IO.File.Create(fullPath))
        {
            await file.CopyToAsync(stream);
        }

        var urlPath = $"/uploads/academies/banners/{academyId:N}/{safeName}";
        academy.BannerUrl = urlPath;

        await _db.SaveChangesAsync();

        return Ok(new { bannerUrl = academy.BannerUrl });
    }

    [HttpDelete("{academyId:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> Delete(Guid academyId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (academy.OwnerUserId != userId)
            return Forbid("You don't own this academy.");

        _db.Academies.Remove(academy);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private static string NormalizeFontKey(string? fontKey)
    {
        var fk = (fontKey ?? "system").Trim().ToLowerInvariant();
        var allowed = new HashSet<string> { "system", "inter", "poppins", "cairo", "tajawal", "ibmplexar", "custom" };
        return allowed.Contains(fk) ? fk : "system";
    }

    private static string Slugify(string input)
    {
        input = input.Trim().ToLowerInvariant();
        var chars = input.Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray();
        var slug = new string(chars);
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        return slug.Trim('-');
    }
}
