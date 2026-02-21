namespace LearningPlatform.Domain.Entities;

public enum QuizQuestionType
{
    McqSingle = 0,
    TrueFalse = 1,
    ShortAnswer = 2
}

public enum ShortAnswerMatchType
{
    CaseInsensitive = 0,
    Exact = 1
}

public class QuizQuestion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid QuizId { get; set; }
    public Quiz Quiz { get; set; } = default!;

    public QuizQuestionType Type { get; set; }
    public string Prompt { get; set; } = default!;
    public int Points { get; set; } = 1;

    public List<QuizChoice> Choices { get; set; } = new();

    public string? CorrectAnswerText { get; set; } // e.g. "csharp|c#"
    public ShortAnswerMatchType? MatchType { get; set; }
}
