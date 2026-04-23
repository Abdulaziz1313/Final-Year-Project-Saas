using System.Text.Json;
using System.Text.RegularExpressions;
using LearningPlatform.Application.Common.Interfaces;
using LearningPlatform.Application.Features.Ai.Dtos;
using LearningPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Application.Features.Ai.Services;

public class AiLessonService : IAiLessonService
{
    private readonly IAppDbContext _db;
    private readonly IAiClient _aiClient;

    public AiLessonService(IAppDbContext db, IAiClient aiClient)
    {
        _db = db;
        _aiClient = aiClient;
    }

    public async Task<AiLessonSummaryDto?> GetSummaryAsync(Guid lessonId, CancellationToken ct = default)
    {
        var entity = await _db.LessonAiSummaries
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.LessonId == lessonId, ct);

        if (entity == null) return null;

        return MapToDto(entity);
    }

    public async Task<AiLessonSummaryDto> GenerateSummaryAsync(Guid lessonId, CancellationToken ct = default)
    {
        var lesson = await _db.Lessons
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == lessonId, ct);

        if (lesson == null)
            throw new KeyNotFoundException("Lesson not found.");

        var lessonText = BuildLessonText(lesson);

        if (string.IsNullOrWhiteSpace(lessonText))
            throw new InvalidOperationException("This lesson does not contain enough text to summarize yet.");

        var prompt = $@"
Return valid JSON only in this exact shape:
{{
  ""summary"": ""string"",
  ""keyPoints"": [""string""],
  ""importantTerms"": [""string""]
}}

Create a student-friendly lesson summary.

Lesson title:
{lesson.Title}

Lesson type:
{lesson.Type}

Lesson content:
{lessonText}
";

        var aiJson = await _aiClient.GenerateJsonAsync(prompt, ct);

        var aiResult = JsonSerializer.Deserialize<AiSummaryResponse>(aiJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (aiResult == null || string.IsNullOrWhiteSpace(aiResult.Summary))
            throw new InvalidOperationException("AI returned invalid summary data.");

        var existing = await _db.LessonAiSummaries
            .FirstOrDefaultAsync(x => x.LessonId == lessonId, ct);

        if (existing == null)
        {
            existing = new LessonAiSummary
            {
                Id = Guid.NewGuid(),
                LessonId = lessonId,
                Summary = aiResult.Summary.Trim(),
                KeyPointsJson = JsonSerializer.Serialize(aiResult.KeyPoints ?? new List<string>()),
                ImportantTermsJson = JsonSerializer.Serialize(aiResult.ImportantTerms ?? new List<string>()),
                CreatedAt = DateTimeOffset.UtcNow
            };

            _db.LessonAiSummaries.Add(existing);
        }
        else
        {
            existing.Summary = aiResult.Summary.Trim();
            existing.KeyPointsJson = JsonSerializer.Serialize(aiResult.KeyPoints ?? new List<string>());
            existing.ImportantTermsJson = JsonSerializer.Serialize(aiResult.ImportantTerms ?? new List<string>());
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync(ct);

        return MapToDto(existing);
    }

    public async Task<List<AiQuizDraftDto>> GenerateQuizAsync(
        Guid lessonId,
        AiQuizGenerationRequest request,
        CancellationToken ct = default)
    {
        var lesson = await _db.Lessons
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == lessonId, ct);

        if (lesson == null)
            throw new KeyNotFoundException("Lesson not found.");

        var lessonText = BuildLessonText(lesson);

        if (string.IsNullOrWhiteSpace(lessonText))
            throw new InvalidOperationException("This lesson does not contain enough text to generate quiz questions.");

        var questionCount = Math.Clamp(request.QuestionCount, 1, 20);
        var difficulty = string.IsNullOrWhiteSpace(request.Difficulty)
            ? "Beginner"
            : request.Difficulty.Trim();

        var topic = string.IsNullOrWhiteSpace(request.Topic)
            ? lesson.Title
            : request.Topic.Trim();

        var extraInstructions = string.IsNullOrWhiteSpace(request.Instructions)
            ? "No extra instructions."
            : request.Instructions.Trim();

        var prompt = $@"
Return valid JSON only.

Return this exact shape:
{{
  ""questions"": [
    {{
      ""type"": 0,
      ""prompt"": ""string"",
      ""points"": 1,
      ""choices"": [
        {{ ""text"": ""string"", ""isCorrect"": true }},
        {{ ""text"": ""string"", ""isCorrect"": false }}
      ],
      ""correctAnswerText"": null,
      ""matchType"": null
    }}
  ]
}}

Rules:
- type 0 = MCQ single answer
- type 1 = True/False
- type 2 = Short answer
- Return exactly {questionCount} questions
- Mix question types when appropriate, but prefer MCQ
- Every question must have points >= 1
- For type 0:
  - include 3 to 4 choices
  - exactly one choice must have isCorrect = true
- For type 1:
  - choices must be exactly:
    - True
    - False
  - exactly one must be correct
- For type 2:
  - choices must be null or empty
  - correctAnswerText must contain one or more accepted answers separated by |
  - matchType must be 0 or 1
- Keep wording clear and student-friendly
- Base questions only on the lesson content
- Do not include explanations
- Do not include markdown
- Do not include any text outside JSON

Topic:
{topic}

Difficulty:
{difficulty}

Extra instructions:
{extraInstructions}

Lesson title:
{lesson.Title}

Lesson type:
{lesson.Type}

Lesson content:
{lessonText}
";

        var aiJson = await _aiClient.GenerateJsonAsync(prompt, ct);

        var aiResult = JsonSerializer.Deserialize<AiQuizResponse>(aiJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (aiResult?.Questions == null || aiResult.Questions.Count == 0)
            throw new InvalidOperationException("AI returned invalid quiz data.");

        var cleaned = aiResult.Questions
            .Select(NormalizeQuizQuestion)
            .Where(q => q != null)
            .Cast<AiQuizDraftDto>()
            .Take(questionCount)
            .ToList();

        if (cleaned.Count == 0)
            throw new InvalidOperationException("AI did not return usable quiz questions.");

        return cleaned;
    }

    public async Task<List<AiFlashcardDto>> GenerateFlashcardsAsync(
        Guid lessonId,
        AiFlashcardGenerateRequest request,
        CancellationToken ct = default)
    {
        var lesson = await _db.Lessons
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == lessonId, ct);

        if (lesson == null)
            throw new KeyNotFoundException("Lesson not found.");

        var lessonText = BuildLessonText(lesson);

        if (string.IsNullOrWhiteSpace(lessonText))
            throw new InvalidOperationException("This lesson does not contain enough text to generate flashcards.");

        var count = Math.Clamp(request.Count, 1, 20);
        var difficulty = string.IsNullOrWhiteSpace(request.Difficulty)
            ? "Beginner"
            : request.Difficulty.Trim();

        var topic = string.IsNullOrWhiteSpace(request.Topic)
            ? lesson.Title
            : request.Topic.Trim();

        var extraInstructions = string.IsNullOrWhiteSpace(request.Instructions)
            ? "None"
            : request.Instructions.Trim();

        var prompt = $@"
Return valid JSON only in this exact shape:
{{
  ""flashcards"": [
    {{
      ""question"": ""string"",
      ""answer"": ""string""
    }}
  ]
}}

Create {count} student-friendly flashcards from this lesson.

Rules:
- Keep each question clear and short.
- Keep each answer accurate and concise.
- Focus on key concepts, definitions, and important facts.
- Avoid duplicates.
- Difficulty: {difficulty}
- Topic focus: {topic}
- Extra instructions: {extraInstructions}
- Do not include markdown.
- Do not include any text outside JSON.

Lesson title:
{lesson.Title}

Lesson type:
{lesson.Type}

Lesson content:
{lessonText}
";

        var aiJson = await _aiClient.GenerateJsonAsync(prompt, ct);

        var aiResult = JsonSerializer.Deserialize<AiFlashcardResponse>(aiJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (aiResult?.Flashcards == null || aiResult.Flashcards.Count == 0)
            throw new InvalidOperationException("AI returned invalid flashcard data.");

        return aiResult.Flashcards
            .Where(x => !string.IsNullOrWhiteSpace(x.Question) && !string.IsNullOrWhiteSpace(x.Answer))
            .Select((x, i) => new AiFlashcardDto
            {
                Id = null,
                Question = x.Question.Trim(),
                Answer = x.Answer.Trim(),
                OrderIndex = i,
                IsPublished = false
            })
            .ToList();
    }

    public async Task<List<AiFlashcardDto>> GetFlashcardsAsync(Guid lessonId, CancellationToken ct)
    {
        var exists = await _db.Lessons
            .AsNoTracking()
            .AnyAsync(x => x.Id == lessonId, ct);

        if (!exists)
            throw new KeyNotFoundException("Lesson not found.");

        var items = await _db.LessonAiFlashcards
            .AsNoTracking()
            .Where(x => x.LessonId == lessonId)
            .OrderBy(x => x.OrderIndex)
            .ThenBy(x => x.CreatedAt)
            .Select(x => new AiFlashcardDto
            {
                Id = x.Id,
                Question = x.Question,
                Answer = x.Answer,
                OrderIndex = x.OrderIndex,
                IsPublished = x.IsPublished
            })
            .ToListAsync(ct);

        return items;
    }

    public async Task<List<AiFlashcardDto>> SaveFlashcardsAsync(
        Guid lessonId,
        List<AiFlashcardDto> flashcards,
        CancellationToken ct)
    {
        var lesson = await _db.Lessons
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == lessonId, ct);

        if (lesson == null)
            throw new KeyNotFoundException("Lesson not found.");

        var cleaned = (flashcards ?? new List<AiFlashcardDto>())
            .Where(x => !string.IsNullOrWhiteSpace(x.Question) && !string.IsNullOrWhiteSpace(x.Answer))
            .Select((x, i) => new AiFlashcardDto
            {
                Id = x.Id,
                Question = x.Question.Trim(),
                Answer = x.Answer.Trim(),
                OrderIndex = i,
                IsPublished = x.IsPublished
            })
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
                OrderIndex = item.OrderIndex,
                IsPublished = item.IsPublished,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);

        return await GetFlashcardsAsync(lessonId, ct);
    }

    public async Task<List<AiFlashcardDto>> SetFlashcardsPublishedAsync(
        Guid lessonId,
        bool isPublished,
        CancellationToken ct)
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
            .Select(x => new AiFlashcardDto
            {
                Id = x.Id,
                Question = x.Question,
                Answer = x.Answer,
                OrderIndex = x.OrderIndex,
                IsPublished = x.IsPublished
            })
            .ToList();
    }

    private static AiLessonSummaryDto MapToDto(LessonAiSummary entity)
    {
        return new AiLessonSummaryDto
        {
            LessonId = entity.LessonId,
            Summary = entity.Summary,
            KeyPoints = DeserializeList(entity.KeyPointsJson),
            ImportantTerms = DeserializeList(entity.ImportantTermsJson),
            CreatedAt = entity.CreatedAt
        };
    }

    private static List<string> DeserializeList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<string>();

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static string BuildLessonText(Lesson lesson)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(lesson.Title))
            parts.Add(lesson.Title);

        if (!string.IsNullOrWhiteSpace(lesson.HtmlContent))
            parts.Add(StripHtml(lesson.HtmlContent));

        var combined = string.Join("\n\n", parts).Trim();

        if (combined.Length > 12000)
            combined = combined[..12000];

        return combined;
    }

    private static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;

        var text = Regex.Replace(html, "<.*?>", " ");
        text = text.Replace("&nbsp;", " ");
        text = text.Replace("&amp;", "&");
        text = Regex.Replace(text, @"\s+", " ");

        return text.Trim();
    }

    private static AiQuizDraftDto? NormalizeQuizQuestion(AiQuizDraftDto? input)
    {
        if (input == null || string.IsNullOrWhiteSpace(input.Prompt))
            return null;

        var type = input.Type;
        if (type < 0 || type > 2)
            type = 0;

        var result = new AiQuizDraftDto
        {
            Type = type,
            Prompt = input.Prompt.Trim(),
            Points = input.Points <= 0 ? 1 : input.Points
        };

        if (type == 2)
        {
            result.Choices = null;
            result.CorrectAnswerText = string.IsNullOrWhiteSpace(input.CorrectAnswerText)
                ? null
                : input.CorrectAnswerText.Trim();
            result.MatchType = input.MatchType is 1 ? 1 : 0;

            return string.IsNullOrWhiteSpace(result.CorrectAnswerText) ? null : result;
        }

        var choices = (input.Choices ?? new List<AiQuizChoiceDto>())
            .Where(c => !string.IsNullOrWhiteSpace(c.Text))
            .Select(c => new AiQuizChoiceDto
            {
                Text = c.Text.Trim(),
                IsCorrect = c.IsCorrect
            })
            .ToList();

        if (type == 1)
        {
            var trueChoice = choices.FirstOrDefault(c =>
                string.Equals(c.Text, "True", StringComparison.OrdinalIgnoreCase));
            var falseChoice = choices.FirstOrDefault(c =>
                string.Equals(c.Text, "False", StringComparison.OrdinalIgnoreCase));

            var trueIsCorrect = trueChoice?.IsCorrect ?? !(falseChoice?.IsCorrect ?? false);

            result.Choices = new List<AiQuizChoiceDto>
            {
                new() { Text = "True", IsCorrect = trueIsCorrect },
                new() { Text = "False", IsCorrect = !trueIsCorrect }
            };

            result.CorrectAnswerText = null;
            result.MatchType = null;
            return result;
        }

        if (choices.Count < 2)
            return null;

        var firstCorrectIndex = choices.FindIndex(c => c.IsCorrect);
        if (firstCorrectIndex < 0)
            firstCorrectIndex = 0;

        for (int i = 0; i < choices.Count; i++)
            choices[i].IsCorrect = i == firstCorrectIndex;

        if (choices.Count > 4)
            choices = choices.Take(4).ToList();

        result.Choices = choices;
        result.CorrectAnswerText = null;
        result.MatchType = null;

        return result;
    }

    private sealed class AiSummaryResponse
    {
        public string Summary { get; set; } = string.Empty;
        public List<string> KeyPoints { get; set; } = new();
        public List<string> ImportantTerms { get; set; } = new();
    }

    private sealed class AiQuizResponse
    {
        public List<AiQuizDraftDto> Questions { get; set; } = new();
    }

    private sealed class AiFlashcardResponse
    {
        public List<AiFlashcardItem> Flashcards { get; set; } = new();
    }

    private sealed class AiFlashcardItem
    {
        public string Question { get; set; } = string.Empty;
        public string Answer { get; set; } = string.Empty;
    }
}