using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;

namespace LearningPlatform.Api.Services;

public class NotificationWriter
{
    private readonly AppDbContext _db;
    public NotificationWriter(AppDbContext db) => _db = db;

    public async Task Add(string userId, string title, string message, string type = "info", string? linkUrl = null)
    {
        _db.Notifications.Add(new Notification
        {
            UserId = userId,
            Title = title,
            Message = message,
            Type = type,
            LinkUrl = linkUrl
        });

        await _db.SaveChangesAsync();
    }
}
