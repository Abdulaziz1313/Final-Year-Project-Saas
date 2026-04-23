namespace LearningPlatform.Application.Features.Ai.Dtos;

public class AiFlashcardGenerateRequest
{
    public string? Topic { get; set; }
    public string? Instructions { get; set; }
    public int Count { get; set; } = 8;
    public string Difficulty { get; set; } = "Beginner";
}