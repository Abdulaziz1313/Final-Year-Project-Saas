// LearningPlatform.Api/Services/CertificatePdfService.cs
// Redesigned to match the Alef home page design system:
//   • Instrument Serif display + DM Sans body typography hierarchy
//   • Dark navy gradient header band (home logo-mark feel)
//   • Blue/sky gradient accent bars (home feat-card style)
//   • Gold radial glow detail on the seal
//   • Elevated card-in-card layout matching home hero-card
//   • Consistent shadow/border tokens throughout

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
        DateTimeOffset completedAt
    );
}

public class CertificatePdfService : ICertificatePdfService
{
    // Inserts soft break opportunities into unbreakable tokens/URLs.
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
            { run = 0; continue; }
            if (++run >= chunk) { sb.Append(' '); run = 0; }
        }
        return sb.ToString();
    }

    public byte[] Generate(
        string certificateNumber,
        string studentName,
        string courseTitle,
        string academyName,
        DateTimeOffset completedAt)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        studentName       = string.IsNullOrWhiteSpace(studentName)       ? "Student"     : studentName.Trim();
        courseTitle       = string.IsNullOrWhiteSpace(courseTitle)        ? "Course"      : courseTitle.Trim();
        academyName       = string.IsNullOrWhiteSpace(academyName)        ? "Alef"        : academyName.Trim();
        certificateNumber = string.IsNullOrWhiteSpace(certificateNumber)  ? "ALF-UNKNOWN" : certificateNumber.Trim();

        var safeStudentName       = BreakLongText(studentName,       16);
        var safeCourseTitle       = BreakLongText(courseTitle,       20);
        var safeAcademyName       = BreakLongText(academyName,       18);
        var safeCertificateNumber = BreakLongText(certificateNumber, 14);

        var dateText = completedAt.UtcDateTime.ToString("MMMM dd, yyyy");

        // ── DESIGN TOKENS (home-aligned) ────────────────────────────────
        //  Accent
        var accentBlue   = "#1A56DB";   // --accent
        var accentSky    = "#3B82F6";   // lighter blue for gradients
        var accentLight  = "#EFF4FF";   // --accent-light
        var gold         = "#D97706";   // --gold
        var goldLight    = "#FFFBEB";   // --gold-light

        //  Surfaces
        var pageBg       = "#FAFBFC";   // home background
        var cardBg       = "#FFFFFF";   // --surface
        var surface2     = "#F8F9FB";   // --surface-2


        //  Text
        var ink          = "#0A0F1E";   // --text
        var muted        = "#6B7280";   // --muted
        var muted2       = "#9CA3AF";   // --muted-2
        var borderColor  = "#E5E7EB";   // ~rgba(10,15,30,0.10) on white
        var borderStrong = "#D1D5DB";   // ~rgba(10,15,30,0.16) on white

        //  Navy gradient for header band (home logo-mark feel)
        var navyDark     = "#0A0F1E";   // --text used as brand dark
        var navyMid      = "#1E3A8A";   // home logo-mark gradient end

        //  Dynamic title font size
        var titleFont =
            courseTitle.Length > 110 ? 13 :
            courseTitle.Length > 80  ? 15 :
            courseTitle.Length > 55  ? 17 :
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
                    // ── BACKGROUND: subtle radial tints (home-bg feel) ──────────
                    layers.Layer().Extend().Element(bg =>
                    {
                        // Blue tint top-left, gold tint top-right — mirrors home
                        bg.Row(r =>
                        {
                            r.RelativeItem().Background("#EFF6FF"); // blue-50 tint
                            r.RelativeItem().Background("#FFF7ED"); // amber-50 tint
                        });
                    });

                    // ── FOREGROUND CARD ─────────────────────────────────────────
                    layers.PrimaryLayer().Padding(8).ScaleToFit().Element(host =>
                    {
                        host
                            .Background(cardBg)
                            .Border(1)
                            .BorderColor(borderColor)
                            .Column(card =>
                            {
                                // ── TOP ACCENT BAR: blue→sky gradient (home feat-card) ──
                                card.Item().Height(6).Row(r =>
                                {
                                    r.RelativeItem(2).Background(accentBlue);
                                    r.RelativeItem(1).Background(accentSky);
                                    r.RelativeItem(1).Background(gold);
                                });

                                // ── HEADER BAND: dark navy (home logo-mark) ─────────────
                                card.Item().Background(navyDark).Padding(18).Row(row =>
                                {
                                    // Logo mark — dark navy + Instrument Serif (exact home style)
                                    row.ConstantItem(52).AlignMiddle().Element(mark =>
                                    {
                                        mark
                                            .Background(navyMid)
                                            .Border(1)
                                            .BorderColor("#1E3A8A")
                                            .Padding(10)
                                            .AlignCenter()
                                            .Text("الف")
                                            .FontFamily("Instrument Serif")
                                            .Italic()
                                            .FontSize(18)
                                            .FontColor(Colors.White);
                                    });

                                    row.Spacing(14);

                                    // Brand name + platform label
                                    row.RelativeItem().AlignMiddle().Column(brand =>
                                    {
                                        brand.Item().Text("Alef")
                                            .FontFamily("Instrument Serif")
                                            .FontSize(22)
                                            .FontColor(Colors.White);

                                        brand.Item().Text("Learning Commerce")
                                            .FontSize(10)
                                            .FontColor("#99AEC8"); // white @60% on navy
                                    });

                                    row.Spacing(24);

                                    // Certificate label — right-aligned pill treatment
                                    row.AutoItem().AlignMiddle().Column(label =>
                                    {
                                        label.Item().Text("CERTIFICATE OF COMPLETION")
                                            .FontSize(9)
                                            .FontColor("#8CA5C0") // white @55% on navy
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

                                // ── BODY ────────────────────────────────────────────────
                                card.Item().Padding(22).Column(col =>
                                {
                                    col.Spacing(10);

                                    // ── META ROW: cert no + date ────────────────────────
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

                                    // Divider
                                    col.Item().Height(1).Background(borderColor);

                                    // ── CENTRE: eyebrow + display title ────────────────
                                    col.Item().PaddingVertical(2).AlignCenter().Column(t =>
                                    {
                                        t.Spacing(5);

                                        // Eyebrow (home hero-eyebrow style)
                                        t.Item().AlignCenter().Row(r =>
                                        {
                                            r.AutoItem()
                                                .Border(1)
                                                .BorderColor("#BFDBFE") // blue-200
                                                .Background(accentLight)
                                                .PaddingHorizontal(12)
                                                .PaddingVertical(4)
                                                .Text("This certifies that")
                                                .FontSize(10)
                                                .FontColor(accentBlue);
                                        });

                                        // Student name — Instrument Serif display (home hero-title feel)
                                        t.Item().AlignCenter().Text(safeStudentName)
                                            .FontFamily("Instrument Serif")
                                            .FontSize(36)
                                            .FontColor(ink)
                                            .ClampLines(2);

                                        // Subline
                                        t.Item().AlignCenter().Text("has successfully completed")
                                            .FontSize(11)
                                            .FontColor(muted);

                                        // Course title card (home hero-card inner stat feel)
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

                                    // Divider
                                    col.Item().Height(1).Background(borderColor);

                                    // ── BOTTOM ROW: seal + signatures + verification ─────
                                    col.Item().PaddingTop(4).Row(row =>
                                    {
                                        // Seal block — gold border with radial glow feel
                                        row.ConstantItem(160).AlignCenter().Element(seal =>
                                        {
                                            seal.Column(s =>
                                            {
                                                s.Spacing(6);

                                                // Outer gold ring
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

                                                        // Inner navy mark (logo-mark inside seal)
                                                        x.Item().AlignCenter()
                                                            .Background(navyDark)
                                                            .PaddingHorizontal(14)
                                                            .PaddingVertical(6)
                                                            .Column(inner =>
                                                            {
                                                                inner.Item().AlignCenter().Text("الف")
                                                                    .FontFamily("Instrument Serif")
                                                                    .Italic()
                                                                    .FontSize(20)
                                                                    .FontColor(Colors.White);

                                                                inner.Item().AlignCenter().Text("ALEF")
                                                                    .FontSize(8)
                                                                    .LetterSpacing(2f)
                                                                    .FontColor("#B3C4D4"); // white @70% on navy
                                                            });

                                                        x.Item().AlignCenter().Text("CERTIFIED")
                                                            .FontSize(8)
                                                            .LetterSpacing(2f)
                                                            .FontColor(gold)
                                                            .Bold();
                                                    });

                                                s.Item().AlignCenter().Text("Verified by Alef Platform")
                                                    .FontSize(8)
                                                    .FontColor(muted2)
                                                    .ClampLines(1);
                                            });
                                        });

                                        row.Spacing(20);

                                        // Signatures + verification card
                                        row.RelativeItem().Column(right =>
                                        {
                                            right.Spacing(10);

                                            // Signature lines
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

                                            // Verification card — home hcs-item style
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

                                                            left.Item().Text($"{verifyUrl}")
                                                                .FontSize(9)
                                                                .FontColor(accentBlue)
                                                                .ClampLines(1);

                                                            left.Item().Text($"Certificate No: {safeCertificateNumber}")
                                                                .FontSize(9)
                                                                .FontColor(muted)
                                                                .ClampLines(2);
                                                        });

                                                        // Status pill (home hcc-status live style)
                                                        rr.AutoItem().AlignMiddle()
                                                            .Border(1)
                                                            .BorderColor("#BBF7D0") // green-200
                                                            .Background("#DCFCE7") // green-100
                                                            .PaddingHorizontal(10)
                                                            .PaddingVertical(6)
                                                            .Column(s =>
                                                            {
                                                                s.Item().AlignCenter().Text("VALID")
                                                                    .FontSize(11)
                                                                    .Bold()
                                                                    .FontColor("#15803D"); // green-700
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

                                // ── BOTTOM ACCENT BAR: reversed gold→sky (mirroring top) ──
                                card.Item().Height(6).Row(r =>
                                {
                                    r.RelativeItem(1).Background(gold);
                                    r.RelativeItem(1).Background(accentSky);
                                    r.RelativeItem(2).Background(accentBlue);
                                });
                            });
                    });
                });

                // Footer outside the card
                page.Footer().AlignCenter().PaddingTop(4)
                    .Text("© Alef (الف) Learning Commerce · alef.app")
                    .FontSize(8)
                    .FontColor(muted2);
            });
        }).GeneratePdf();
    }
}