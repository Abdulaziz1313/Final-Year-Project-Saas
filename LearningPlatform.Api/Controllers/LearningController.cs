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
    private readonly ICertificatePdfService _certPdf;

    public LearningController(
        AppDbContext db,
        NotificationWriter notifs,
        UserManager<ApplicationUser> userManager,
        ICertificatePdfService certPdf
    )
    {
        _db = db;
        _notifs = notifs;
        _userManager = userManager;
        _certPdf = certPdf;
    }

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    private static string NewCertNumber()
    {
        // ALF-YYYYMMDD-XXXXXXXXXXXX
        var id = Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
        return $"ALF-{DateTime.UtcNow:yyyyMMdd}-{id}";
    }

    private async Task<(int total, int done)> GetCourseProgressCounts(Guid courseId, string userId)
    {
        var total = await _db.Lessons.AsNoTracking()
            .Join(_db.Modules.AsNoTracking(), l => l.ModuleId, m => m.Id, (l, m) => new { l, m })
            .Where(x => x.m.CourseId == courseId)
            .CountAsync();

        var done = await _db.LessonProgress.AsNoTracking()
            .Where(lp => lp.StudentUserId == userId)
            .Join(_db.Lessons.AsNoTracking(), lp => lp.LessonId, l => l.Id, (lp, l) => new { lp, l })
            .Join(_db.Modules.AsNoTracking(), x => x.l.ModuleId, m => m.Id, (x, m) => new { x.lp, m })
            .Where(x => x.m.CourseId == courseId)
            .Select(x => x.lp.LessonId)
            .Distinct()
            .CountAsync();

        return (total, done);
    }

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

        var courses = await _db.Courses.AsNoTracking()
            .Where(c => courseIds.Contains(c.Id))
            .Select(c => new
            {
                c.Id,
                c.Title,
                c.ShortDescription,
                c.ThumbnailUrl,
                c.Category,
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
            if (c == null) continue;

            totalLessons.TryGetValue(e.CourseId, out var total);
            completedLessons.TryGetValue(e.CourseId, out var done);
            var percent = total == 0 ? 0 : (int)Math.Round(done * 100.0 / total);

            // ✅ certificate (if exists)
            var cert = await _db.Certificates.AsNoTracking()
                .Where(x => x.CourseId == e.CourseId && x.UserId == userId)
                .Select(x => new { x.Id, x.CertificateNumber, x.CompletedAt })
                .FirstOrDefaultAsync();

            result.Add(new
            {
                course = c,
                enrollment = new { e.Status, e.EnrolledAt, e.LastLessonId },
                progress = new { done, total, percent },
                certificate = cert // null if none
            });
        }

        return Ok(result);
    }

    // GET /api/learning/me/academy
    // Returns the academy the student belongs to (from their enrollments).
    // Used by the app shell to show the academy logo and name in the topbar/sidebar.
    [HttpGet("me/academy")]
    public async Task<IActionResult> MyAcademy()
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        // Walk: Enrollments → Courses → Academies
        // Take the academy from the student's earliest enrollment.
        var academy = await _db.Enrollments.AsNoTracking()
            .Where(e => e.StudentUserId == userId)
            .OrderBy(e => e.EnrolledAt)
            .Join(
                _db.Courses.AsNoTracking(),
                e => e.CourseId,
                c => c.Id,
                (e, c) => c
            )
            .Join(
                _db.Academies.AsNoTracking(),
                c => c.AcademyId,
                a => a.Id,
                (c, a) => a
            )
            .Select(a => new
            {
                id           = a.Id,
                name         = a.Name,
                slug         = a.Slug,
                logoUrl      = a.LogoUrl,
                bannerUrl    = a.BannerUrl,
                primaryColor = a.PrimaryColor,
                description  = a.Description,
                isPublished  = a.IsPublished,
            })
            .FirstOrDefaultAsync();

        if (academy is null) return NotFound();

        return Ok(academy);
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

        if (course.IsHidden)
        {
            var reason = string.IsNullOrWhiteSpace(course.HiddenReason) ? "Policy violation" : course.HiddenReason;
            return StatusCode(StatusCodes.Status410Gone, $"This course is not available. Hidden by admin. Reason: {reason}");
        }

        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
        if (academy is not null && academy.IsHidden)
            return StatusCode(StatusCodes.Status410Gone, "This course is not available.");

        var completedLessonIds = await _db.LessonProgress.AsNoTracking()
            .Where(lp => lp.StudentUserId == userId)
            .Join(_db.Lessons.AsNoTracking(), lp => lp.LessonId, l => l.Id, (lp, l) => new { lp, l })
            .Join(_db.Modules.AsNoTracking(), x => x.l.ModuleId, m => m.Id, (x, m) => new { x.lp, m })
            .Where(x => x.m.CourseId == courseId)
            .Select(x => x.lp.LessonId)
            .Distinct()
            .ToListAsync();

        // ✅ certificate status in same payload (handy for Player UI)
        var cert = await _db.Certificates.AsNoTracking()
            .Where(x => x.CourseId == courseId && x.UserId == userId)
            .Select(x => new { x.Id, x.CertificateNumber, x.CompletedAt })
            .FirstOrDefaultAsync();

        return Ok(new
        {
            course.Id,
            course.Title,
            lastLessonId = enrollment.LastLessonId,
            completedLessonIds,
            certificate = cert,
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

        var lesson = await _db.Lessons
            .Include(l => l.Module)
            .FirstOrDefaultAsync(l => l.Id == lessonId);

        if (lesson is null) return NotFound();

        var courseId = lesson.Module.CourseId;

        var enrollment = await _db.Enrollments.FirstOrDefaultAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
        if (enrollment is null) return Forbid();

        var exists = await _db.LessonProgress.AnyAsync(lp => lp.LessonId == lessonId && lp.StudentUserId == userId);

        enrollment.LastLessonId = lessonId;
        enrollment.LastActivityAt = DateTimeOffset.UtcNow;

        if (!exists)
        {
            _db.LessonProgress.Add(new LessonProgress { LessonId = lessonId, StudentUserId = userId });

            if (enrollment.Status == EnrollmentStatus.NotStarted)
                enrollment.Status = EnrollmentStatus.InProgress;
        }

        await _db.SaveChangesAsync();

        // ✅ Auto issue certificate if finished
        var (total, done) = await GetCourseProgressCounts(courseId, userId);

        if (total > 0 && done >= total)
        {
            // mark completed
            if (enrollment.Status != EnrollmentStatus.Completed)
            {
                enrollment.Status = EnrollmentStatus.Completed;
                await _db.SaveChangesAsync();
            }

            var already = await _db.Certificates.AnyAsync(c => c.CourseId == courseId && c.UserId == userId);
            if (!already)
            {
                var course = await _db.Courses.AsNoTracking().FirstOrDefaultAsync(c => c.Id == courseId);
                if (course != null)
                {
                    var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
                    var user = await _userManager.FindByIdAsync(userId);

                    if (academy != null)
                    {
                        _db.Certificates.Add(new Certificate
                        {
                            CertificateNumber = NewCertNumber(),
                            CourseId = courseId,
                            UserId = userId,

                            StudentName = user?.DisplayName ?? user?.Email ?? "Student",
                            StudentEmail = user?.Email ?? "",
                            CourseTitle = course.Title,
                            AcademyName = academy.Name,

                            CompletedAt = DateTimeOffset.UtcNow
                        });

                        await _db.SaveChangesAsync();
                    }
                }
            }
        }

        return Ok(new { total, done });
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

    // GET /api/learning/me/courses/{courseId}/certificate/status
    [HttpGet("me/courses/{courseId:guid}/certificate/status")]
    public async Task<IActionResult> CertificateStatus(Guid courseId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var enrolled = await _db.Enrollments.AsNoTracking()
            .AnyAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
        if (!enrolled) return Forbid();

        var (total, done) = await GetCourseProgressCounts(courseId, userId);

        var cert = await _db.Certificates.AsNoTracking()
            .Where(x => x.CourseId == courseId && x.UserId == userId)
            .Select(x => new { x.Id, x.CertificateNumber, x.CompletedAt })
            .FirstOrDefaultAsync();

        return Ok(new
        {
            eligible = total > 0 && done >= total,
            progress = new { total, done, percent = total == 0 ? 0 : (int)Math.Round(done * 100.0 / total) },
            certificate = cert
        });
    }

    // POST /api/learning/me/courses/{courseId}/certificate/issue
    [HttpPost("me/courses/{courseId:guid}/certificate/issue")]
    public async Task<IActionResult> IssueCertificate(Guid courseId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var enrollment = await _db.Enrollments.FirstOrDefaultAsync(e => e.CourseId == courseId && e.StudentUserId == userId);
        if (enrollment is null) return Forbid();

        var (total, done) = await GetCourseProgressCounts(courseId, userId);
        if (total == 0) return BadRequest("Course has no lessons yet.");
        if (done < total) return BadRequest("Course not completed yet.");

        var existing = await _db.Certificates.FirstOrDefaultAsync(c => c.CourseId == courseId && c.UserId == userId);
        if (existing is not null)
            return Ok(new { id = existing.Id, certificateNumber = existing.CertificateNumber });

        var course = await _db.Courses.AsNoTracking().FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        var academy = await _db.Academies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == course.AcademyId);
        if (academy is null) return NotFound();

        var user = await _userManager.FindByIdAsync(userId);

        var cert = new Certificate
        {
            CertificateNumber = NewCertNumber(),
            CourseId = courseId,
            UserId = userId,

            StudentName = user?.DisplayName ?? user?.Email ?? "Student",
            StudentEmail = user?.Email ?? "",
            CourseTitle = course.Title,
            AcademyName = academy.Name,

            CompletedAt = DateTimeOffset.UtcNow
        };

        _db.Certificates.Add(cert);

        if (enrollment.Status != EnrollmentStatus.Completed)
            enrollment.Status = EnrollmentStatus.Completed;

        await _db.SaveChangesAsync();

        return Ok(new { id = cert.Id, certificateNumber = cert.CertificateNumber });
    }

    // GET /api/learning/me/courses/{courseId}/certificate
    [HttpGet("me/courses/{courseId:guid}/certificate")]
    public async Task<IActionResult> GetMyCertificate(Guid courseId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var cert = await _db.Certificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CourseId == courseId && c.UserId == userId);

        if (cert is null) return NotFound();

        return Ok(new
        {
            id = cert.Id,
            certificateNumber = cert.CertificateNumber,
            completedAt = cert.CompletedAt
        });
    }

    // GET /api/learning/me/certificates/{certificateId}/pdf
    [HttpGet("me/certificates/{certificateId:guid}/pdf")]
    public async Task<IActionResult> DownloadCertificatePdf(Guid certificateId)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var cert = await _db.Certificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == certificateId);

        if (cert is null) return NotFound();
        if (cert.UserId != userId) return Forbid();

        var pdf = _certPdf.Generate(
            cert.CertificateNumber,
            cert.StudentName,
            cert.CourseTitle,
            cert.AcademyName,
            cert.CompletedAt
        );

        var fileName = $"certificate-{cert.CertificateNumber}.pdf";
        return File(pdf, "application/pdf", fileName);
    }
}