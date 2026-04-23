namespace LearningPlatform.Api.Services;

public class EmailOptions
{
    public string Provider { get; set; } = "Brevo";

    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "Alef";

    public string SmtpHost { get; set; } = "smtp-relay.brevo.com";
    public int SmtpPort { get; set; } = 587;

    public string SmtpUser { get; set; } = "";
    public string SmtpPass { get; set; } = "";

    // For Brevo on port 587 (STARTTLS), keep this false; we will use StartTls.
    public bool UseSsl { get; set; } = false;
}