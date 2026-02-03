namespace LearningPlatform.Domain.Entities;

public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string UserId { get; set; } = string.Empty;

    public string Type { get; set; } = "info";  // info | success | warning | error
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;

    public string? LinkUrl { get; set; }        // where to navigate in UI
    public bool IsRead { get; set; } = false;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
