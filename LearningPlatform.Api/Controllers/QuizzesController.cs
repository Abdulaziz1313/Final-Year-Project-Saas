using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/quizzes")]
public class QuizzesController : ControllerBase
{
    private readonly AppDbContext _db;

    public QuizzesController(AppDbContext db) => _db = db;

    private static string? UserId(ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier);

    // ---------------- Instructor ----------------

    public record QuizUpsertDto(string Title, List<QuestionUpsertDto> Questions);

    public record QuestionUpsertDto(
        Guid? Id,
        QuizQuestionType Type,
        string Prompt,
        int Points,
        List<ChoiceUpsertDto>? Choices,
        string? CorrectAnswerText,
        ShortAnswerMatchType? MatchType
    );

    public record ChoiceUpsertDto(Guid? Id, string Text, bool IsCorrect);

    [HttpGet("lesson/{lessonId:guid}")]
    [Authorize(Roles = "Instructor,Admin")]
    public async Task<ActionResult<object>> GetForInstructor(Guid lessonId)
    {
        var dto = await _db.Quizzes
            .AsNoTracking()
            .Where(x => x.LessonId == lessonId)
            .Select(quiz => new
            {
                id = quiz.Id,
                title = quiz.Title,
                questions = quiz.Questions
                    .OrderBy(q => q.Id)
                    .Select(q => new
                    {
                        id = q.Id,
                        type = q.Type,
                        prompt = q.Prompt,
                        points = q.Points,
                        choices = q.Choices
                            .OrderBy(c => c.Id)
                            .Select(c => new
                            {
                                id = c.Id,
                                text = c.Text,
                                isCorrect = c.IsCorrect
                            })
                            .ToList(),
                        correctAnswerText = q.CorrectAnswerText,
                        matchType = q.MatchType
                    })
                    .ToList()
            })
            .AsSplitQuery()
            .FirstOrDefaultAsync();

        return Ok(dto); // null if no quiz yet
    }

    [HttpPut("lesson/{lessonId:guid}")]
    [Authorize(Roles = "Instructor,Admin")]
    public async Task<ActionResult> Upsert(Guid lessonId, [FromBody] QuizUpsertDto dto)
    {
        var lesson = await _db.Lessons.FirstOrDefaultAsync(l => l.Id == lessonId);
        if (lesson == null) return NotFound("Lesson not found.");

        if ((int)lesson.Type != 3)
            return BadRequest("Lesson is not a Quiz type.");

        Quiz? quiz = null;
        try
        {
            quiz = await _db.Quizzes
                .Include(x => x.Questions).ThenInclude(q => q.Choices)
                .AsSplitQuery()
                .FirstOrDefaultAsync(x => x.LessonId == lessonId);
        }
        catch (InvalidCastException)
        {
            // If DB has a datetime/datetimeoffset mismatch on Quiz.CreatedAt etc,
            // at least allow upsert by attaching existing quiz id.
            var existingId = await _db.Quizzes
                .AsNoTracking()
                .Where(x => x.LessonId == lessonId)
                .Select(x => x.Id)
                .FirstOrDefaultAsync();

            if (existingId == Guid.Empty)
                quiz = null;
            else
            {
                quiz = new Quiz { Id = existingId, LessonId = lessonId };
                _db.Attach(quiz);
            }
        }

        if (quiz == null)
        {
            quiz = new Quiz
            {
                LessonId = lessonId,
                Title = dto.Title
            };
            _db.Quizzes.Add(quiz);
            await _db.SaveChangesAsync();
        }
        else
        {
            quiz.Title = dto.Title;
        }

        // Replace all questions (simple + safe)
        var oldQuestions = await _db.QuizQuestions
            .Where(q => q.QuizId == quiz.Id)
            .ToListAsync();

        if (oldQuestions.Count > 0)
            _db.QuizQuestions.RemoveRange(oldQuestions);

        foreach (var q in dto.Questions ?? new())
        {
            var qq = new QuizQuestion
            {
                QuizId = quiz.Id,
                Type = q.Type,
                Prompt = q.Prompt ?? "",
                Points = Math.Max(1, q.Points),
                CorrectAnswerText = q.CorrectAnswerText,
                MatchType = q.MatchType
            };

            if (q.Type == QuizQuestionType.TrueFalse)
            {
                var provided = q.Choices ?? new();
                bool trueCorrect =
                    provided.FirstOrDefault(c =>
                        (c.Text ?? "").Trim().Equals("true", StringComparison.OrdinalIgnoreCase)
                    )?.IsCorrect ?? true;

                qq.Choices.Add(new QuizChoice { Text = "True", IsCorrect = trueCorrect });
                qq.Choices.Add(new QuizChoice { Text = "False", IsCorrect = !trueCorrect });
            }
            else if (q.Type == QuizQuestionType.McqSingle)
            {
                foreach (var c in (q.Choices ?? new()))
                    qq.Choices.Add(new QuizChoice { Text = c.Text ?? "", IsCorrect = c.IsCorrect });

                if (qq.Choices.Count == 0)
                {
                    qq.Choices.Add(new QuizChoice { Text = "Option 1", IsCorrect = true });
                    qq.Choices.Add(new QuizChoice { Text = "Option 2", IsCorrect = false });
                }

                var firstCorrect = qq.Choices.FindIndex(x => x.IsCorrect);
                if (firstCorrect < 0) qq.Choices[0].IsCorrect = true;
                else
                {
                    for (int i = 0; i < qq.Choices.Count; i++)
                        qq.Choices[i].IsCorrect = (i == firstCorrect);
                }
            }

            _db.QuizQuestions.Add(qq);
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // ---------------- Student ----------------

    [HttpGet("student/lesson/{lessonId:guid}")]
    [Authorize(Roles = "Student,Admin")]
    public async Task<ActionResult<object>> GetForStudent(Guid lessonId)
    {
        var uid = UserId(User);
        if (uid == null) return Unauthorized();

        var quizDto = await _db.Quizzes
            .AsNoTracking()
            .Where(x => x.LessonId == lessonId)
            .Select(quiz => new
            {
                id = quiz.Id,
                title = quiz.Title,
                questions = quiz.Questions
                    .OrderBy(q => q.Id)
                    .Select(q => new
                    {
                        id = q.Id,
                        type = q.Type,
                        prompt = q.Prompt,
                        points = q.Points,
                        choices = q.Choices
                            .OrderBy(c => c.Id)
                            .Select(c => new { id = c.Id, text = c.Text })
                            .ToList()
                    })
                    .ToList()
            })
            .AsSplitQuery()
            .FirstOrDefaultAsync();

        if (quizDto == null) return NotFound("Quiz not found.");

        // Latest attempt (draft OR submitted)
        var latest = await _db.QuizAttempts
            .Include(a => a.Answers)
            .AsSplitQuery()
            .AsNoTracking()
            .Where(a => a.QuizId == quizDto.id && a.StudentUserId == uid)
            .OrderByDescending(a => a.UpdatedAt)
            .ThenByDescending(a => a.StartedAt)
            .ThenByDescending(a => a.Id)
            .FirstOrDefaultAsync();

        var dto = new
        {
            id = quizDto.id,
            title = quizDto.title,

            latestAttempt = latest == null ? null : new
            {
                attemptId = latest.Id,
                submittedAt = latest.SubmittedAt,
                startedAt = latest.StartedAt,
                updatedAt = latest.UpdatedAt,
                score = latest.Score,
                maxScore = latest.MaxScore,
                status = latest.Status
            },

            latestAnswers = (latest?.Answers ?? new List<QuizAttemptAnswer>())
                .Select(a => new
                {
                    questionId = a.QuestionId,
                    selectedChoiceId = a.SelectedChoiceId,
                    answerText = a.AnswerText,
                    isCorrect = a.IsCorrect,
                    earnedPoints = a.EarnedPoints
                })
                .ToList(),

            questions = quizDto.questions
        };

        return Ok(dto);
    }

    public record AttemptSubmitDto(List<AnswerSubmitDto> Answers);
    public record AnswerSubmitDto(Guid QuestionId, Guid? SelectedChoiceId, string? AnswerText);

    public record AttemptResultDto(Guid AttemptId, int Score, int MaxScore, QuizAttemptStatus Status);

    // ✅ IMPORTANT: Only ONE SubmitAttempt endpoint (your file had a duplicate)
    [HttpPost("{quizId:guid}/attempts")]
    [Authorize(Roles = "Student,Admin")]
    public async Task<ActionResult<AttemptResultDto>> SubmitAttempt(Guid quizId, [FromBody] AttemptSubmitDto dto)
    {
        var uid = UserId(User);
        if (uid == null) return Unauthorized();

        var quiz = await _db.Quizzes
            .Include(x => x.Questions).ThenInclude(q => q.Choices)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == quizId);

        if (quiz == null) return NotFound("Quiz not found.");

        var (score, max, status, gradedAnswers) = Grade(quiz, dto);

        // Reuse draft attempt if exists, else create
        var attempt = await _db.QuizAttempts
            .AsSplitQuery()
            .FirstOrDefaultAsync(a => a.QuizId == quizId && a.StudentUserId == uid && a.SubmittedAt == null);

        if (attempt == null)
        {
            attempt = new QuizAttempt
            {
                QuizId = quizId,
                StudentUserId = uid,
                StartedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
                Status = QuizAttemptStatus.InProgress,
                Score = 0,
                MaxScore = max
            };
            _db.QuizAttempts.Add(attempt);
            await _db.SaveChangesAsync(); // ensure attempt.Id exists
        }

        // Hard delete existing answers for this attempt (prevents concurrency issues)
        await _db.QuizAttemptAnswers
            .Where(x => x.AttemptId == attempt.Id)
            .ExecuteDeleteAsync();

        // Insert new graded answers
        foreach (var a in gradedAnswers)
            a.AttemptId = attempt.Id;

        _db.QuizAttemptAnswers.AddRange(gradedAnswers);

        attempt.SubmittedAt = DateTimeOffset.UtcNow;
        attempt.UpdatedAt = DateTimeOffset.UtcNow;
        attempt.Status = status;
        attempt.Score = score;
        attempt.MaxScore = max;

        await _db.SaveChangesAsync();

        return Ok(new AttemptResultDto(attempt.Id, attempt.Score, attempt.MaxScore, attempt.Status));
    }

    public record AttemptSaveDto(List<AnswerSubmitDto> Answers);

    [HttpPost("{quizId:guid}/attempts/save")]
    [Authorize(Roles = "Student,Admin")]
    public async Task<ActionResult> SaveDraftAttempt(Guid quizId, [FromBody] AttemptSaveDto dto)
    {
        var uid = UserId(User);
        if (uid == null) return Unauthorized();

        var quiz = await _db.Quizzes
            .Include(q => q.Questions)
            .AsSplitQuery()
            .AsNoTracking()
            .FirstOrDefaultAsync(q => q.Id == quizId);

        if (quiz == null) return NotFound("Quiz not found.");

        var attempt = await _db.QuizAttempts
            .Include(a => a.Answers)
            .AsSplitQuery()
            .FirstOrDefaultAsync(a =>
                a.QuizId == quizId &&
                a.StudentUserId == uid &&
                a.SubmittedAt == null);

        if (attempt == null)
        {
            attempt = new QuizAttempt
            {
                QuizId = quizId,
                StudentUserId = uid,
                StartedAt = DateTimeOffset.UtcNow,
                SubmittedAt = null,
                UpdatedAt = DateTimeOffset.UtcNow,
                Status = QuizAttemptStatus.InProgress,
                Score = 0,
                MaxScore = (quiz.Questions ?? new()).Sum(q => Math.Max(1, q.Points)),
            };

            _db.QuizAttempts.Add(attempt);
            await _db.SaveChangesAsync();
        }

        var incoming = (dto.Answers ?? new())
            .GroupBy(a => a.QuestionId)
            .ToDictionary(g => g.Key, g => g.First());

        foreach (var q in (quiz.Questions ?? new()))
        {
            incoming.TryGetValue(q.Id, out var a);

            var existing = attempt.Answers.FirstOrDefault(x => x.QuestionId == q.Id);

            if (existing == null)
            {
                existing = new QuizAttemptAnswer
                {
                    AttemptId = attempt.Id,
                    QuestionId = q.Id
                };
                attempt.Answers.Add(existing);
                _db.QuizAttemptAnswers.Add(existing);
            }

            existing.SelectedChoiceId = a?.SelectedChoiceId;
            existing.AnswerText = a?.AnswerText?.Trim();

            existing.IsCorrect = null;
            existing.EarnedPoints = 0;
        }

        attempt.Status = QuizAttemptStatus.InProgress;
        attempt.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { attemptId = attempt.Id });
    }


    [HttpPost("{quizId:guid}/attempts/retake")]
[Authorize(Roles = "Student,Admin")]
public async Task<ActionResult<object>> Retake(Guid quizId)
{
    var uid = UserId(User);
    if (uid == null) return Unauthorized();

    // ensure quiz exists
    var quizExists = await _db.Quizzes.AsNoTracking().AnyAsync(q => q.Id == quizId);
    if (!quizExists) return NotFound("Quiz not found.");

    // If there is an existing draft attempt (not submitted), delete it so we start clean
    var draft = await _db.QuizAttempts
        .Where(a => a.QuizId == quizId && a.StudentUserId == uid && a.SubmittedAt == null)
        .OrderByDescending(a => a.UpdatedAt)
        .FirstOrDefaultAsync();

    if (draft != null)
    {
        await _db.QuizAttemptAnswers
            .Where(x => x.AttemptId == draft.Id)
            .ExecuteDeleteAsync();

        _db.QuizAttempts.Remove(draft);
        await _db.SaveChangesAsync();
    }

    // Create a brand new draft attempt
    var attempt = new QuizAttempt
    {
        QuizId = quizId,
        StudentUserId = uid,
        StartedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        SubmittedAt = null,
        Status = QuizAttemptStatus.InProgress,
        Score = 0,
        MaxScore = 0
    };

    _db.QuizAttempts.Add(attempt);
    await _db.SaveChangesAsync();

    return Ok(new { attemptId = attempt.Id });
}


    // ---------------- Grading ----------------
    private static (int score, int max, QuizAttemptStatus status, List<QuizAttemptAnswer> answers)
        Grade(Quiz quiz, AttemptSubmitDto submit)
    {
        var map = (submit.Answers ?? new())
            .GroupBy(a => a.QuestionId)
            .ToDictionary(g => g.Key, g => g.First());

        int score = 0;
        int max = 0;
        var status = QuizAttemptStatus.AutoGraded;

        var outAnswers = new List<QuizAttemptAnswer>();

        foreach (var q in quiz.Questions ?? new List<QuizQuestion>())
        {
            max += Math.Max(1, q.Points);
            map.TryGetValue(q.Id, out var a);

            var aa = new QuizAttemptAnswer
            {
                QuestionId = q.Id,
                SelectedChoiceId = a?.SelectedChoiceId,
                AnswerText = a?.AnswerText?.Trim()
            };

            if (q.Type == QuizQuestionType.McqSingle || q.Type == QuizQuestionType.TrueFalse)
            {
                var correctChoiceId = (q.Choices ?? new List<QuizChoice>())
                    .FirstOrDefault(c => c.IsCorrect)?.Id;

                aa.IsCorrect = (correctChoiceId != null && aa.SelectedChoiceId == correctChoiceId);
                aa.EarnedPoints = aa.IsCorrect == true ? Math.Max(1, q.Points) : 0;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(q.CorrectAnswerText))
                {
                    aa.IsCorrect = null;
                    aa.EarnedPoints = 0;
                    status = QuizAttemptStatus.NeedsReview;
                }
                else
                {
                    var expected = (q.CorrectAnswerText ?? "")
                        .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

                    var given = (aa.AnswerText ?? "").Trim();

                    bool ok = q.MatchType == ShortAnswerMatchType.Exact
                        ? expected.Any(x => string.Equals(x, given, StringComparison.Ordinal))
                        : expected.Any(x => string.Equals(x, given, StringComparison.OrdinalIgnoreCase));

                    aa.IsCorrect = ok;
                    aa.EarnedPoints = ok ? Math.Max(1, q.Points) : 0;
                }
            }

            score += aa.EarnedPoints;
            outAnswers.Add(aa);
        }

        return (score, max, status, outAnswers);
    }
}
