using LearningPlatform.Application.Common.Models;
using LearningPlatform.Application.Features.Reviews.Dtos;

namespace LearningPlatform.Application.Features.Reviews.Services;

public interface IReviewsService
{
    Task<Result<ReviewListResponseDto>> ListCourseReviewsAsync(
        Guid courseId,
        int page,
        int pageSize,
        string? currentUserId,
        CancellationToken cancellationToken = default);

    Task<Result<ReviewItemDto>> GetMyCourseReviewAsync(
        Guid courseId,
        string? currentUserId,
        CancellationToken cancellationToken = default);

    Task<Result> UpsertCourseReviewAsync(
        Guid courseId,
        UpsertReviewRequest request,
        string? currentUserId,
        CancellationToken cancellationToken = default);
}