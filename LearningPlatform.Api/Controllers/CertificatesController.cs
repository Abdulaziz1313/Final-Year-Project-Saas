using System.Security.Claims;
using LearningPlatform.Api.Services;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/certificates")]
public class CertificatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICertificatePdfService _pdf;

    public CertificatesController(AppDbContext db, ICertificatePdfService pdf)
    {
        _db = db;
        _pdf = pdf;
    }

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    // GET /api/certificates/me
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> MyCertificates()
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var items = await _db.Certificates.AsNoTracking()
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.CompletedAt)
            .Select(c => new
            {
                c.Id,
                c.CertificateNumber,
                c.CourseId,
                c.CourseTitle,
                c.AcademyName,
                c.CompletedAt,
                c.CreatedAt
            })
            .ToListAsync();

        return Ok(items);
    }

    // GET /api/certificates/{id}
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> GetOne(Guid id)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var cert = await _db.Certificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id);

        if (cert is null) return NotFound();
        if (cert.UserId != userId) return Forbid();

        return Ok(new
        {
            cert.Id,
            cert.CertificateNumber,
            cert.CourseId,
            cert.StudentName,
            cert.StudentEmail,
            cert.CourseTitle,
            cert.AcademyName,
            cert.CompletedAt,
            cert.Score,
            cert.CreatedAt
        });
    }

    // GET /api/certificates/{id}/pdf
    [HttpGet("{id:guid}/pdf")]
    [Authorize]
    public async Task<IActionResult> DownloadPdf(Guid id)
    {
        var userId = UserId();
        if (userId is null) return Unauthorized();

        var cert = await _db.Certificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id);

        if (cert is null) return NotFound();
        if (cert.UserId != userId) return Forbid();

        // Use CompletedAt as "issuedAt" for the PDF
        var pdf = _pdf.Generate(
            cert.CertificateNumber,
            cert.StudentName,
            cert.CourseTitle,
            cert.AcademyName,
            cert.CompletedAt
        );

        var fileName = $"certificate-{cert.CertificateNumber}.pdf";
        return File(pdf, "application/pdf", fileName);
    }

    // Optional public verification endpoint:
    // GET /api/certificates/verify/{certificateNumber}
    [HttpGet("verify/{certificateNumber}")]
    [AllowAnonymous]
    public async Task<IActionResult> Verify(string certificateNumber)
    {
        certificateNumber = (certificateNumber ?? "").Trim();

        if (string.IsNullOrWhiteSpace(certificateNumber))
            return BadRequest("Certificate number is required.");

        var cert = await _db.Certificates.AsNoTracking()
            .Where(c => c.CertificateNumber == certificateNumber)
            .Select(c => new
            {
                c.CertificateNumber,
                c.CourseTitle,
                c.AcademyName,
                c.CompletedAt
            })
            .FirstOrDefaultAsync();

        if (cert is null) return NotFound("Certificate not found.");

        return Ok(new
        {
            valid = true,
            cert.CertificateNumber,
            cert.CourseTitle,
            cert.AcademyName,
            cert.CompletedAt
        });
    }
}