namespace LearningPlatform.Application.Features.Ai.Dtos;

public class AiQuizDraftDto
{
    public int Type { get; set; } // 0 mcq, 1 tf, 2 short
    public string Prompt { get; set; } = "";
    public int Points { get; set; } = 1;

    public List<AiQuizChoiceDto>? Choices { get; set; }

    public string? CorrectAnswerText { get; set; }
    public int? MatchType { get; set; }
}

public class AiQuizChoiceDto
{
    public string Text { get; set; } = "";
    public bool IsCorrect { get; set; }
}