namespace LearningPlatform.Domain.Entities;

public class QuizChoice
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid QuestionId { get; set; }
    public QuizQuestion Question { get; set; } = default!;

    public string Text { get; set; } = default!;
    public bool IsCorrect { get; set; }
}
