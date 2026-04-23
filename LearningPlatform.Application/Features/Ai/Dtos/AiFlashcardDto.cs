namespace LearningPlatform.Application.Features.Ai.Dtos;

public class AiFlashcardDto
{
    public Guid? Id { get; set; }
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public int OrderIndex { get; set; }
    public bool IsPublished { get; set; }
}