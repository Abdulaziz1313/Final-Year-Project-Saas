using System;

namespace LearningPlatform.Domain.Entities;

public class AcademyReview
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AcademyId { get; set; }

    public Guid UserId { get; set; }

    public int Rating { get; set; } // 1..5

    public string? Comment { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}
