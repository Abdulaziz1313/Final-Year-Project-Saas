using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;

namespace LearningPlatform.Api.Services;

public class TwilioSmsSender : ISmsSender
{
    private readonly SmsOptions _opt;

    public TwilioSmsSender(SmsOptions opt)
    {
        _opt = opt;
    }

    public async Task SendAsync(string toPhoneE164, string message)
    {
        if (string.IsNullOrWhiteSpace(_opt.AccountSid) ||
            string.IsNullOrWhiteSpace(_opt.AuthToken))
        {
            throw new Exception("Missing Sms config (AccountSid/AuthToken).");
        }

        if (string.IsNullOrWhiteSpace(toPhoneE164))
            throw new Exception("SMS 'to' number is empty.");

        TwilioClient.Init(_opt.AccountSid, _opt.AuthToken);

        // ✅ Prefer Messaging Service (best for international + OTP)
        CreateMessageOptions options = new CreateMessageOptions(new PhoneNumber(toPhoneE164))
        {
            Body = message
        };

        if (!string.IsNullOrWhiteSpace(_opt.MessagingServiceSid))
        {
            options.MessagingServiceSid = _opt.MessagingServiceSid;
        }
        else
        {
            // Fallback to FromPhone only if MessagingServiceSid not configured
            if (string.IsNullOrWhiteSpace(_opt.FromPhone))
                throw new Exception("Missing Sms config: set MessagingServiceSid OR FromPhone.");

            options.From = new PhoneNumber(_opt.FromPhone);
        }

        var msg = await MessageResource.CreateAsync(options);

        // Optional: basic failure detection
        if (msg.ErrorCode != null)
            throw new Exception($"Twilio SMS failed: {msg.ErrorMessage} (code {msg.ErrorCode})");
    }
}
