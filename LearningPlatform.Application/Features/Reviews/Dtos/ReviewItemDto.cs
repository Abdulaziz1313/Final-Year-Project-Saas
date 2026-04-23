namespace LearningPlatform.Application.Features.Reviews.Dtos;

public class ReviewItemDto
{
    public Guid Id { get; set; }

    public int Rating { get; set; }

    public string? Comment { get; set; }

    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }

    public string? UserDisplayName { get; set; }
    public string? UserEmailMasked { get; set; }
}