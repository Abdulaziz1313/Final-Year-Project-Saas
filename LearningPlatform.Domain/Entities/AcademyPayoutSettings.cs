namespace LearningPlatform.Domain.Entities;

public class AcademyPayoutSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AcademyId { get; set; }
    public Academy Academy { get; set; } = null!;

    public decimal PlatformFeePercent { get; set; } = 10m;
    public decimal OrganizationFeePercent { get; set; } = 20m;
    public decimal InstructorFeePercent { get; set; } = 70m;

    public bool WeeklyAutoReleaseEnabled { get; set; } = true;
    public DayOfWeek WeeklyReleaseDay { get; set; } = DayOfWeek.Friday;

    public string Currency { get; set; } = "EUR";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}