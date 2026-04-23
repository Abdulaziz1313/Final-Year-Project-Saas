namespace LearningPlatform.Domain.Entities;

public class InstructorPayout
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AcademyId { get; set; }
    public Academy Academy { get; set; } = null!;

    public string InstructorUserId { get; set; } = string.Empty;

    public decimal TotalAmount { get; set; }
    public string Currency { get; set; } = "EUR";

    public string Status { get; set; } = "Pending";
    public bool IsInstantRequest { get; set; } = false;

    public string? RequestNote { get; set; }
    public string? MessageToInstructor { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RequestedAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? ProcessingAt { get; set; }
    public DateTimeOffset? PaidAt { get; set; }

    public ICollection<InstructorEarning> Earnings { get; set; } = new List<InstructorEarning>();
}