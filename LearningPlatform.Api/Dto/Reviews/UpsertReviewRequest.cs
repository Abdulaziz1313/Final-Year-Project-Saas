namespace LearningPlatform.Api.Dto.Reviews;

public class UpsertReviewRequest
{
    public int Rating { get; set; } // 1..5
    public string? Comment { get; set; }
}
