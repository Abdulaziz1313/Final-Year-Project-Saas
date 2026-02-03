namespace LearningPlatform.Domain.Entities;

public class Academy
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;

    public string? Website { get; set; }
    public string PrimaryColor { get; set; } = "#7c3aed";

    public string? Description { get; set; }
    public string? LogoUrl { get; set; }
    public string? BannerUrl { get; set; }


    public string FontKey { get; set; } = "system";

    public string? CustomFontUrl { get; set; }
    public string? CustomFontFamily { get; set; }

    public string BrandingJson { get; set; } = "{}";
    public string LayoutJson { get; set; } = "{}";

    public bool IsPublished { get; set; } = false;
    public DateTimeOffset? PublishedAt { get; set; }

    public string OwnerUserId { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public bool IsHidden { get; set; } = false;
    public string? HiddenReason { get; set; }
    public DateTimeOffset? HiddenAt { get; set; }
    public string? HiddenByUserId { get; set; }

    

}
