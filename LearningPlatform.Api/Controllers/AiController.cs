using LearningPlatform.Application.Features.Ai.Dtos;
using LearningPlatform.Application.Features.Ai.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly IAiLessonService _aiLessonService;

    public AiController(IAiLessonService aiLessonService)
    {
        _aiLessonService = aiLessonService;
    }

    [HttpGet("lessons/{lessonId:guid}/summary")]
    [Authorize]
    public async Task<IActionResult> GetLessonSummary(Guid lessonId, CancellationToken ct)
    {
        var result = await _aiLessonService.GetSummaryAsync(lessonId, ct);
        if (result == null) return NotFound();

        return Ok(result);
    }

    [HttpPost("lessons/{lessonId:guid}/summary/generate")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> GenerateLessonSummary(Guid lessonId, CancellationToken ct)
    {
        var result = await _aiLessonService.GenerateSummaryAsync(lessonId, ct);
        return Ok(result);
    }

    [HttpPost("lessons/{lessonId:guid}/quiz/generate")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> GenerateLessonQuiz(
        Guid lessonId,
        [FromBody] AiQuizGenerationRequest request,
        CancellationToken ct)
    {
        if (request == null)
            return BadRequest("Request body is required.");

        if (request.QuestionCount <= 0)
            return BadRequest("QuestionCount must be greater than 0.");

        var result = await _aiLessonService.GenerateQuizAsync(lessonId, request, ct);
        return Ok(result);
    }

    [HttpPost("lessons/{lessonId:guid}/flashcards/generate")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> GenerateLessonFlashcards(
        Guid lessonId,
        [FromBody] AiFlashcardGenerateRequest request,
        CancellationToken ct)
    {
        if (request == null)
            return BadRequest("Request body is required.");

        if (request.Count <= 0)
            return BadRequest("Count must be greater than 0.");

        var result = await _aiLessonService.GenerateFlashcardsAsync(lessonId, request, ct);
        return Ok(result);
    }

    // Optional backward-compatible reads
    [HttpGet("lessons/{lessonId:guid}/flashcards")]
    [Authorize]
    public async Task<IActionResult> GetLessonFlashcards(Guid lessonId, CancellationToken ct)
    {
        var result = await _aiLessonService.GetFlashcardsAsync(lessonId, ct);
        return Ok(result);
    }

    // Optional backward-compatible writes
    [HttpPut("lessons/{lessonId:guid}/flashcards")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> SaveLessonFlashcards(
        Guid lessonId,
        [FromBody] AiFlashcardUpsertRequest request,
        CancellationToken ct)
    {
        if (request == null)
            return BadRequest("Request body is required.");

        var result = await _aiLessonService.SaveFlashcardsAsync(
            lessonId,
            request.Flashcards ?? new List<AiFlashcardDto>(),
            ct);

        return Ok(result);
    }

    [HttpPost("lessons/{lessonId:guid}/flashcards/publish")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> PublishLessonFlashcards(Guid lessonId, CancellationToken ct)
    {
        var result = await _aiLessonService.SetFlashcardsPublishedAsync(lessonId, true, ct);
        return Ok(result);
    }

    [HttpPost("lessons/{lessonId:guid}/flashcards/unpublish")]
    [Authorize(Roles = "Instructor,Admin,Coordinator")]
    public async Task<IActionResult> UnpublishLessonFlashcards(Guid lessonId, CancellationToken ct)
    {
        var result = await _aiLessonService.SetFlashcardsPublishedAsync(lessonId, false, ct);
        return Ok(result);
    }
}