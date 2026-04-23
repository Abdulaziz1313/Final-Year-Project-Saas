namespace LearningPlatform.Application.Features.Ai.Dtos;

public class AiFlashcardUpsertRequest
{
    public List<AiFlashcardDto> Flashcards { get; set; } = new();
}