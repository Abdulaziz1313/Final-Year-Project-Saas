namespace LearningPlatform.Domain.Entities;

public class Quiz
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = default!;

    public string Title { get; set; } = "Quiz";

    public List<QuizQuestion> Questions { get; set; } = new();

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
