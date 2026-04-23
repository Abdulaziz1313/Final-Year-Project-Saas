namespace LearningPlatform.Application.Features.Reviews.Dtos;

public class UpsertReviewRequest
{
    public int Rating { get; set; } // 1..5
    public string? Comment { get; set; }
}
