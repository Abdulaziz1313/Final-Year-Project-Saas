using System.Security.Claims;
using LearningPlatform.Application.Features.Reviews.Dtos;
using LearningPlatform.Application.Features.Reviews.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/reviews")]
public class ReviewsController : ControllerBase
{
    private readonly IReviewsService _reviewsService;

    public ReviewsController(IReviewsService reviewsService)
    {
        _reviewsService = reviewsService;
    }

    // GET: /api/reviews/courses/{courseId}?page=1&pageSize=8
    [HttpGet("courses/{courseId:guid}")]
    public async Task<ActionResult<ReviewListResponseDto>> ListCourseReviews(
        Guid courseId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 8,
        CancellationToken cancellationToken = default)
    {
        var result = await _reviewsService.ListCourseReviewsAsync(
            courseId,
            page,
            pageSize,
            GetCurrentUserId(),
            cancellationToken);

        return Ok(result.Value);
    }

    // GET: /api/reviews/courses/{courseId}/mine
    [Authorize(Roles = "Student")]
    [HttpGet("courses/{courseId:guid}/mine")]
    public async Task<ActionResult<ReviewItemDto>> GetMyCourseReview(
        Guid courseId,
        CancellationToken cancellationToken = default)
    {
        var result = await _reviewsService.GetMyCourseReviewAsync(
            courseId,
            GetCurrentUserId(),
            cancellationToken);

        if (!result.Succeeded)
        {
            if (result.Error == "Unauthorized.")
                return Unauthorized();

            if (result.Error == "Review not found.")
                return NotFound();

            return BadRequest(result.Error);
        }

        return Ok(result.Value);
    }

    // POST: /api/reviews/courses/{courseId}
    [Authorize(Roles = "Student")]
    [HttpPost("courses/{courseId:guid}")]
    public async Task<ActionResult> UpsertCourseReview(
        Guid courseId,
        [FromBody] UpsertReviewRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _reviewsService.UpsertCourseReviewAsync(
            courseId,
            request,
            GetCurrentUserId(),
            cancellationToken);

        if (!result.Succeeded)
        {
            if (result.Error == "Unauthorized.")
                return Unauthorized();

            return BadRequest(result.Error);
        }

        return Ok(new { message = "Review saved." });
    }

    private string? GetCurrentUserId()
    {
        return User.FindFirstValue(ClaimTypes.NameIdentifier);
    }
}