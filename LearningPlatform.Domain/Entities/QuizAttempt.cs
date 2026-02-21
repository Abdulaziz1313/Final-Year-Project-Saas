namespace LearningPlatform.Domain.Entities;

public enum QuizAttemptStatus
{
    InProgress = 0,
    AutoGraded = 1,
    NeedsReview = 2
}

public class QuizAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid QuizId { get; set; }
    public Quiz Quiz { get; set; } = default!;

    public string StudentUserId { get; set; } = default!;

    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;

    // Draft => null. Submitted => has value.
    public DateTimeOffset? SubmittedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public int Score { get; set; }
    public int MaxScore { get; set; }

    public QuizAttemptStatus Status { get; set; } = QuizAttemptStatus.InProgress;

    public List<QuizAttemptAnswer> Answers { get; set; } = new();
}
