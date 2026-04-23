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
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<CertificatesController> _logger;

    public CertificatesController(
        AppDbContext db,
        ICertificatePdfService pdf,
        IWebHostEnvironment env,
        ILogger<CertificatesController> logger)
    {
        _db = db;
        _pdf = pdf;
        _env = env;
        _logger = logger;
    }

    private string? UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

    private string? ResolveAcademyLogoAbsolutePath(string? logoUrl)
    {
        if (string.IsNullOrWhiteSpace(logoUrl))
            return null;

        var value = logoUrl.Trim().Replace('\\', '/');

        // If stored as full URL, convert to path part
        if (Uri.TryCreate(value, UriKind.Absolute, out var absoluteUri))
            value = absoluteUri.AbsolutePath;

        value = value.TrimStart('~');

        if (value.StartsWith("/"))
            value = value[1..];

        // If DB accidentally stores "wwwroot/uploads/..."
        if (value.StartsWith("wwwroot/", StringComparison.OrdinalIgnoreCase))
            value = value["wwwroot/".Length..];

        var webRoot = _env.WebRootPath ?? string.Empty;
        if (string.IsNullOrWhiteSpace(webRoot))
            return null;

        var fullPath = Path.Combine(
            webRoot,
            value.Replace('/', Path.DirectorySeparatorChar)
        );

        return System.IO.File.Exists(fullPath) ? fullPath : null;
    }

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

        var course = await _db.Courses.AsNoTracking()
            .Where(x => x.Id == cert.CourseId)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.AcademyId
            })
            .FirstOrDefaultAsync();

        string academyName = cert.AcademyName;
        string? academyLogoPath = null;
        string? rawLogoUrl = null;

        if (course?.AcademyId != null)
        {
            var academy = await _db.Academies.AsNoTracking()
                .Where(a => a.Id == course.AcademyId)
                .Select(a => new
                {
                    a.Name,
                    a.LogoUrl
                })
                .FirstOrDefaultAsync();

            if (academy != null)
            {
                academyName = string.IsNullOrWhiteSpace(academy.Name)
                    ? cert.AcademyName
                    : academy.Name;

                rawLogoUrl = academy.LogoUrl;
                academyLogoPath = ResolveAcademyLogoAbsolutePath(academy.LogoUrl);
            }
        }

        _logger.LogInformation(
            "Certificate PDF generation. CertId={CertId}, CourseId={CourseId}, RawLogoUrl={RawLogoUrl}, ResolvedLogoPath={ResolvedLogoPath}, FileExists={FileExists}",
            cert.Id,
            cert.CourseId,
            rawLogoUrl,
            academyLogoPath,
            !string.IsNullOrWhiteSpace(academyLogoPath) && System.IO.File.Exists(academyLogoPath)
        );

        var pdf = _pdf.Generate(
            cert.CertificateNumber,
            cert.StudentName,
            cert.CourseTitle,
            academyName,
            cert.CompletedAt,
            academyLogoPath
        );

        var fileName = $"certificate-{cert.CertificateNumber}.pdf";
        return File(pdf, "application/pdf", fileName);
    }

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