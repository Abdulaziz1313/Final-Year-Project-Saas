using System.ComponentModel.DataAnnotations;

namespace LearningPlatform.Domain.Entities;

public class LessonAiFlashcard
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = default!;

    [MaxLength(500)]
    public string Question { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Answer { get; set; } = string.Empty;

    public int OrderIndex { get; set; } = 0;

    public bool IsPublished { get; set; } = false;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
}