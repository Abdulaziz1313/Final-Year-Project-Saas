using Microsoft.AspNetCore.Identity;

namespace LearningPlatform.Infrastructure.Identity;

public class ApplicationUser : IdentityUser
{
    public string? ProfileImageUrl { get; set; } 
    public string? DisplayName { get; set; }

}
