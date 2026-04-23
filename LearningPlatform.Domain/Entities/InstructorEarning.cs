namespace LearningPlatform.Domain.Entities;

public class InstructorEarning
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PaymentId { get; set; }
    public Payment Payment { get; set; } = null!;

    public Guid CourseId { get; set; }
    public Course Course { get; set; } = null!;

    public Guid AcademyId { get; set; }
    public Academy Academy { get; set; } = null!;

    public string InstructorUserId { get; set; } = string.Empty;
    public string StudentUserId { get; set; } = string.Empty;

    public decimal GrossAmount { get; set; }
    public decimal PlatformAmount { get; set; }
    public decimal OrganizationAmount { get; set; }
    public decimal InstructorAmount { get; set; }

    public string Currency { get; set; } = "EUR";

    public bool IsReleasedForPayout { get; set; } = false;
    public bool IsPaidOut { get; set; } = false;

    public Guid? PayoutId { get; set; }
    public InstructorPayout? Payout { get; set; }

    public DateTimeOffset EarnedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReleasedAt { get; set; }
    public DateTimeOffset? PaidOutAt { get; set; }
}