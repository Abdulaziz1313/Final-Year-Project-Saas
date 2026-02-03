using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/me")]
public class MeController : ControllerBase
{
    [HttpGet]
    [Authorize]
    public IActionResult Get()
    {
        var claims = User.Claims
            .Select(c => new { c.Type, c.Value })
            .ToList();

        var roles = User.Claims
            .Where(c => c.Type == ClaimTypes.Role)
            .Select(c => c.Value)
            .Distinct()
            .ToList();

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        // Try common locations for email
        var email =
            User.FindFirstValue(ClaimTypes.Email) ??
            User.Claims.FirstOrDefault(c => c.Type.EndsWith("/emailaddress"))?.Value ??
            User.Claims.FirstOrDefault(c => c.Type == "email")?.Value ??
            "";

        return Ok(new { userId, email, roles, claims });
    }
}
