namespace LearningPlatform.Domain.Entities;

public class Certificate
{
    public Guid Id { get; set; }
    public string CertificateNumber { get; set; } = default!; // e.g. ALF-2026-000123
    public string UserId { get; set; } = default!;
    public Guid CourseId { get; set; }

    public string StudentName { get; set; } = default!;
    public string StudentEmail { get; set; } = default!;
    public string CourseTitle { get; set; } = default!;
    public string AcademyName { get; set; } = default!;

    public DateTimeOffset CompletedAt { get; set; }
    public int? Score { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // optional: store pdf bytes in DB (not recommended long-term)
    // public byte[]? Pdf { get; set; }
}