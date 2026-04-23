using LearningPlatform.Api.Controllers;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/flashcards")]
public class FlashcardsController : ControllerBase
{
    private readonly AppDbContext _db;

    public FlashcardsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("lesson/{lessonId:guid}")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> GetForInstructor(Guid lessonId, CancellationToken ct)
    {
        var lessonExists = await _db.Lessons
            .AsNoTracking()
            .AnyAsync(x => x.Id == lessonId, ct);

        if (!lessonExists)
            return NotFound("Lesson not found.");

        var items = await _db.LessonAiFlashcards
            .AsNoTracking()
            .Where(x => x.LessonId == lessonId)
            .OrderBy(x => x.OrderIndex)
            .ThenBy(x => x.CreatedAt)
            .Select(ToDtoExpression())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPut("lesson/{lessonId:guid}")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> Upsert(
        Guid lessonId,
        [FromBody] List<FlashcardUpsertDto>? dto,
        CancellationToken ct)
    {
        var lessonExists = await _db.Lessons
            .AsNoTracking()
            .AnyAsync(x => x.Id == lessonId, ct);

        if (!lessonExists)
            return NotFound("Lesson not found.");

        var cleaned = (dto ?? new List<FlashcardUpsertDto>())
            .Where(x => !string.IsNullOrWhiteSpace(x.Question) && !string.IsNullOrWhiteSpace(x.Answer))
            .Select((x, i) => new FlashcardUpsertDto(
                x.Id,
                x.Question.Trim(),
                x.Answer.Trim(),
                i,
                x.IsPublished
            ))
            .ToList();

        var existing = await _db.LessonAiFlashcards
            .Where(x => x.LessonId == lessonId)
            .ToListAsync(ct);

        if (existing.Count > 0)
            _db.LessonAiFlashcards.RemoveRange(existing);

        foreach (var item in cleaned)
        {
            _db.LessonAiFlashcards.Add(new LessonAiFlashcard
            {
                Id = Guid.NewGuid(),
                LessonId = lessonId,
                Question = item.Question,
                Answer = item.Answer,
                OrderIndex = Math.Max(0, item.OrderIndex),
                IsPublished = item.IsPublished,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);

        var result = await _db.LessonAiFlashcards
            .AsNoTracking()
            .Where(x => x.LessonId == lessonId)
            .OrderBy(x => x.OrderIndex)
            .ThenBy(x => x.CreatedAt)
            .Select(ToDtoExpression())
            .ToListAsync(ct);

        return Ok(result);
    }

    [HttpPost("lesson/{lessonId:guid}/publish")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> Publish(Guid lessonId, CancellationToken ct)
    {
        return Ok(await SetPublishedInternal(lessonId, true, ct));
    }

    [HttpPost("lesson/{lessonId:guid}/unpublish")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> Unpublish(Guid lessonId, CancellationToken ct)
    {
        return Ok(await SetPublishedInternal(lessonId, false, ct));
    }

    [HttpGet("student/lesson/{lessonId:guid}")]
    [Authorize(Roles = "Student,Admin")]
    public async Task<IActionResult> GetForStudent(Guid lessonId, CancellationToken ct)
    {
        var lessonExists = await _db.Lessons
            .AsNoTracking()
            .AnyAsync(x => x.Id == lessonId, ct);

        if (!lessonExists)
            return NotFound("Lesson not found.");

        var items = await _db.LessonAiFlashcards
            .AsNoTracking()
            .Where(x => x.LessonId == lessonId && x.IsPublished)
            .OrderBy(x => x.OrderIndex)
            .ThenBy(x => x.CreatedAt)
            .Select(x => new
            {
                id = x.Id,
                lessonId = x.LessonId,
                question = x.Question,
                answer = x.Answer,
                orderIndex = x.OrderIndex,
                isPublished = x.IsPublished
            })
            .ToListAsync(ct);

        return Ok(items);
    }

    private async Task<List<object>> SetPublishedInternal(Guid lessonId, bool isPublished, CancellationToken ct)
    {
        var lessonExists = await _db.Lessons
            .AsNoTracking()
            .AnyAsync(x => x.Id == lessonId, ct);

        if (!lessonExists)
            throw new KeyNotFoundException("Lesson not found.");

        var items = await _db.LessonAiFlashcards
            .Where(x => x.LessonId == lessonId)
            .ToListAsync(ct);

        foreach (var item in items)
        {
            item.IsPublished = isPublished;
            item.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync(ct);

        return items
            .OrderBy(x => x.OrderIndex)
            .ThenBy(x => x.CreatedAt)
            .Select(x => (object)new
            {
                id = x.Id,
                lessonId = x.LessonId,
                question = x.Question,
                answer = x.Answer,
                orderIndex = x.OrderIndex,
                isPublished = x.IsPublished
            })
            .ToList();
    }

    private static System.Linq.Expressions.Expression<Func<LessonAiFlashcard, object>> ToDtoExpression()
    {
        return x => new
        {
            id = x.Id,
            lessonId = x.LessonId,
            question = x.Question,
            answer = x.Answer,
            orderIndex = x.OrderIndex,
            isPublished = x.IsPublished
        };
    }
}