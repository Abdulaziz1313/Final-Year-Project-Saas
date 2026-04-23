using System.Collections.Generic;

namespace LearningPlatform.Application.Features.Reviews.Dtos;

public class ReviewListResponseDto
{
    public ReviewSummaryDto Summary { get; set; } = new();
    public int Total { get; set; }

    public int Page { get; set; }
    public int PageSize { get; set; }

    public List<ReviewItemDto> Items { get; set; } = new();

    // optional convenience
    public ReviewItemDto? MyReview { get; set; }
}
