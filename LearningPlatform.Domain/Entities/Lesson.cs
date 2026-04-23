namespace LearningPlatform.Domain.Entities;

public class Lesson
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ModuleId { get; set; }
    public Module Module { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public LessonType Type { get; set; } = LessonType.Video;

    public string? ContentUrl { get; set; }
    public string? HtmlContent { get; set; }

    public int SortOrder { get; set; }

    public bool IsPreviewFree { get; set; } = false;
    public bool IsDownloadable { get; set; } = false;

    public ICollection<LessonAiFlashcard> AiFlashcards { get; set; } = new List<LessonAiFlashcard>();
}