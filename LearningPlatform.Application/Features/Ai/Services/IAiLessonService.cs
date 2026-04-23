using LearningPlatform.Application.Features.Ai.Dtos;

namespace LearningPlatform.Application.Features.Ai.Services;

public interface IAiLessonService
{
    Task<AiLessonSummaryDto?> GetSummaryAsync(Guid lessonId, CancellationToken ct);
    Task<AiLessonSummaryDto> GenerateSummaryAsync(Guid lessonId, CancellationToken ct);

    Task<List<AiQuizDraftDto>> GenerateQuizAsync(
        Guid lessonId,
        AiQuizGenerationRequest request,
        CancellationToken ct);

    Task<List<AiFlashcardDto>> GenerateFlashcardsAsync(
        Guid lessonId,
        AiFlashcardGenerateRequest request,
        CancellationToken ct);

    Task<List<AiFlashcardDto>> GetFlashcardsAsync(Guid lessonId, CancellationToken ct);

    Task<List<AiFlashcardDto>> SaveFlashcardsAsync(
        Guid lessonId,
        List<AiFlashcardDto> flashcards,
        CancellationToken ct);

    Task<List<AiFlashcardDto>> SetFlashcardsPublishedAsync(
        Guid lessonId,
        bool isPublished,
        CancellationToken ct);
}