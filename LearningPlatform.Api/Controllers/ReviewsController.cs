using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using LearningPlatform.Api.Dto.Reviews;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/reviews")]
public class ReviewsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public ReviewsController(AppDbContext db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    // ---------------------------
    // Courses Reviews
    // ---------------------------

    // GET: /api/reviews/courses/{courseId}?page=1&pageSize=8
    [HttpGet("courses/{courseId:guid}")]
    public async Task<ActionResult<ReviewListResponseDto>> ListCourseReviews(
        Guid courseId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 8)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 8 : Math.Min(pageSize, 50);

        var baseQ = _db.CourseReviews
            .AsNoTracking()
            .Where(r => r.CourseId == courseId);

        var total = await baseQ.CountAsync();

        var summary = await baseQ
            .GroupBy(_ => 1)
            .Select(g => new ReviewSummaryDto
            {
                Count = g.Count(),
                AvgRating = g.Average(x => (double)x.Rating)
            })
            .FirstOrDefaultAsync() ?? new ReviewSummaryDto { Count = 0, AvgRating = 0 };

        var rows = await baseQ
            .OrderByDescending(r => r.UpdatedAt) // DateTimeOffset
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                r.Rating,
                r.Comment,
                r.CreatedAt,
                r.UpdatedAt,
                r.UserId // Guid
            })
            .ToListAsync();

        // Identity user id is string, review UserId is Guid -> compare with ToString()
        var userIdStrings = rows.Select(x => x.UserId.ToString()).Distinct().ToList();

        var users = await _userManager.Users
            .AsNoTracking()
            .Where(u => userIdStrings.Contains(u.Id))
            .Select(u => new { u.Id, u.Email, u.DisplayName })
            .ToListAsync();

        static string MaskEmail(string? email)
        {
            if (string.IsNullOrWhiteSpace(email) || !email.Contains("@")) return "student@***";
            var parts = email.Split('@');
            var name = parts[0];
            var domain = parts[1];
            var prefix = name.Length <= 2 ? name : name.Substring(0, 2);
            return $"{prefix}***@{domain}";
        }

        var items = rows.Select(r =>
        {
            var u = users.FirstOrDefault(x => x.Id == r.UserId.ToString());
            return new ReviewItemDto
            {
                Id = r.Id,
                Rating = r.Rating,
                Comment = r.Comment,
                CreatedAt = r.CreatedAt.ToString(),
                UpdatedAt = r.UpdatedAt.ToString(), // ✅ removed ?.
                UserDisplayName = string.IsNullOrWhiteSpace(u?.DisplayName) ? null : u!.DisplayName,
                UserEmailMasked = string.IsNullOrWhiteSpace(u?.DisplayName) ? MaskEmail(u?.Email) : null
            };
        }).ToList();

        // Optional: include my review (also returned as MyReview)
        ReviewItemDto? myDto = null;
        var myGuid = GetUserIdGuidOrNull();
        if (myGuid.HasValue)
        {
            var mine = await _db.CourseReviews
                .AsNoTracking()
                .Where(x => x.CourseId == courseId && x.UserId == myGuid.Value)
                .OrderByDescending(x => x.UpdatedAt)
                .FirstOrDefaultAsync();

            if (mine != null)
            {
                myDto = new ReviewItemDto
                {
                    Id = mine.Id,
                    Rating = mine.Rating,
                    Comment = mine.Comment,
                    CreatedAt = mine.CreatedAt.ToString(),
                    UpdatedAt = mine.UpdatedAt.ToString(), // ✅ removed ?.
                };
            }
        }

        return Ok(new ReviewListResponseDto
        {
            Summary = summary,
            Total = total,
            Page = page,
            PageSize = pageSize,
            Items = items,
            MyReview = myDto
        });
    }

    // GET: /api/reviews/courses/{courseId}/mine
    [Authorize(Roles = "Student")]
    [HttpGet("courses/{courseId:guid}/mine")]
    public async Task<ActionResult<ReviewItemDto>> GetMyCourseReview(Guid courseId)
    {
        var myGuid = GetUserIdGuidOrNull();
        if (!myGuid.HasValue) return Unauthorized();

        var mine = await _db.CourseReviews
            .AsNoTracking()
            .Where(x => x.CourseId == courseId && x.UserId == myGuid.Value)
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync();

        if (mine == null) return NotFound();

        return Ok(new ReviewItemDto
        {
            Id = mine.Id,
            Rating = mine.Rating,
            Comment = mine.Comment,
            CreatedAt = mine.CreatedAt.ToString(),
            UpdatedAt = mine.UpdatedAt.ToString(), // ✅ removed ?.
        });
    }

    // POST: /api/reviews/courses/{courseId}
    [Authorize(Roles = "Student")]
    [HttpPost("courses/{courseId:guid}")]
    public async Task<ActionResult> UpsertCourseReview(Guid courseId, [FromBody] UpsertReviewRequest req)
    {
        var myGuid = GetUserIdGuidOrNull();
        if (!myGuid.HasValue) return Unauthorized();

        if (req.Rating < 1 || req.Rating > 5)
            return BadRequest("Rating must be between 1 and 5.");

        var existing = await _db.CourseReviews
            .Where(x => x.CourseId == courseId && x.UserId == myGuid.Value)
            .FirstOrDefaultAsync();

        if (existing == null)
        {
            _db.CourseReviews.Add(new CourseReview
            {
                CourseId = courseId,
                UserId = myGuid.Value,
                Rating = req.Rating,
                Comment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim(),
                CreatedAt = DateTimeOffset.UtcNow, // ✅ DateTimeOffset
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            existing.Rating = req.Rating;
            existing.Comment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim();
            existing.UpdatedAt = DateTimeOffset.UtcNow; // ✅ DateTimeOffset
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Review saved." });
    }

    // ---------------------------
    // helpers
    // ---------------------------
    private Guid? GetUserIdGuidOrNull()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(raw)) return null;
        return Guid.TryParse(raw, out var g) ? g : null;
    }
}
