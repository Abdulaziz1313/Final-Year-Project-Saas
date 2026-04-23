// LearningPlatform.Api/Services/CertificatePdfService.cs
// Updated:
//   • Uses academy logo when available
//   • Uses academy name in the certificate header/seal/signature area
//   • Falls back gracefully to academy initial if no logo exists
//   • Keeps the Alef-inspired visual design language

using System.Text;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace LearningPlatform.Api.Services;

public interface ICertificatePdfService
{
    byte[] Generate(
        string certificateNumber,
        string studentName,
        string courseTitle,
        string academyName,
        DateTimeOffset completedAt,
        string? academyLogoPath = null
    );
}

public class CertificatePdfService : ICertificatePdfService
{
    private static string BreakLongText(string? input, int chunk = 18)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        input = input.Trim();

        var sb = new StringBuilder(input.Length + input.Length / chunk);
        int run = 0;

        foreach (var ch in input)
        {
            sb.Append(ch);

            if (char.IsWhiteSpace(ch) || ch is '-' or '_' or '/' or '\\' or '.' or ',' or ':' or ';' or '|')
            {
                run = 0;
                continue;
            }

            if (++run >= chunk)
            {
                sb.Append(' ');
                run = 0;
            }
        }

        return sb.ToString();
    }

    private static string AcademyInitial(string academyName)
    {
        return string.IsNullOrWhiteSpace(academyName)
            ? "A"
            : academyName.Trim().Substring(0, 1).ToUpperInvariant();
    }

    public byte[] Generate(
        string certificateNumber,
        string studentName,
        string courseTitle,
        string academyName,
        DateTimeOffset completedAt,
        string? academyLogoPath = null)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        studentName = string.IsNullOrWhiteSpace(studentName) ? "Student" : studentName.Trim();
        courseTitle = string.IsNullOrWhiteSpace(courseTitle) ? "Course" : courseTitle.Trim();
        academyName = string.IsNullOrWhiteSpace(academyName) ? "Academy" : academyName.Trim();
        certificateNumber = string.IsNullOrWhiteSpace(certificateNumber) ? "CERT-UNKNOWN" : certificateNumber.Trim();

        var safeStudentName = BreakLongText(studentName, 16);
        var safeCourseTitle = BreakLongText(courseTitle, 20);
        var safeAcademyName = BreakLongText(academyName, 18);
        var safeCertificateNumber = BreakLongText(certificateNumber, 14);

        var dateText = completedAt.UtcDateTime.ToString("MMMM dd, yyyy");
        var academyInitial = AcademyInitial(academyName);

        var hasAcademyLogo =
            !string.IsNullOrWhiteSpace(academyLogoPath) &&
            File.Exists(academyLogoPath);

        // ── DESIGN TOKENS ────────────────────────────────────────────────
        var accentBlue = "#1A56DB";
        var accentSky = "#3B82F6";
        var accentLight = "#EFF4FF";
        var gold = "#D97706";
        var goldLight = "#FFFBEB";

        var pageBg = "#FAFBFC";
        var cardBg = "#FFFFFF";
        var surface2 = "#F8F9FB";

        var ink = "#0A0F1E";
        var muted = "#6B7280";
        var muted2 = "#9CA3AF";
        var borderColor = "#E5E7EB";
        var borderStrong = "#D1D5DB";

        var navyDark = "#0A0F1E";
        var navyMid = "#1E3A8A";

        var titleFont =
            courseTitle.Length > 110 ? 13 :
            courseTitle.Length > 80 ? 15 :
            courseTitle.Length > 55 ? 17 :
            19;

        var verifyUrl = "https://alef.app/verify";

        return Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(14);
                page.PageColor(pageBg);
                page.DefaultTextStyle(t => t.FontFamily("DM Sans").FontColor(ink));

                page.Content().Layers(layers =>
                {
                    layers.Layer().Extend().Element(bg =>
                    {
                        bg.Row(r =>
                        {
                            r.RelativeItem().Background("#EFF6FF");
                            r.RelativeItem().Background("#FFF7ED");
                        });
                    });

                    layers.PrimaryLayer().Padding(8).ScaleToFit().Element(host =>
                    {
                        host
                            .Background(cardBg)
                            .Border(1)
                            .BorderColor(borderColor)
                            .Column(card =>
                            {
                                card.Item().Height(6).Row(r =>
                                {
                                    r.RelativeItem(2).Background(accentBlue);
                                    r.RelativeItem(1).Background(accentSky);
                                    r.RelativeItem(1).Background(gold);
                                });

                                // ── HEADER BAND ───────────────────────────────────────
                                card.Item().Background(navyDark).Padding(18).Row(row =>
                                {
                                    row.ConstantItem(54).Height(54).AlignMiddle().Element(mark =>
                                    {
                                        if (hasAcademyLogo)
                                        {
                                            mark
                                                .Background(Colors.White)
                                                .Border(1)
                                                .BorderColor("#30456B")
                                                .Padding(4)
                                                .AlignCenter()
                                                .AlignMiddle()
                                                .Image(academyLogoPath!, ImageScaling.FitArea);
                                        }
                                        else
                                        {
                                            mark
                                                .Background(navyMid)
                                                .Border(1)
                                                .BorderColor("#30456B")
                                                .Padding(10)
                                                .AlignCenter()
                                                .AlignMiddle()
                                                .Text(academyInitial)
                                                .FontFamily("DM Sans")
                                                .Bold()
                                                .FontSize(20)
                                                .FontColor(Colors.White);
                                        }
                                    });

                                    row.Spacing(14);

                                    row.RelativeItem().AlignMiddle().Column(brand =>
                                    {
                                        brand.Item().Text(safeAcademyName)
                                            .FontFamily("Instrument Serif")
                                            .FontSize(22)
                                            .FontColor(Colors.White)
                                            .ClampLines(2);

                                        brand.Item().Text("Learning Academy")
                                            .FontSize(10)
                                            .FontColor("#99AEC8");
                                    });

                                    row.Spacing(24);

                                    row.AutoItem().AlignMiddle().Column(label =>
                                    {
                                        label.Item().Text("CERTIFICATE OF COMPLETION")
                                            .FontSize(9)
                                            .FontColor("#8CA5C0")
                                            .LetterSpacing(2f);

                                        label.Item().PaddingTop(4).Row(r =>
                                        {
                                            r.AutoItem()
                                                .Border(1)
                                                .BorderColor(accentBlue)
                                                .Background(accentLight)
                                                .PaddingHorizontal(10)
                                                .PaddingVertical(5)
                                                .Text("VALID")
                                                .FontSize(11)
                                                .Bold()
                                                .FontColor(accentBlue);
                                        });
                                    });
                                });

                                // ── BODY ─────────────────────────────────────────────
                                card.Item().Padding(22).Column(col =>
                                {
                                    col.Spacing(10);

                                    col.Item().Row(row =>
                                    {
                                        row.RelativeItem().Column(x =>
                                        {
                                            x.Item().Text("CERTIFICATE NO.")
                                                .FontSize(8)
                                                .FontColor(muted2)
                                                .LetterSpacing(1.5f);

                                            x.Item().Text(safeCertificateNumber)
                                                .FontSize(12)
                                                .Bold()
                                                .FontColor(ink)
                                                .ClampLines(1);
                                        });

                                        row.RelativeItem().AlignRight().Column(x =>
                                        {
                                            x.Item().Text("DATE ISSUED")
                                                .FontSize(8)
                                                .FontColor(muted2)
                                                .LetterSpacing(1.5f)
                                                .AlignRight();

                                            x.Item().Text(dateText)
                                                .FontSize(12)
                                                .Bold()
                                                .FontColor(ink)
                                                .ClampLines(1)
                                                .AlignRight();
                                        });
                                    });

                                    col.Item().Height(1).Background(borderColor);

                                    col.Item().PaddingVertical(2).AlignCenter().Column(t =>
                                    {
                                        t.Spacing(5);

                                        t.Item().AlignCenter().Row(r =>
                                        {
                                            r.AutoItem()
                                                .Border(1)
                                                .BorderColor("#BFDBFE")
                                                .Background(accentLight)
                                                .PaddingHorizontal(12)
                                                .PaddingVertical(4)
                                                .Text("This certifies that")
                                                .FontSize(10)
                                                .FontColor(accentBlue);
                                        });

                                        t.Item().AlignCenter().Text(safeStudentName)
                                            .FontFamily("Instrument Serif")
                                            .FontSize(36)
                                            .FontColor(ink)
                                            .ClampLines(2);

                                        t.Item().AlignCenter().Text("has successfully completed")
                                            .FontSize(11)
                                            .FontColor(muted);

                                        t.Item().PaddingTop(2).AlignCenter().Row(r =>
                                        {
                                            r.RelativeItem();

                                            r.AutoItem()
                                                .Border(2)
                                                .BorderColor(accentBlue)
                                                .Background(accentLight)
                                                .PaddingHorizontal(20)
                                                .PaddingVertical(10)
                                                .AlignCenter()
                                                .Text(safeCourseTitle)
                                                .FontFamily("Instrument Serif")
                                                .FontSize(titleFont)
                                                .FontColor(ink)
                                                .LineHeight(1.2f)
                                                .ClampLines(3);

                                            r.RelativeItem();
                                        });

                                        t.Item().AlignCenter().Text($"Offered by {safeAcademyName}")
                                            .FontSize(10)
                                            .FontColor(muted)
                                            .ClampLines(2);
                                    });

                                    col.Item().Height(1).Background(borderColor);

                                    // ── BOTTOM ROW ────────────────────────────────────
                                    col.Item().PaddingTop(4).Row(row =>
                                    {
                                        row.ConstantItem(160).AlignCenter().Element(seal =>
                                        {
                                            seal.Column(s =>
                                            {
                                                s.Spacing(6);

                                                s.Item().AlignCenter()
                                                    .Border(3)
                                                    .BorderColor(gold)
                                                    .Background(goldLight)
                                                    .Padding(14)
                                                    .Column(x =>
                                                    {
                                                        x.Spacing(3);

                                                        x.Item().AlignCenter().Text("OFFICIAL")
                                                            .FontSize(8)
                                                            .LetterSpacing(2f)
                                                            .FontColor(gold)
                                                            .Bold();

                                                        x.Item().AlignCenter()
                                                            .Background(navyDark)
                                                            .PaddingHorizontal(14)
                                                            .PaddingVertical(8)
                                                            .Column(inner =>
                                                            {
                                                                if (hasAcademyLogo)
                                                                {
                                                                    inner.Item().AlignCenter().Height(26)
                                                                        .Image(academyLogoPath!, ImageScaling.FitHeight);
                                                                }
                                                                else
                                                                {
                                                                    inner.Item().AlignCenter().Text(academyInitial)
                                                                        .FontFamily("DM Sans")
                                                                        .Bold()
                                                                        .FontSize(18)
                                                                        .FontColor(Colors.White);
                                                                }

                                                                inner.Item().AlignCenter().Text(safeAcademyName)
                                                                    .FontSize(7)
                                                                    .LetterSpacing(1.3f)
                                                                    .FontColor("#B3C4D4")
                                                                    .ClampLines(2);
                                                            });

                                                        x.Item().AlignCenter().Text("CERTIFIED")
                                                            .FontSize(8)
                                                            .LetterSpacing(2f)
                                                            .FontColor(gold)
                                                            .Bold();
                                                    });

                                                s.Item().AlignCenter().Text("Verified certificate")
                                                    .FontSize(8)
                                                    .FontColor(muted2)
                                                    .ClampLines(1);
                                            });
                                        });

                                        row.Spacing(20);

                                        row.RelativeItem().Column(right =>
                                        {
                                            right.Spacing(10);

                                            right.Item().Row(r =>
                                            {
                                                r.RelativeItem().Column(x =>
                                                {
                                                    x.Spacing(5);
                                                    x.Item().Text("ACADEMY REPRESENTATIVE")
                                                        .FontSize(8)
                                                        .FontColor(muted2)
                                                        .LetterSpacing(1f);

                                                    x.Item().Height(1).Background(borderStrong);

                                                    x.Item().Text(safeAcademyName)
                                                        .FontSize(11)
                                                        .Bold()
                                                        .FontColor(ink)
                                                        .ClampLines(2);
                                                });

                                                r.Spacing(20);

                                                r.RelativeItem().Column(x =>
                                                {
                                                    x.Spacing(5);
                                                    x.Item().Text("PLATFORM AUTHORITY")
                                                        .FontSize(8)
                                                        .FontColor(muted2)
                                                        .LetterSpacing(1f);

                                                    x.Item().Height(1).Background(borderStrong);

                                                    x.Item().Text("Alef Learning Commerce")
                                                        .FontSize(11)
                                                        .Bold()
                                                        .FontColor(ink)
                                                        .ClampLines(1);
                                                });
                                            });

                                            right.Item()
                                                .Border(1)
                                                .BorderColor(borderColor)
                                                .Background(surface2)
                                                .Padding(12)
                                                .Column(x =>
                                                {
                                                    x.Spacing(5);

                                                    x.Item().Row(rr =>
                                                    {
                                                        rr.RelativeItem().Column(left =>
                                                        {
                                                            left.Spacing(3);

                                                            left.Item().Text("VERIFY THIS CERTIFICATE")
                                                                .FontSize(8)
                                                                .FontColor(muted2)
                                                                .LetterSpacing(1.2f);

                                                            left.Item().Text(verifyUrl)
                                                                .FontSize(9)
                                                                .FontColor(accentBlue)
                                                                .ClampLines(1);

                                                            left.Item().Text($"Certificate No: {safeCertificateNumber}")
                                                                .FontSize(9)
                                                                .FontColor(muted)
                                                                .ClampLines(2);
                                                        });

                                                        rr.AutoItem().AlignMiddle()
                                                            .Border(1)
                                                            .BorderColor("#BBF7D0")
                                                            .Background("#DCFCE7")
                                                            .PaddingHorizontal(10)
                                                            .PaddingVertical(6)
                                                            .Column(s =>
                                                            {
                                                                s.Item().AlignCenter().Text("VALID")
                                                                    .FontSize(11)
                                                                    .Bold()
                                                                    .FontColor("#15803D");
                                                            });
                                                    });

                                                    x.Item().Height(1).Background(borderColor);

                                                    x.Item().Text("Visit the URL and enter the certificate number to verify authenticity.")
                                                        .FontSize(8)
                                                        .FontColor(muted2)
                                                        .ClampLines(2);
                                                });
                                        });
                                    });
                                });

                                card.Item().Height(6).Row(r =>
                                {
                                    r.RelativeItem(1).Background(gold);
                                    r.RelativeItem(1).Background(accentSky);
                                    r.RelativeItem(2).Background(accentBlue);
                                });
                            });
                    });
                });

                page.Footer().AlignCenter().PaddingTop(4)
                    .Text($"© {academyName} · Powered by Alef")
                    .FontSize(8)
                    .FontColor(muted2);
            });
        }).GeneratePdf();
    }
}