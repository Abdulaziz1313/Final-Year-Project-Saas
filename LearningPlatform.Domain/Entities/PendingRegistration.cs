namespace LearningPlatform.Domain.Entities;

public class PendingRegistration
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty; // hashed password (Identity hasher)
    public string Role { get; set; } = "Student";
    public string? Phone { get; set; }


    public string CodeHash { get; set; } = string.Empty;     // hash of OTP
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; } = 0;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastSentAt { get; set; }
}
