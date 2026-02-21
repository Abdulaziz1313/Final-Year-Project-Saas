using System;

namespace LearningPlatform.Domain.Entities;

public class AdminAuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // The admin who performed the action
    public string ActorUserId { get; set; } = default!;

    // e.g. "academy.hide", "course.delete", "user.lock", "user.roles"
    public string Action { get; set; } = default!;

    // "academy" | "course" | "user"
    public string TargetType { get; set; } = default!;

    // Guid string or userId string
    public string TargetId { get; set; } = default!;

    // optional human-friendly title/email/etc
    public string? TargetLabel { get; set; }

    // reason entered by admin (if any)
    public string? Reason { get; set; }

    // extra details (json), e.g. roles before/after, days/permanent
    public string? MetaJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
