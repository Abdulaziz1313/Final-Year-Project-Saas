namespace LearningPlatform.Domain.Entities;

public class Course
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AcademyId { get; set; }
    public Academy Academy { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string? ShortDescription { get; set; }
    public string? FullDescription { get; set; }

    public bool IsFree { get; set; } = true;
    public decimal? Price { get; set; }
    public string Currency { get; set; } = "EUR";

    public CourseStatus Status { get; set; } = CourseStatus.Draft;

    public string TagsJson { get; set; } = "[]";
    public string? Category { get; set; }

    public string? ThumbnailUrl { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Module> Modules { get; set; } = new List<Module>();

    public bool IsHidden { get; set; } = false;
    public string? HiddenReason { get; set; }
    public DateTimeOffset? HiddenAt { get; set; }
    public string? HiddenByUserId { get; set; }

}
