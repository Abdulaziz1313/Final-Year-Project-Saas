// AcademiesController.cs
using System.Security.Claims;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using LearningPlatform.Api.Services;

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

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    private async Task<Guid?> GetMyOrganizationIdAsync(string userId)
    {
        return await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.OrganizationId)
            .FirstOrDefaultAsync();
    }

    private async Task<bool> IsOrganizationActiveAsync(Guid orgId)
    {
        return await _db.Organizations
            .AsNoTracking()
            .Where(o => o.Id == orgId)
            .Select(o => o.IsActive)
            .FirstOrDefaultAsync();
    }

    private async Task<Academy?> LoadOwnedAcademyForInstructor(Guid academyId, string userId)
    {
        var orgId = await GetMyOrganizationIdAsync(userId);
        if (orgId is null) return null;

        return await _db.Academies.FirstOrDefaultAsync(a =>
            a.Id == academyId &&
            a.OwnerUserId == userId &&
            a.OrganizationId == orgId.Value
        );
    }

    [HttpPost]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> Create(CreateAcademyRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var orgId = await GetMyOrganizationIdAsync(userId);
        if (orgId is null) return Forbid("Instructor is not assigned to an organization.");

        // ✅ NEW: org must be active
        var orgActive = await IsOrganizationActiveAsync(orgId.Value);
        if (!orgActive) return BadRequest("Your organization is disabled. Contact an admin.");

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var baseSlug = string.IsNullOrWhiteSpace(req.Slug) ? req.Name : req.Slug;
        var slug = Slugify(baseSlug);

        if (string.IsNullOrWhiteSpace(slug))
            return BadRequest("Slug is invalid.");

        // Slug uniqueness (global)
        if (await _db.Academies.AnyAsync(a => a.Slug == slug))
            slug = $"{slug}-{Guid.NewGuid().ToString("N")[..6]}";

        var fontKey = NormalizeFontKey(req.FontKey);

        var publish = req.IsPublished ?? false;

        var academy = new Academy
        {
            OrganizationId = orgId.Value,

            Name = req.Name.Trim(),
            Slug = slug,
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            Website = string.IsNullOrWhiteSpace(req.Website) ? null : req.Website.Trim(),
            PrimaryColor = string.IsNullOrWhiteSpace(req.PrimaryColor) ? "#7c3aed" : req.PrimaryColor.Trim(),
            FontKey = fontKey,
            OwnerUserId = userId,

            IsPublished = publish,
            PublishedAt = publish ? DateTimeOffset.UtcNow : null,

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

        // ✅ NEW: if org disabled, academy is not publicly visible (admin can still view)
        if (a.OrganizationId != Guid.Empty)
        {
            var orgActive = await _db.Organizations.AsNoTracking()
                .Where(o => o.Id == a.OrganizationId)
                .Select(o => o.IsActive)
                .FirstOrDefaultAsync();

            if (!orgActive)
            {
                var isAdmin = User.IsInRole("Admin");
                if (!isAdmin) return NotFound();
            }
        }

        // ✅ Moderation: hidden academies should NOT be visible publicly.
        if (a.IsHidden)
        {
            var isAdmin = User.IsInRole("Admin");
            if (!isAdmin) return NotFound();
        }

        // ✅ Hide drafts from anonymous/public users.
        // Allow owner (authenticated) to preview their own draft.
        if (!a.IsPublished)
        {
            var userId = UserId();
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
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await _db.Academies.FirstOrDefaultAsync(a => a.Id == academyId);
        if (academy is null) return NotFound();

        if (!User.IsInRole("Admin"))
        {
            // Instructor must own + match org
            var orgId = await GetMyOrganizationIdAsync(userId);
            if (orgId is null) return Forbid("Instructor is not assigned to an organization.");

            if (academy.OwnerUserId != userId || academy.OrganizationId != orgId.Value)
                return Forbid("You don't own this academy.");

            // ✅ NEW: org must be active to publish
            var orgActive = await IsOrganizationActiveAsync(orgId.Value);
            if (!orgActive && req.IsPublished)
                return BadRequest("Your organization is disabled. Contact an admin.");
        }

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
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await LoadOwnedAcademyForInstructor(academyId, userId);
        if (academy is null) return Forbid("You don't own this academy (or you're not assigned to an organization).");

        // ✅ NEW: org must be active to modify
        var orgId = await GetMyOrganizationIdAsync(userId);
        if (orgId is null) return Forbid("Instructor is not assigned to an organization.");
        var orgActive = await IsOrganizationActiveAsync(orgId.Value);
        if (!orgActive) return BadRequest("Your organization is disabled. Contact an admin.");

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
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await LoadOwnedAcademyForInstructor(academyId, userId);
        if (academy is null) return Forbid("You don't own this academy (or you're not assigned to an organization).");

        // ✅ NEW: org must be active
        var orgId = await GetMyOrganizationIdAsync(userId);
        if (orgId is null) return Forbid("Instructor is not assigned to an organization.");
        var orgActive = await IsOrganizationActiveAsync(orgId.Value);
        if (!orgActive) return BadRequest("Your organization is disabled. Contact an admin.");

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
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await LoadOwnedAcademyForInstructor(academyId, userId);
        if (academy is null) return Forbid("You don't own this academy (or you're not assigned to an organization).");

        // ✅ NEW: org must be active
        var orgId = await GetMyOrganizationIdAsync(userId);
        if (orgId is null) return Forbid("Instructor is not assigned to an organization.");
        var orgActive = await IsOrganizationActiveAsync(orgId.Value);
        if (!orgActive) return BadRequest("Your organization is disabled. Contact an admin.");

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
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await LoadOwnedAcademyForInstructor(academyId, userId);
        if (academy is null) return Forbid("You don't own this academy (or you're not assigned to an organization).");

        // ✅ NEW: org must be active to delete (optional, but consistent)
        var orgId = await GetMyOrganizationIdAsync(userId);
        if (orgId is null) return Forbid("Instructor is not assigned to an organization.");
        var orgActive = await IsOrganizationActiveAsync(orgId.Value);
        if (!orgActive) return BadRequest("Your organization is disabled. Contact an admin.");

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