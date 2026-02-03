using System.Security.Claims;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _db;
    public NotificationsController(AppDbContext db) => _db = db;

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    [HttpGet]
    public async Task<IActionResult> List(bool unreadOnly = false, int page = 1, int pageSize = 15)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 50 ? 15 : pageSize;

        var q = _db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        if (unreadOnly) q = q.Where(n => !n.IsRead);

        var total = await q.CountAsync();

        var items = await q
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new {
                n.Id, n.Type, n.Title, n.Message, n.LinkUrl, n.IsRead, n.CreatedAt
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount()
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var count = await _db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead);
        return Ok(new { count });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var n = await _db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        if (n is null) return NotFound();

        n.IsRead = true;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var items = await _db.Notifications.Where(n => n.UserId == userId && !n.IsRead).ToListAsync();
        foreach (var n in items) n.IsRead = true;
        await _db.SaveChangesAsync();
        return Ok();
    }

#if DEBUG
    // Dev helper to test UI quickly
    public record TestNotifReq(string Title, string Message, string Type, string? LinkUrl);

    [HttpPost("test")]
    public async Task<IActionResult> CreateTest(TestNotifReq req)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        _db.Notifications.Add(new Notification
        {
            UserId = userId,
            Title = req.Title,
            Message = req.Message,
            Type = string.IsNullOrWhiteSpace(req.Type) ? "info" : req.Type,
            LinkUrl = req.LinkUrl
        });

        await _db.SaveChangesAsync();
        return Ok();
    }
#endif
}
