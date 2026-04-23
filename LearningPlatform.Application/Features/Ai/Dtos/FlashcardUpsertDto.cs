namespace LearningPlatform.Api.Controllers;

public record FlashcardUpsertDto(
    Guid? Id,
    string Question,
    string Answer,
    int OrderIndex,
    bool IsPublished
);