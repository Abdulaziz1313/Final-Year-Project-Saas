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
        string? BrandingJson,
        string? LayoutJson,
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
        string? OrgName,
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

        var orgActive = await IsOrganizationActiveAsync(orgId.Value);
        if (!orgActive) return BadRequest("Your organization is disabled. Contact an admin.");

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
            OrganizationId = orgId.Value,
            Name = req.Name.Trim(),
            Slug = slug,
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            Website = string.IsNullOrWhiteSpace(req.Website) ? null : req.Website.Trim(),
            PrimaryColor = string.IsNullOrWhiteSpace(req.PrimaryColor) ? "#7c3aed" : req.PrimaryColor.Trim(),
            FontKey = fontKey,
            BrandingJson = string.IsNullOrWhiteSpace(req.BrandingJson) ? "{}" : req.BrandingJson.Trim(),
            LayoutJson = string.IsNullOrWhiteSpace(req.LayoutJson) ? "{}" : req.LayoutJson.Trim(),
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

        return CreatedAtAction(
            nameof(GetBySlug),
            new { slug = academy.Slug },
            new
            {
                academy.Id,
                academy.Name,
                academy.Slug,
                academy.Description,
                academy.Website,
                academy.PrimaryColor,
                academy.LogoUrl,
                academy.BannerUrl,
                academy.FontKey,
                academy.BrandingJson,
                academy.LayoutJson
            }
        );
    }

    [HttpGet("by-slug/{slug}")]
    [AllowAnonymous]
    public async Task<ActionResult<AcademyPublicDto>> GetBySlug(string slug)
    {
        var a = await _db.Academies
            .AsNoTracking()
            .Include(x => x.Organization)
            .FirstOrDefaultAsync(x => x.Slug == slug);

        if (a is null) return NotFound();

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

        if (a.IsHidden)
        {
            var isAdmin = User.IsInRole("Admin");
            if (!isAdmin) return NotFound();
        }

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
            a.Organization?.Name,
            string.IsNullOrWhiteSpace(a.BrandingJson) ? "{}" : a.BrandingJson,
            string.IsNullOrWhiteSpace(a.LayoutJson) ? "{}" : a.LayoutJson,
            a.IsPublished,
            a.PublishedAt
        );
    }

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
            var orgId = await GetMyOrganizationIdAsync(userId);
            if (orgId is null) return Forbid("Instructor is not assigned to an organization.");

            if (academy.OwnerUserId != userId || academy.OrganizationId != orgId.Value)
                return Forbid("You don't own this academy.");

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

    [HttpPut("{academyId:guid}/branding")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> UpdateBranding(Guid academyId, UpdateBrandingRequest req)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await LoadOwnedAcademyForInstructor(academyId, userId);
        if (academy is null) return Forbid("You don't own this academy (or you're not assigned to an organization).");

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

    [HttpDelete("{academyId:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> Delete(Guid academyId)
    {
        var userId = UserId();
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var academy = await LoadOwnedAcademyForInstructor(academyId, userId);
        if (academy is null) return Forbid("You don't own this academy (or you're not assigned to an organization).");

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