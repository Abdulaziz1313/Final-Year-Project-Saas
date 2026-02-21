namespace LearningPlatform.Domain.Entities;

public class QuizAttemptAnswer
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AttemptId { get; set; }
    public QuizAttempt Attempt { get; set; } = default!;

    public Guid QuestionId { get; set; }

    public Guid? SelectedChoiceId { get; set; } // MCQ/TF
    public string? AnswerText { get; set; }     // Short answer

    public bool? IsCorrect { get; set; }
    public int EarnedPoints { get; set; }
}
