namespace LearningPlatform.Domain.Entities;

public class LessonProgress
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;

    public string StudentUserId { get; set; } = string.Empty;

    public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
}
