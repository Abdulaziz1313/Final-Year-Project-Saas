using LearningPlatform.Application.Common.Interfaces;
using LearningPlatform.Application.Common.Models;
using LearningPlatform.Application.Features.Reviews.Dtos;
using LearningPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Application.Features.Reviews.Services;

public class ReviewsService : IReviewsService
{
    private readonly IAppDbContext _db;
    private readonly IIdentityUserLookupService _identityUserLookupService;

    public ReviewsService(
        IAppDbContext db,
        IIdentityUserLookupService identityUserLookupService)
    {
        _db = db;
        _identityUserLookupService = identityUserLookupService;
    }

    public async Task<Result<ReviewListResponseDto>> ListCourseReviewsAsync(
        Guid courseId,
        int page,
        int pageSize,
        string? currentUserId,
        CancellationToken cancellationToken = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 8 : Math.Min(pageSize, 50);

        var baseQ = _db.CourseReviews
            .AsNoTracking()
            .Where(r => r.CourseId == courseId);

        var total = await baseQ.CountAsync(cancellationToken);

        var summary = await baseQ
            .GroupBy(_ => 1)
            .Select(g => new ReviewSummaryDto
            {
                Count = g.Count(),
                AvgRating = g.Average(x => (double)x.Rating)
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? new ReviewSummaryDto { Count = 0, AvgRating = 0 };

        var rows = await baseQ
            .OrderByDescending(r => r.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                r.Rating,
                r.Comment,
                r.CreatedAt,
                r.UpdatedAt,
                r.UserId
            })
            .ToListAsync(cancellationToken);

        var userIdStrings = rows
            .Select(x => x.UserId.ToString())
            .Distinct()
            .ToList();

        var users = await _identityUserLookupService.GetUsersByIdsAsync(userIdStrings, cancellationToken);

        var items = rows.Select(r =>
        {
            var u = users.FirstOrDefault(x => x.Id == r.UserId.ToString());

            return new ReviewItemDto
            {
                Id = r.Id,
                Rating = r.Rating,
                Comment = r.Comment,
                CreatedAt = r.CreatedAt.ToString(),
                UpdatedAt = r.UpdatedAt.ToString(),
                UserDisplayName = string.IsNullOrWhiteSpace(u?.DisplayName) ? null : u.DisplayName,
                UserEmailMasked = string.IsNullOrWhiteSpace(u?.DisplayName) ? MaskEmail(u?.Email) : null
            };
        }).ToList();

        ReviewItemDto? myDto = null;
        var myGuid = ParseGuid(currentUserId);

        if (myGuid.HasValue)
        {
            var mine = await _db.CourseReviews
                .AsNoTracking()
                .Where(x => x.CourseId == courseId && x.UserId == myGuid.Value)
                .OrderByDescending(x => x.UpdatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (mine != null)
            {
                myDto = new ReviewItemDto
                {
                    Id = mine.Id,
                    Rating = mine.Rating,
                    Comment = mine.Comment,
                    CreatedAt = mine.CreatedAt.ToString(),
                    UpdatedAt = mine.UpdatedAt.ToString()
                };
            }
        }

        return Result<ReviewListResponseDto>.Success(new ReviewListResponseDto
        {
            Summary = summary,
            Total = total,
            Page = page,
            PageSize = pageSize,
            Items = items,
            MyReview = myDto
        });
    }

    public async Task<Result<ReviewItemDto>> GetMyCourseReviewAsync(
        Guid courseId,
        string? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var myGuid = ParseGuid(currentUserId);
        if (!myGuid.HasValue)
            return Result<ReviewItemDto>.Failure("Unauthorized.");

        var mine = await _db.CourseReviews
            .AsNoTracking()
            .Where(x => x.CourseId == courseId && x.UserId == myGuid.Value)
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (mine == null)
            return Result<ReviewItemDto>.Failure("Review not found.");

        return Result<ReviewItemDto>.Success(new ReviewItemDto
        {
            Id = mine.Id,
            Rating = mine.Rating,
            Comment = mine.Comment,
            CreatedAt = mine.CreatedAt.ToString(),
            UpdatedAt = mine.UpdatedAt.ToString()
        });
    }

    public async Task<Result> UpsertCourseReviewAsync(
        Guid courseId,
        UpsertReviewRequest request,
        string? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var myGuid = ParseGuid(currentUserId);
        if (!myGuid.HasValue)
            return Result.Failure("Unauthorized.");

        if (request.Rating < 1 || request.Rating > 5)
            return Result.Failure("Rating must be between 1 and 5.");

        var existing = await _db.CourseReviews
            .FirstOrDefaultAsync(x => x.CourseId == courseId && x.UserId == myGuid.Value, cancellationToken);

        if (existing == null)
        {
            _db.CourseReviews.Add(new CourseReview
            {
                CourseId = courseId,
                UserId = myGuid.Value,
                Rating = request.Rating,
                Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim(),
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            existing.Rating = request.Rating;
            existing.Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim();
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    private static Guid? ParseGuid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return Guid.TryParse(value, out var guid) ? guid : null;
    }

    private static string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
            return "student@***";

        var parts = email.Split('@');
        var name = parts[0];
        var domain = parts[1];
        var prefix = name.Length <= 2 ? name : name[..2];

        return $"{prefix}***@{domain}";
    }
}