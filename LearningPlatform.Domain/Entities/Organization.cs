using System;
using System.Collections.Generic;

namespace LearningPlatform.Domain.Entities;

public class Organization
{
    public Guid Id { get; set; }

    public string Name { get; set; } = default!;
    public string Slug { get; set; } = default!;

    public string? Website { get; set; }
    public string PrimaryColor { get; set; } = "#7c3aed";

    public string? Description { get; set; }
    public string? LogoUrl { get; set; }

    public string InviteCode { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // ✅ NEW: allow admin to disable org
    public bool IsActive { get; set; } = true;

    // ✅ nav
    public List<Academy> Academies { get; set; } = new();
}