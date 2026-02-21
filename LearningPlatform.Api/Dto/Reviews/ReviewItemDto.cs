using System;

namespace LearningPlatform.Api.Dto.Reviews;

public class ReviewItemDto
{
    public Guid Id { get; set; }

    public int Rating { get; set; }

    public string? Comment { get; set; }

    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }

    // display (safe)
    public string? UserDisplayName { get; set; }
    public string? UserEmailMasked { get; set; }
}
