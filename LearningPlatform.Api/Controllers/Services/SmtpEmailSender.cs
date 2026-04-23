using LearningPlatform.Application.Common.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace LearningPlatform.Api.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _opt;

    public SmtpEmailSender(EmailOptions opt)
    {
        _opt = opt;
    }

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_opt.SmtpHost))
            throw new InvalidOperationException("Email:SmtpHost is missing.");

        if (string.IsNullOrWhiteSpace(_opt.FromEmail))
            throw new InvalidOperationException("Email:FromEmail is missing.");

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_opt.FromName, _opt.FromEmail));
        msg.To.Add(MailboxAddress.Parse(to));
        msg.Subject = subject;

        var builder = new BodyBuilder
        {
            HtmlBody = htmlBody,
            TextBody = StripHtml(htmlBody)
        };
        msg.Body = builder.ToMessageBody();

        using var client = new SmtpClient();
        client.Timeout = 15000;

        var secure = SecureSocketOptions.StartTls;

        if (_opt.UseSsl)
            secure = SecureSocketOptions.SslOnConnect;

        await client.ConnectAsync(_opt.SmtpHost, _opt.SmtpPort, secure, cancellationToken);

        if (!string.IsNullOrWhiteSpace(_opt.SmtpUser))
            await client.AuthenticateAsync(_opt.SmtpUser, _opt.SmtpPass, cancellationToken);

        await client.SendAsync(msg, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }

    private static string StripHtml(string html)
        => (html ?? "")
            .Replace("<br>", "\n").Replace("<br/>", "\n").Replace("<br />", "\n")
            .Replace("</p>", "\n\n").Replace("<p>", "")
            .Replace("<h1>", "").Replace("</h1>", "\n")
            .Replace("<h2>", "").Replace("</h2>", "\n");
}