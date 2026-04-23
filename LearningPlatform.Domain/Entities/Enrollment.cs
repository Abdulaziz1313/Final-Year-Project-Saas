namespace LearningPlatform.Domain.Entities;

public class Enrollment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CourseId { get; set; }
    public Course Course { get; set; } = null!;

    public string StudentUserId { get; set; } = string.Empty;

    public EnrollmentStatus Status { get; set; } = EnrollmentStatus.NotStarted;

    public Guid? LastLessonId { get; set; }
    public DateTimeOffset? LastActivityAt { get; set; }

    public DateTimeOffset EnrolledAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}