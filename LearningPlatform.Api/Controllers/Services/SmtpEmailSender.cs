using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace LearningPlatform.Api.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly SmtpOptions _opt;

    public SmtpEmailSender(SmtpOptions opt)
    {
        _opt = opt;
    }

    public async Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_opt.FromName, _opt.FromEmail));
        msg.To.Add(MailboxAddress.Parse(toEmail));
        msg.Subject = subject;

        var builder = new BodyBuilder
        {
            HtmlBody = htmlBody,
            TextBody = StripHtml(htmlBody)
        };
        msg.Body = builder.ToMessageBody();

        using var client = new SmtpClient(new MailKit.ProtocolLogger(Console.OpenStandardOutput()));
        client.Timeout = 15000;

        var secure = _opt.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.Auto;
        await client.ConnectAsync(_opt.Host, _opt.Port, secure);

        if (!string.IsNullOrWhiteSpace(_opt.Username))
            await client.AuthenticateAsync(_opt.Username, _opt.Password);

        await client.SendAsync(msg);
        await client.DisconnectAsync(true);
    }

    private static string StripHtml(string html)
        => html.Replace("<br>", "\n").Replace("<br/>", "\n").Replace("<br />", "\n")
               .Replace("</p>", "\n\n").Replace("<p>", "")
               .Replace("<h1>", "").Replace("</h1>", "\n")
               .Replace("<h2>", "").Replace("</h2>", "\n");
}
