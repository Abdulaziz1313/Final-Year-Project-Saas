using System.Security.Claims;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using LearningPlatform.Api.Services;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using LearningPlatform.Api.Dto;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/courses")]
public class CoursesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationWriter _notifs;
    private readonly BlobServiceClient _blobServiceClient;
    private readonly StorageOptions _storage;
    private readonly IWebHostEnvironment _env;

    public CoursesController(
        AppDbContext db,
        NotificationWriter notifs,
        BlobServiceClient blobServiceClient,
        IOptions<StorageOptions> storage,
        IWebHostEnvironment env)
    {
        _db = db;
        _notifs = notifs;
        _blobServiceClient = blobServiceClient;
        _storage = storage.Value;
        _env = env;
    }

    public record CreateCourseRequest(
        Guid AcademyId,
        string Title,
        string? ShortDescription,
        string? FullDescription,
        bool IsFree,
        decimal? Price,
        string Currency,
        string? Category,
        string TagsJson
    );

    public record UpdateCourseRequest(
        string? Title,
        string? ShortDescription,
        string? FullDescription,
        bool? IsFree,
        decimal? Price,
        string? Currency,
        string? Category,
        string? TagsJson
    );

    public record CreateModuleRequest(string Title);

    public record CreateLessonRequest(
        string Title,
        LessonType Type,
        string? ContentUrl,
        string? HtmlContent,
        bool IsPreviewFree,
        bool IsDownloadable
    );

    public record UpdateStatusRequest(CourseStatus Status);

    public record ReorderRequest(List<Guid> OrderedIds);

    private static string? UserId(ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier);

    private async Task<bool> IsAssignedToAcademyAsync(Guid academyId, string userId)
    {
        var claim = User.FindFirstValue("academyId");
        if (!string.IsNullOrWhiteSpace(claim) && Guid.TryParse(claim, out var claimAcademyId))
            return claimAcademyId == academyId;

        return await _db.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == userId && u.AcademyId == academyId);
    }

    [HttpPost]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> CreateCourse(CreateCourseRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        if (!await IsAssignedToAcademyAsync(req.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest("Title is required.");

        if (!req.IsFree && (req.Price is null || req.Price <= 0))
            return BadRequest("Paid courses must have a price > 0.");

        var course = new Course
        {
            AcademyId = req.AcademyId,
            InstructorUserId = userId,
            Title = req.Title.Trim(),
            ShortDescription = string.IsNullOrWhiteSpace(req.ShortDescription) ? null : req.ShortDescription.Trim(),
            FullDescription = string.IsNullOrWhiteSpace(req.FullDescription) ? null : req.FullDescription.Trim(),
            IsFree = req.IsFree,
            Price = req.IsFree ? null : req.Price,
            Currency = string.IsNullOrWhiteSpace(req.Currency) ? "EUR" : req.Currency.Trim().ToUpperInvariant(),
            Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category.Trim(),
            TagsJson = string.IsNullOrWhiteSpace(req.TagsJson) ? "[]" : req.TagsJson.Trim(),
            Status = CourseStatus.Draft,
            IsHidden = false,
            HiddenReason = null,
            HiddenAt = null,
            HiddenByUserId = null
        };

        _db.Courses.Add(course);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetCourse), new { id = course.Id }, new { course.Id });
    }

    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> GetCourse(Guid id)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses
            .Include(c => c.Modules)
                .ThenInclude(m => m.Lessons)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(course.InstructorUserId))
        {
            course.InstructorUserId = userId;
            await _db.SaveChangesAsync();
        }

        var dto = new
        {
            course.Id,
            course.AcademyId,
            course.InstructorUserId,
            course.Title,
            course.ShortDescription,
            course.FullDescription,
            course.IsFree,
            course.Price,
            course.Currency,
            course.Status,
            course.Category,
            course.TagsJson,
            course.ThumbnailUrl,
            course.CreatedAt,
            course.IsHidden,
            course.HiddenReason,
            course.HiddenAt,
            course.HiddenByUserId,
            Modules = course.Modules
                .OrderBy(m => m.SortOrder)
                .Select(m => new
                {
                    m.Id,
                    m.Title,
                    m.SortOrder,
                    Lessons = m.Lessons
                        .OrderBy(l => l.SortOrder)
                        .Select(l => new
                        {
                            l.Id,
                            l.Title,
                            l.Type,
                            l.ContentUrl,
                            l.HtmlContent,
                            l.SortOrder,
                            l.IsPreviewFree,
                            l.IsDownloadable
                        })
                })
        };

        return Ok(dto);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> UpdateCourse(Guid id, [FromBody] UpdateCourseRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == id);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(course.InstructorUserId))
            course.InstructorUserId = userId;

        if (req.Title is not null)
        {
            var title = req.Title.Trim();
            if (string.IsNullOrWhiteSpace(title))
                return BadRequest("Title is required.");

            course.Title = title;
        }

        if (req.ShortDescription is not null)
            course.ShortDescription = string.IsNullOrWhiteSpace(req.ShortDescription) ? null : req.ShortDescription.Trim();

        if (req.FullDescription is not null)
            course.FullDescription = string.IsNullOrWhiteSpace(req.FullDescription) ? null : req.FullDescription.Trim();

        if (req.Category is not null)
            course.Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category.Trim();

        if (req.TagsJson is not null)
            course.TagsJson = string.IsNullOrWhiteSpace(req.TagsJson) ? "[]" : req.TagsJson.Trim();

        if (req.IsFree.HasValue)
            course.IsFree = req.IsFree.Value;

        if (course.IsFree)
        {
            course.Price = null;
            if (!string.IsNullOrWhiteSpace(req.Currency))
                course.Currency = req.Currency.Trim().ToUpperInvariant();
        }
        else
        {
            if (req.Price.HasValue)
                course.Price = req.Price.Value;

            if (course.Price is null || course.Price <= 0)
                return BadRequest("Paid courses must have a price > 0.");

            if (req.Currency is not null)
                course.Currency = string.IsNullOrWhiteSpace(req.Currency) ? "EUR" : req.Currency.Trim().ToUpperInvariant();

            if (string.IsNullOrWhiteSpace(course.Currency))
                course.Currency = "EUR";
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            course.Id,
            course.InstructorUserId,
            course.Title,
            course.ShortDescription,
            course.FullDescription,
            course.IsFree,
            course.Price,
            course.Currency,
            course.Category,
            course.TagsJson
        });
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> DeleteCourse(Guid id)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == id);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        var hasPayments = await _db.Payments.AnyAsync(p => p.CourseId == id && p.Status == PaymentStatus.Paid);
        if (hasPayments)
            return BadRequest("Cannot delete a course that has completed payments.");

        _db.Courses.Remove(course);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("{courseId:guid}/modules")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> AddModule(Guid courseId, CreateModuleRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest("Module title is required.");

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(course.InstructorUserId))
        {
            course.InstructorUserId = userId;
            await _db.SaveChangesAsync();
        }

        var maxSort = await _db.Modules
            .Where(m => m.CourseId == courseId)
            .MaxAsync(m => (int?)m.SortOrder) ?? 0;

        var module = new Module
        {
            CourseId = courseId,
            Title = req.Title.Trim(),
            SortOrder = maxSort + 1
        };

        _db.Modules.Add(module);
        await _db.SaveChangesAsync();

        return Ok(new { module.Id });
    }

    [HttpDelete("modules/{moduleId:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> DeleteModule(Guid moduleId)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var module = await _db.Modules
            .Include(m => m.Course)
            .FirstOrDefaultAsync(m => m.Id == moduleId);

        if (module is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(module.Course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        var hasLessons = await _db.Lessons.AnyAsync(l => l.ModuleId == moduleId);
        if (hasLessons)
            return BadRequest("Cannot delete a module that has lessons. Delete lessons first.");

        _db.Modules.Remove(module);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("modules/{moduleId:guid}/lessons")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> AddLesson(Guid moduleId, CreateLessonRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest("Lesson title is required.");

        var module = await _db.Modules
            .Include(m => m.Course)
            .FirstOrDefaultAsync(m => m.Id == moduleId);

        if (module is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(module.Course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(module.Course.InstructorUserId))
        {
            module.Course.InstructorUserId = userId;
            await _db.SaveChangesAsync();
        }

        var maxSort = await _db.Lessons
            .Where(l => l.ModuleId == moduleId)
            .MaxAsync(l => (int?)l.SortOrder) ?? 0;

        var lesson = new Lesson
        {
            ModuleId = moduleId,
            Title = req.Title.Trim(),
            Type = req.Type,
            ContentUrl = req.ContentUrl,
            HtmlContent = req.HtmlContent,
            SortOrder = maxSort + 1,
            IsPreviewFree = req.IsPreviewFree,
            IsDownloadable = req.IsDownloadable
        };

        _db.Lessons.Add(lesson);
        await _db.SaveChangesAsync();

        return Ok(new { lesson.Id });
    }

    [HttpDelete("lessons/{lessonId:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> DeleteLesson(Guid lessonId)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var lesson = await _db.Lessons
            .Include(l => l.Module)
            .ThenInclude(m => m.Course)
            .FirstOrDefaultAsync(l => l.Id == lessonId);

        if (lesson is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(lesson.Module.Course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        _db.LessonProgress.RemoveRange(_db.LessonProgress.Where(p => p.LessonId == lessonId));
        _db.Lessons.Remove(lesson);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpPut("{courseId:guid}/modules/reorder")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> ReorderModules(Guid courseId, ReorderRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(course.InstructorUserId))
            course.InstructorUserId = userId;

        if (req.OrderedIds is null || req.OrderedIds.Count == 0)
            return BadRequest("orderedIds is required.");

        var modules = await _db.Modules.Where(m => m.CourseId == courseId).ToListAsync();
        var moduleIds = modules.Select(m => m.Id).ToHashSet();

        if (req.OrderedIds.Count != moduleIds.Count || req.OrderedIds.Any(id => !moduleIds.Contains(id)))
            return BadRequest("orderedIds must include all modules for this course.");

        for (int i = 0; i < req.OrderedIds.Count; i++)
            modules.First(m => m.Id == req.OrderedIds[i]).SortOrder = i + 1;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("modules/{moduleId:guid}/lessons/reorder")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> ReorderLessons(Guid moduleId, ReorderRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var module = await _db.Modules
            .Include(m => m.Course)
            .FirstOrDefaultAsync(m => m.Id == moduleId);

        if (module is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(module.Course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(module.Course.InstructorUserId))
        {
            module.Course.InstructorUserId = userId;
            await _db.SaveChangesAsync();
        }

        if (req.OrderedIds is null || req.OrderedIds.Count == 0)
            return BadRequest("orderedIds is required.");

        var lessons = await _db.Lessons.Where(l => l.ModuleId == moduleId).ToListAsync();
        var lessonIds = lessons.Select(l => l.Id).ToHashSet();

        if (req.OrderedIds.Count != lessonIds.Count || req.OrderedIds.Any(id => !lessonIds.Contains(id)))
            return BadRequest("orderedIds must include all lessons for this module.");

        for (int i = 0; i < req.OrderedIds.Count; i++)
            lessons.First(l => l.Id == req.OrderedIds[i]).SortOrder = i + 1;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> Publish(Guid id)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == id);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(course.InstructorUserId))
            course.InstructorUserId = userId;

        if (course.IsHidden)
            return BadRequest($"Course is hidden by admin. Reason: {course.HiddenReason ?? "Policy violation"}");

        var academy = await _db.Academies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == course.AcademyId);

        if (academy != null && academy.IsHidden)
            return BadRequest("Academy is hidden by admin. You cannot publish courses under it.");

        if (!course.IsFree && (course.Price is null || course.Price <= 0))
            return BadRequest("Paid courses must have a valid price before publishing.");

        course.Status = CourseStatus.Published;
        await _db.SaveChangesAsync();

        await _notifs.Add(
            userId,
            "Course published",
            $"\"{course.Title}\" is now published.",
            "success",
            $"/instructor/course-builder/{course.Id}"
        );

        return Ok();
    }

    [HttpPut("{id:guid}/status")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> UpdateStatus(Guid id, UpdateStatusRequest req)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == id);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        if (string.IsNullOrWhiteSpace(course.InstructorUserId))
            course.InstructorUserId = userId;

        if (course.IsHidden && req.Status == CourseStatus.Published)
            return BadRequest($"Course is hidden by admin. Reason: {course.HiddenReason ?? "Policy violation"}");

        if (req.Status == CourseStatus.Published)
        {
            var academy = await _db.Academies.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == course.AcademyId);

            if (academy != null && academy.IsHidden)
                return BadRequest("Academy is hidden by admin. You cannot publish courses under it.");

            if (!course.IsFree && (course.Price is null || course.Price <= 0))
                return BadRequest("Paid courses must have a valid price before publishing.");
        }

        course.Status = req.Status;
        await _db.SaveChangesAsync();

        return Ok(new { course.Id, course.Status });
    }

    [HttpGet("academy/{academyId:guid}")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> ListForAcademy(Guid academyId)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        if (!await IsAssignedToAcademyAsync(academyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        var list = await _db.Courses.AsNoTracking()
            .Where(c => c.AcademyId == academyId)
            .OrderByDescending(c => c.CreatedAt)
            .GroupJoin(
                _db.Enrollments.AsNoTracking(),
                c => c.Id,
                e => e.CourseId,
                (c, es) => new
                {
                    c.Id,
                    c.InstructorUserId,
                    c.Title,
                    c.Status,
                    c.IsFree,
                    c.Price,
                    c.Currency,
                    c.Category,
                    c.CreatedAt,
                    c.ThumbnailUrl,
                    c.IsHidden,
                    c.HiddenReason,
                    c.HiddenAt,
                    c.HiddenByUserId,
                    EnrollmentCount = es.Count()
                }
            )
            .ToListAsync();

        return Ok(list);
    }

    [HttpGet("{courseId:guid}/enrollments")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> GetCourseEnrollments(Guid courseId)
    {
        var userId = UserId(User);
        if (userId is null) return Unauthorized();

        var course = await _db.Courses.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound();

        if (!await IsAssignedToAcademyAsync(course.AcademyId, userId))
            return StatusCode(403, "You are not assigned to this academy.");

        var totalLessons = await _db.Lessons.AsNoTracking()
            .Join(_db.Modules.AsNoTracking(), l => l.ModuleId, m => m.Id, (l, m) => new { l, m })
            .Where(x => x.m.CourseId == courseId)
            .CountAsync();

        var donePerStudent = await _db.LessonProgress.AsNoTracking()
            .Join(_db.Lessons.AsNoTracking(), lp => lp.LessonId, l => l.Id, (lp, l) => new { lp, l })
            .Join(_db.Modules.AsNoTracking(), x => x.l.ModuleId, m => m.Id, (x, m) => new { x.lp, m })
            .Where(x => x.m.CourseId == courseId)
            .GroupBy(x => x.lp.StudentUserId)
            .Select(g => new { StudentUserId = g.Key, Done = g.Count() })
            .ToDictionaryAsync(x => x.StudentUserId, x => x.Done);

        var enrollments = await _db.Enrollments.AsNoTracking()
            .Where(e => e.CourseId == courseId)
            .OrderByDescending(e => e.EnrolledAt)
            .Select(e => new
            {
                e.StudentUserId,
                e.EnrolledAt,
                e.Status,
                e.LastLessonId,
                e.LastActivityAt
            })
            .ToListAsync();

        var studentIds = enrollments.Select(e => e.StudentUserId).Distinct().ToList();

        var users = await _db.Users.AsNoTracking()
            .Where(u => studentIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Email, u.DisplayName, u.ProfileImageUrl })
            .ToListAsync();

        var students = enrollments.Select(e =>
        {
            donePerStudent.TryGetValue(e.StudentUserId, out var done);
            var percent = totalLessons == 0 ? 0 : (int)Math.Round(done * 100.0 / totalLessons);
            var u = users.FirstOrDefault(x => x.Id == e.StudentUserId);

            return new
            {
                student = new
                {
                    id = e.StudentUserId,
                    email = u?.Email,
                    displayName = u?.DisplayName,
                    profileImageUrl = u?.ProfileImageUrl
                },
                e.EnrolledAt,
                e.Status,
                e.LastLessonId,
                e.LastActivityAt,
                progress = new { done, total = totalLessons, percent }
            };
        });

        return Ok(new
        {
            course = new { course.Id, course.Title },
            totalLessons,
            enrolledCount = enrollments.Count,
            students
        });
    }

    [HttpPost("lessons/{lessonId:guid}/upload-video")]
[Authorize(Roles = "Instructor")]
[Consumes("multipart/form-data")]
[RequestSizeLimit(250 * 1024 * 1024)]
public async Task<IActionResult> UploadLessonVideo(Guid lessonId, [FromForm] UploadFileRequest request)
{
    var file = request.File;

    if (file == null || file.Length == 0) return BadRequest("No file uploaded.");

    var userId = UserId(User);
    if (userId is null) return Unauthorized();

    var lesson = await _db.Lessons
        .Include(l => l.Module)
        .ThenInclude(m => m.Course)
        .FirstOrDefaultAsync(l => l.Id == lessonId);

    if (lesson is null) return NotFound();

    if (!await IsAssignedToAcademyAsync(lesson.Module.Course.AcademyId, userId))
        return StatusCode(403, "You are not assigned to this academy.");

    if (string.IsNullOrWhiteSpace(lesson.Module.Course.InstructorUserId))
    {
        lesson.Module.Course.InstructorUserId = userId;
        await _db.SaveChangesAsync();
    }

    if (lesson.Module.Course.IsHidden)
        return BadRequest($"Course is hidden by admin. Reason: {lesson.Module.Course.HiddenReason ?? "Policy violation"}");

    var academy = await _db.Academies.AsNoTracking()
        .FirstOrDefaultAsync(a => a.Id == lesson.Module.Course.AcademyId);

    if (academy != null && academy.IsHidden)
        return BadRequest("Academy is hidden by admin. Uploads are disabled.");

    var allowed = new[] { "video/mp4", "video/webm", "video/quicktime" };
    if (!allowed.Contains(file.ContentType))
        return BadRequest("Only MP4, WebM or MOV allowed.");

    var ext = file.ContentType switch
    {
        "video/mp4" => ".mp4",
        "video/webm" => ".webm",
        "video/quicktime" => ".mov",
        _ => ".bin"
    };

    string url;

    if (_storage.UseBlob)
    {
        var container = _blobServiceClient.GetBlobContainerClient(_storage.LessonFilesContainer);
        await container.CreateIfNotExistsAsync();

        var blobName = $"lessons/{lessonId:N}/{Guid.NewGuid():N}{ext}";
        var blob = container.GetBlobClient(blobName);

        await using var stream = file.OpenReadStream();
        await blob.UploadAsync(
            stream,
            new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders
                {
                    ContentType = file.ContentType
                }
            });

        url = blob.Uri.ToString();
    }
    else
    {
        var webRoot = _env.WebRootPath;
        if (string.IsNullOrWhiteSpace(webRoot))
            webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");

        var dir = Path.Combine(webRoot, "uploads", "lessons", lessonId.ToString("N"));
        Directory.CreateDirectory(dir);

        var filename = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
            await file.CopyToAsync(stream);

        url = $"/uploads/lessons/{lessonId:N}/{filename}";
    }

    lesson.ContentUrl = url;
    await _db.SaveChangesAsync();

    return Ok(new { contentUrl = url });
}

    [HttpPost("lessons/{lessonId:guid}/upload-file")]
[Authorize(Roles = "Instructor")]
[Consumes("multipart/form-data")]
[RequestSizeLimit(50 * 1024 * 1024)]
public async Task<IActionResult> UploadLessonFile(Guid lessonId, [FromForm] UploadFileRequest request)
{
    var file = request.File;

    if (file == null || file.Length == 0) return BadRequest("No file uploaded.");

    var userId = UserId(User);
    if (userId is null) return Unauthorized();

    var lesson = await _db.Lessons
        .Include(l => l.Module)
        .ThenInclude(m => m.Course)
        .FirstOrDefaultAsync(l => l.Id == lessonId);

    if (lesson is null) return NotFound();

    if (!await IsAssignedToAcademyAsync(lesson.Module.Course.AcademyId, userId))
        return StatusCode(403, "You are not assigned to this academy.");

    if (string.IsNullOrWhiteSpace(lesson.Module.Course.InstructorUserId))
    {
        lesson.Module.Course.InstructorUserId = userId;
        await _db.SaveChangesAsync();
    }

    if (lesson.Module.Course.IsHidden)
        return BadRequest($"Course is hidden by admin. Reason: {lesson.Module.Course.HiddenReason ?? "Policy violation"}");

    var academy = await _db.Academies.AsNoTracking()
        .FirstOrDefaultAsync(a => a.Id == lesson.Module.Course.AcademyId);

    if (academy != null && academy.IsHidden)
        return BadRequest("Academy is hidden by admin. Uploads are disabled.");

    if (lesson.Type != LessonType.Document)
        return BadRequest("This lesson is not a Document lesson.");

    var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant();
    var contentType = (file.ContentType ?? "").ToLowerInvariant();
    var looksLikePdf = contentType == "application/pdf" || ext == ".pdf";

    if (!looksLikePdf)
        return BadRequest("Only PDF files are allowed.");

    ext = ".pdf";

    string url;

    if (_storage.UseBlob)
    {
        var container = _blobServiceClient.GetBlobContainerClient(_storage.LessonFilesContainer);
        await container.CreateIfNotExistsAsync();

        var blobName = $"lessons/{lessonId:N}/{Guid.NewGuid():N}{ext}";
        var blob = container.GetBlobClient(blobName);

        await using var stream = file.OpenReadStream();
        await blob.UploadAsync(
            stream,
            new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders
                {
                    ContentType = file.ContentType
                }
            });

        url = blob.Uri.ToString();
    }
    else
    {
        var webRoot = _env.WebRootPath;
        if (string.IsNullOrWhiteSpace(webRoot))
            webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");

        var dir = Path.Combine(webRoot, "uploads", "lessons", lessonId.ToString("N"));
        Directory.CreateDirectory(dir);

        var filename = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(dir, filename);

        await using (var stream = System.IO.File.Create(fullPath))
            await file.CopyToAsync(stream);

        url = $"/uploads/lessons/{lessonId:N}/{filename}";
    }

    lesson.ContentUrl = url;
    await _db.SaveChangesAsync();

    return Ok(new { contentUrl = url });
}
}