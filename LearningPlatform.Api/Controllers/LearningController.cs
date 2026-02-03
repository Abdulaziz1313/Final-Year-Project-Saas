using System.Security.Claims;
using LearningPlatform.Api.Services;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/learning")]
[Authorize(Roles = "Student")]
public class LearningController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationWriter _notifs;
    private readonly UserManager<ApplicationUser> _userManager;

    public LearningController(AppDbContext db, NotificationWriter notifs, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _notifs = notifs;
        _userManager = userManager;
    }

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    [HttpPost("courses/{courseId:guid}/enroll")]
    public async Task<IActionResult> Enroll(Guid courseId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();
        if (course.Status != CourseStatus.Published) return BadRequest("Course not published.");
        if (!course.IsFree) return BadRequest("Paid course (payments next).");

        var exists = await _db.Enrollments.AnyAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
        if (exists) return Ok(new { message = "Already enrolled" });

        _db.Enrollments.Add(new Enrollment
        {
            CourseId = courseId,
            StudentUserId = userId,
            Status = EnrollmentStatus.NotStarted
        });

        await _db.SaveChangesAsync();

        // ✅ Notify academy owner (instructor)
        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
        if (academy != null && !string.IsNullOrWhiteSpace(academy.OwnerUserId))
        {
            var student = await _userManager.FindByIdAsync(userId);
            var studentEmail = student?.Email ?? "A student";

            await _notifs.Add(
                academy.OwnerUserId,
                "New enrollment",
                $"{studentEmail} enrolled in \"{course.Title}\".",
                "info",
                $"/instructor/courses/{course.AcademyId}"
            );
        }

        return Ok(new { message = "Enrolled" });
    }

    // GET /api/learning/me/enrollments
    // GET /api/learning/me/enrollments
[HttpGet("me/enrollments")]
public async Task<IActionResult> MyEnrollments()
{
    var userId = UserId();
    if (userId is null) return Unauthorized();

    var enrollments = await _db.Enrollments.AsNoTracking()
        .Where(e => e.StudentUserId == userId)
        .OrderByDescending(e => e.EnrolledAt)
        .ToListAsync();

    var courseIds = enrollments.Select(e => e.CourseId).Distinct().ToList();

    // ✅ Include moderation fields so UI can show hidden reason
    var courses = await _db.Courses.AsNoTracking()
        .Where(c => courseIds.Contains(c.Id))
        .Select(c => new
        {
            c.Id,
            c.Title,
            c.ShortDescription,
            c.ThumbnailUrl,
            c.Category,

            // ✅ moderation fields
            c.IsHidden,
            c.HiddenReason,
            c.HiddenAt
        })
        .ToListAsync();

    var totalLessons = await _db.Lessons.AsNoTracking()
        .Join(_db.Modules.AsNoTracking(), l => l.ModuleId, m => m.Id, (l, m) => new { l, m })
        .Where(x => courseIds.Contains(x.m.CourseId))
        .GroupBy(x => x.m.CourseId)
        .Select(g => new { CourseId = g.Key, Total = g.Count() })
        .ToDictionaryAsync(x => x.CourseId, x => x.Total);

    var completedLessons = await _db.LessonProgress.AsNoTracking()
        .Where(lp => lp.StudentUserId == userId)
        .Join(_db.Lessons.AsNoTracking(), lp => lp.LessonId, l => l.Id, (lp, l) => new { lp, l })
        .Join(_db.Modules.AsNoTracking(), x => x.l.ModuleId, m => m.Id, (x, m) => new { x.lp, m })
        .GroupBy(x => x.m.CourseId)
        .Select(g => new { CourseId = g.Key, Done = g.Count() })
        .ToDictionaryAsync(x => x.CourseId, x => x.Done);

    var result = new List<object>();

    foreach (var e in enrollments)
    {
        var c = courses.FirstOrDefault(x => x.Id == e.CourseId);
        if (c == null) continue; // course deleted, skip safely

        totalLessons.TryGetValue(e.CourseId, out var total);
        completedLessons.TryGetValue(e.CourseId, out var done);
        var percent = total == 0 ? 0 : (int)Math.Round(done * 100.0 / total);

        result.Add(new
        {
            course = c,
            enrollment = new { e.Status, e.EnrolledAt, e.LastLessonId },
            progress = new { done, total, percent }
        });
    }

    return Ok(result);
}


 // GET /api/learning/me/courses/{courseId}/content (enrolled only)
[HttpGet("me/courses/{courseId:guid}/content")]
public async Task<IActionResult> CourseContent(Guid courseId)
{
    var userId = UserId();
    if (userId is null) return Unauthorized();

    var enrollment = await _db.Enrollments.FirstOrDefaultAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
    if (enrollment is null) return Forbid();

    var course = await _db.Courses.AsNoTracking()
        .Include(c => c.Modules.OrderBy(m => m.SortOrder))
            .ThenInclude(m => m.Lessons.OrderBy(l => l.SortOrder))
        .FirstOrDefaultAsync(c => c.Id == courseId);

    if (course is null) return NotFound();

    // ✅ If course hidden, show reason
    if (course.IsHidden)
    {
        var reason = string.IsNullOrWhiteSpace(course.HiddenReason) ? "Policy violation" : course.HiddenReason;
        return StatusCode(StatusCodes.Status410Gone, $"This course is not available. Hidden by admin. Reason: {reason}");
    }

    // ✅ If academy hidden, also block
    var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
    if (academy is not null && academy.IsHidden)
        return StatusCode(StatusCodes.Status410Gone, "This course is not available.");

    // ✅ completed ids
    var completedLessonIds = await _db.LessonProgress.AsNoTracking()
        .Where(lp => lp.StudentUserId == userId)
        .Join(_db.Lessons.AsNoTracking(), lp => lp.LessonId, l => l.Id, (lp, l) => new { lp, l })
        .Join(_db.Modules.AsNoTracking(), x => x.l.ModuleId, m => m.Id, (x, m) => new { x.lp, m })
        .Where(x => x.m.CourseId == courseId)
        .Select(x => x.lp.LessonId)
        .Distinct()
        .ToListAsync();

    return Ok(new
    {
        course.Id,
        course.Title,
        lastLessonId = enrollment.LastLessonId,
        completedLessonIds,
        modules = course.Modules.Select(m => new
        {
            m.Id,
            m.Title,
            lessons = m.Lessons.Select(l => new
            {
                l.Id,
                l.Title,
                l.Type,
                l.ContentUrl,
                l.HtmlContent,
                l.IsPreviewFree,
                l.IsDownloadable
            })
        })
    });
}

    // POST /api/learning/me/lessons/{lessonId}/complete
    [HttpPost("me/lessons/{lessonId:guid}/complete")]
    public async Task<IActionResult> CompleteLesson(Guid lessonId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var lesson = await _db.Lessons.Include(l => l.Module).FirstOrDefaultAsync(l => l.Id == lessonId);
        if (lesson is null) return NotFound();

        var courseId = lesson.Module.CourseId;

        var enrollment = await _db.Enrollments.FirstOrDefaultAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
        if (enrollment is null) return Forbid();

        var exists = await _db.LessonProgress.AnyAsync(lp => lp.LessonId == lessonId && lp.StudentUserId == userId);

        // ✅ Always update last activity/lesson
        enrollment.LastLessonId = lessonId;
        enrollment.LastActivityAt = DateTimeOffset.UtcNow;

        if (!exists)
        {
            _db.LessonProgress.Add(new LessonProgress { LessonId = lessonId, StudentUserId = userId });

            if (enrollment.Status == EnrollmentStatus.NotStarted)
                enrollment.Status = EnrollmentStatus.InProgress;
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // POST /api/learning/me/courses/{courseId}/last-lesson/{lessonId}
    [HttpPost("me/courses/{courseId:guid}/last-lesson/{lessonId:guid}")]
    public async Task<IActionResult> SetLastLesson(Guid courseId, Guid lessonId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var enrollment = await _db.Enrollments.FirstOrDefaultAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
        if (enrollment is null) return Forbid();

        enrollment.LastLessonId = lessonId;
        enrollment.LastActivityAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok();
    }
}
