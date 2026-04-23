using System.ComponentModel.DataAnnotations;

namespace LearningPlatform.Domain.Entities;

public class LessonAiSummary
{
    public Guid Id { get; set; }

    public Guid LessonId { get; set; }

    [MaxLength(4000)]
    public string Summary { get; set; } = string.Empty;

    public string KeyPointsJson { get; set; } = "[]";

    public string ImportantTermsJson { get; set; } = "[]";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? UpdatedAt { get; set; }

    public Lesson Lesson { get; set; } = default!;
}