namespace LearningPlatform.Application.Features.Ai.Dtos;

public class AiQuizGenerationRequest
{
    public string? Topic { get; set; }
    public string? Instructions { get; set; }
    public int QuestionCount { get; set; } = 5;
    public string Difficulty { get; set; } = "Beginner";
}