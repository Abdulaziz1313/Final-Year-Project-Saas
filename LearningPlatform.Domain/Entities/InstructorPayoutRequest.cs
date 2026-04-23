namespace LearningPlatform.Domain.Entities;

public class InstructorPayoutRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AcademyId { get; set; }
    public Academy Academy { get; set; } = null!;

    public string InstructorUserId { get; set; } = string.Empty;

    public decimal RequestedAmount { get; set; }
    public string Currency { get; set; } = "EUR";

    public string Status { get; set; } = "Requested";
    public string? MessageToInstructor { get; set; }
    public string? Note { get; set; }

    public Guid? PayoutId { get; set; }
    public InstructorPayout? Payout { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ResolvedAt { get; set; }
}