using System.Text.Json;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;

namespace LearningPlatform.Api.Services;

public class AdminAuditWriter
{
    private readonly AppDbContext _db;

    public AdminAuditWriter(AppDbContext db)
    {
        _db = db;
    }

    public async Task Add(
        string actorUserId,
        string action,
        string targetType,
        string targetId,
        string? targetLabel = null,
        string? reason = null,
        object? meta = null)
    {
        var log = new AdminAuditLog
        {
            ActorUserId = actorUserId,
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            TargetLabel = targetLabel,
            Reason = reason,
            MetaJson = meta is null ? null : JsonSerializer.Serialize(meta),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.AdminAuditLogs.Add(log);
        await _db.SaveChangesAsync();
    }
}
