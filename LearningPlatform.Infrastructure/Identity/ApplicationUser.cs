using Microsoft.AspNetCore.Identity;

namespace LearningPlatform.Infrastructure.Identity;

public class ApplicationUser : IdentityUser
{
    public string? ProfileImageUrl { get; set; }
    public string? DisplayName { get; set; }

    /// <summary>Set for OrgAdmin users — the org they own/manage.</summary>
    public Guid? OrganizationId { get; set; }

    /// <summary>
    /// Set for Instructor/Student users.
    /// Links them to the specific academy they belong to.
    /// Their OrganizationId is also set = Academy.OrganizationId.
    /// </summary>
    public Guid? AcademyId { get; set; }

    /// <summary>
    /// If true, user must change password before using the account normally.
    /// Used for instructors created by OrgAdmin with a temporary password.
    /// </summary>
    public bool MustChangePassword { get; set; } = false;
}