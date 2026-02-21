namespace LearningPlatform.Api.Services;

public class SmsOptions
{
    public string? AccountSid { get; set; }
    public string? AuthToken { get; set; }

    // Fallback sender (may work for some countries)
    public string? FromPhone { get; set; }

    // ✅ Preferred for international sending / OTP routing
    public string? MessagingServiceSid { get; set; }

    // ✅ Keeps existing AuthController code compiling
    // If true, allow dev fallback behavior (whatever your controller does)
    public bool EnableDevFallback { get; set; } = false;
}
