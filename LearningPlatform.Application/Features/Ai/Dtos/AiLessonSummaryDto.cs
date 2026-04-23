namespace LearningPlatform.Application.Features.Ai.Dtos;

public class AiLessonSummaryDto
{
    public Guid LessonId { get; set; }
    public string Summary { get; set; } = string.Empty;
    public List<string> KeyPoints { get; set; } = new();
    public List<string> ImportantTerms { get; set; } = new();
    public DateTimeOffset CreatedAt { get; set; }
}