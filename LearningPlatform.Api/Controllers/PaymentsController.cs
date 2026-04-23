using System.Security.Claims;
using LearningPlatform.Api.Services;
using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace LearningPlatform.Api.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly StripeOptions _stripeOptions;

    public PaymentsController(AppDbContext db, IConfiguration config, StripeOptions stripeOptions)
    {
        _db = db;
        _config = config;
        _stripeOptions = stripeOptions;
    }

    public record CreateCheckoutSessionRequest(Guid CourseId);
    public record RequestPayoutNowRequest(Guid AcademyId, string? Note);
    public record ReleaseWeeklyPayoutsRequest(Guid AcademyId);
    public record MarkPayoutPaidRequest(string? Note);
    public record UpdatePayoutSettingsRequest(
        decimal PlatformFeePercent,
        decimal OrganizationFeePercent,
        decimal InstructorFeePercent,
        bool WeeklyAutoReleaseEnabled,
        int WeeklyReleaseDay,
        string? Currency
    );

    private string? CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ??
        User.FindFirstValue("sub");

    private bool IsAdmin() => User.IsInRole("Admin");

    private async Task<bool> CanInstructorAccessAcademyAsync(Guid academyId, string userId)
    {
        if (IsAdmin()) return true;

        if (!User.IsInRole("Instructor"))
            return false;

        var claimAcademyId = User.FindFirstValue("academyId");
        if (!string.IsNullOrWhiteSpace(claimAcademyId) &&
            Guid.TryParse(claimAcademyId, out var parsedClaimAcademyId))
        {
            return parsedClaimAcademyId == academyId;
        }

        var user = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.AcademyId })
            .FirstOrDefaultAsync();

        return user?.AcademyId == academyId;
    }

    private async Task<bool> CanOrgAccessAcademyAsync(Guid academyId, string userId)
    {
        if (IsAdmin()) return true;

        if (!User.IsInRole("OrgAdmin"))
            return false;

        var claimOrgId = User.FindFirstValue("organizationId");
        Guid? userOrgId = null;

        if (!string.IsNullOrWhiteSpace(claimOrgId) && Guid.TryParse(claimOrgId, out var parsedOrgId))
            userOrgId = parsedOrgId;
        else
            userOrgId = await _db.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.OrganizationId)
                .FirstOrDefaultAsync();

        if (!userOrgId.HasValue)
            return false;

        var academyOrgId = await _db.Academies
            .AsNoTracking()
            .Where(a => a.Id == academyId)
            .Select(a => a.OrganizationId)
            .FirstOrDefaultAsync();

        return academyOrgId == userOrgId.Value;
    }

    private async Task<AcademyPayoutSettings> GetOrCreatePayoutSettingsAsync(Guid academyId)
    {
        var settings = await _db.AcademyPayoutSettings
            .FirstOrDefaultAsync(x => x.AcademyId == academyId);

        if (settings != null)
            return settings;

        settings = new AcademyPayoutSettings
        {
            Id = Guid.NewGuid(),
            AcademyId = academyId,
            PlatformFeePercent = 10m,
            OrganizationFeePercent = 20m,
            InstructorFeePercent = 70m,
            WeeklyAutoReleaseEnabled = true,
            WeeklyReleaseDay = DayOfWeek.Friday,
            Currency = "EUR",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.AcademyPayoutSettings.Add(settings);
        await _db.SaveChangesAsync();
        return settings;
    }

    private static (decimal platformAmount, decimal organizationAmount, decimal instructorAmount) CalculateSplit(
        decimal grossAmount,
        AcademyPayoutSettings settings)
    {
        var platformAmount = Math.Round(grossAmount * (settings.PlatformFeePercent / 100m), 2, MidpointRounding.AwayFromZero);
        var organizationAmount = Math.Round(grossAmount * (settings.OrganizationFeePercent / 100m), 2, MidpointRounding.AwayFromZero);
        var instructorAmount = Math.Round(grossAmount - platformAmount - organizationAmount, 2, MidpointRounding.AwayFromZero);

        if (instructorAmount < 0m)
            instructorAmount = 0m;

        return (platformAmount, organizationAmount, instructorAmount);
    }

    [HttpPost("checkout-session")]
    [Authorize(Roles = "Student")]
    public async Task<IActionResult> CreateCheckoutSession([FromBody] CreateCheckoutSessionRequest req)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(_stripeOptions.SecretKey))
            return StatusCode(500, "Stripe SecretKey is not configured in the API.");

        var course = await _db.Courses
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == req.CourseId);

        if (course == null)
            return NotFound("Course not found.");

        if (course.Status != CourseStatus.Published || course.IsHidden)
            return BadRequest("This course is not available for purchase.");

        if (course.IsFree || course.Price is null || course.Price <= 0)
            return BadRequest("This course is free and does not require checkout.");

        var alreadyEnrolled = await _db.Enrollments
            .AsNoTracking()
            .AnyAsync(e => e.CourseId == req.CourseId && e.StudentUserId == userId);

        if (alreadyEnrolled)
            return BadRequest("You are already enrolled in this course.");

        var frontendBase = (_config["Frontend:BaseUrl"] ?? "http://localhost:4201/#").TrimEnd('/');

        var currency = string.IsNullOrWhiteSpace(course.Currency)
            ? (_stripeOptions.Currency ?? "EUR")
            : course.Currency;

        var amountMinor = (long)Math.Round(course.Price.Value * 100m, MidpointRounding.AwayFromZero);

        var existingPending = await _db.Payments
            .Where(p =>
                p.CourseId == req.CourseId &&
                p.UserId == userId &&
                p.Status == PaymentStatus.Pending)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();

        if (existingPending != null)
        {
            var existingSessionService = new SessionService();
            try
            {
                var existingSession = await existingSessionService.GetAsync(existingPending.CheckoutSessionId);
                if (existingSession != null &&
                    !string.IsNullOrWhiteSpace(existingSession.Url) &&
                    existingSession.PaymentStatus != "paid" &&
                    existingSession.Status != "expired")
                {
                    return Ok(new
                    {
                        url = existingSession.Url,
                        sessionId = existingSession.Id,
                        publishableKey = _stripeOptions.PublishableKey
                    });
                }
            }
            catch
            {
            }
        }

        var options = new SessionCreateOptions
        {
            Mode = "payment",
            SuccessUrl = $"{frontendBase}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = $"{frontendBase}/checkout/cancel?courseId={course.Id}",
            ClientReferenceId = userId,
            LineItems = new List<SessionLineItemOptions>
            {
                new()
                {
                    Quantity = 1,
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency = currency.ToLowerInvariant(),
                        UnitAmount = amountMinor,
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = course.Title
                        }
                    }
                }
            },
            Metadata = new Dictionary<string, string>
            {
                ["courseId"] = course.Id.ToString(),
                ["userId"] = userId
            }
        };

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (!string.IsNullOrWhiteSpace(user?.Email))
            options.CustomerEmail = user.Email;

        var sessionService = new SessionService();
        var session = await sessionService.CreateAsync(options);

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            CourseId = course.Id,
            UserId = userId,
            Provider = "Stripe",
            Status = PaymentStatus.Pending,
            CheckoutSessionId = session.Id,
            Amount = course.Price.Value,
            Currency = currency.ToUpperInvariant(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            url = session.Url,
            sessionId = session.Id,
            publishableKey = _stripeOptions.PublishableKey
        });
    }

    [HttpGet("session/{sessionId}")]
    [Authorize(Roles = "Student")]
    public async Task<IActionResult> GetSessionStatus(string sessionId)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var payment = await _db.Payments
            .Include(p => p.Course)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.CheckoutSessionId == sessionId && p.UserId == userId);

        if (payment == null)
            return NotFound();

        return Ok(new
        {
            payment.Id,
            status = payment.Status.ToString(),
            payment.Amount,
            payment.Currency,
            payment.CourseId,
            courseTitle = payment.Course.Title,
            payment.PaidAt
        });
    }

    [HttpGet("my")]
    [Authorize(Roles = "Student")]
    public async Task<IActionResult> MyPurchases(
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        IQueryable<Payment> query = _db.Payments
            .AsNoTracking()
            .Include(p => p.Course)
            .Where(p => p.UserId == userId);

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<PaymentStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(p => p.Status == parsedStatus);
        }

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(p => p.PaidAt ?? p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new
            {
                p.Id,
                status = p.Status.ToString(),
                p.Amount,
                p.Currency,
                p.Provider,
                p.PaymentMethodType,
                p.CreatedAt,
                p.PaidAt,
                p.FailureReason,
                course = new
                {
                    p.CourseId,
                    p.Course.Title,
                    p.Course.ThumbnailUrl,
                    p.Course.Category,
                    p.Course.IsHidden
                }
            })
            .ToListAsync();

        var paidTotal = await _db.Payments
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.Status == PaymentStatus.Paid)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m;

        var successfulCount = await _db.Payments
            .AsNoTracking()
            .CountAsync(p => p.UserId == userId && p.Status == PaymentStatus.Paid);

        return Ok(new
        {
            total,
            page,
            pageSize,
            successfulCount,
            paidTotal,
            items
        });
    }

    [HttpGet("my/{paymentId:guid}")]
    [Authorize(Roles = "Student")]
    public async Task<IActionResult> MyPurchaseDetail(Guid paymentId)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var payment = await _db.Payments
            .AsNoTracking()
            .Include(p => p.Course)
            .FirstOrDefaultAsync(p => p.Id == paymentId && p.UserId == userId);

        if (payment == null)
            return NotFound();

        return Ok(new
        {
            payment.Id,
            status = payment.Status.ToString(),
            payment.Amount,
            payment.Currency,
            payment.Provider,
            payment.PaymentMethodType,
            payment.ProviderReference,
            payment.PaymentIntentId,
            payment.CheckoutSessionId,
            payment.CreatedAt,
            payment.UpdatedAt,
            payment.PaidAt,
            payment.FailureReason,
            course = new
            {
                payment.CourseId,
                payment.Course.Title,
                payment.Course.ShortDescription,
                payment.Course.ThumbnailUrl,
                payment.Course.Category
            }
        });
    }

    [HttpGet("instructor/academy/{academyId:guid}/summary")]
    [Authorize(Roles = "Instructor,Admin")]
    public async Task<IActionResult> InstructorAcademySummary(
        Guid academyId,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanInstructorAccessAcademyAsync(academyId, userId))
            return Forbid();

        IQueryable<Payment> payments = _db.Payments
            .AsNoTracking()
            .Include(p => p.Course)
            .Where(p => p.Course.AcademyId == academyId);

        if (from.HasValue)
            payments = payments.Where(p => (p.PaidAt ?? p.CreatedAt) >= from.Value);

        if (to.HasValue)
            payments = payments.Where(p => (p.PaidAt ?? p.CreatedAt) <= to.Value);

        var paidPayments = payments.Where(p => p.Status == PaymentStatus.Paid);

        var totalRevenue = await paidPayments.SumAsync(p => (decimal?)p.Amount) ?? 0m;
        var totalSales = await paidPayments.CountAsync();
        var totalCustomers = await paidPayments.Select(p => p.UserId).Distinct().CountAsync();

        var pendingCount = await payments.CountAsync(p => p.Status == PaymentStatus.Pending);
        var failedCount = await payments.CountAsync(p => p.Status == PaymentStatus.Failed);
        var cancelledCount = await payments.CountAsync(p => p.Status == PaymentStatus.Cancelled);

        var topCourses = await paidPayments
            .GroupBy(p => new { p.CourseId, p.Course.Title })
            .Select(g => new
            {
                courseId = g.Key.CourseId,
                title = g.Key.Title,
                salesCount = g.Count(),
                revenue = g.Sum(x => x.Amount)
            })
            .OrderByDescending(x => x.revenue)
            .ThenByDescending(x => x.salesCount)
            .Take(10)
            .ToListAsync();

        var dailyRevenue = await paidPayments
            .GroupBy(p => (p.PaidAt ?? p.CreatedAt).Date)
            .Select(g => new
            {
                date = g.Key,
                revenue = g.Sum(x => x.Amount),
                salesCount = g.Count()
            })
            .OrderBy(x => x.date)
            .ToListAsync();

        return Ok(new
        {
            academyId,
            from,
            to,
            totalRevenue,
            totalSales,
            totalCustomers,
            pendingCount,
            failedCount,
            cancelledCount,
            topCourses,
            dailyRevenue
        });
    }

    [HttpGet("instructor/academy/{academyId:guid}/sales")]
    [Authorize(Roles = "Instructor,Admin")]
    public async Task<IActionResult> InstructorAcademySales(
        Guid academyId,
        [FromQuery] string? status = null,
        [FromQuery] Guid? courseId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanInstructorAccessAcademyAsync(academyId, userId))
            return Forbid();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        IQueryable<Payment> query = _db.Payments
            .AsNoTracking()
            .Include(p => p.Course)
            .Where(p => p.Course.AcademyId == academyId);

        if (courseId.HasValue)
            query = query.Where(p => p.CourseId == courseId.Value);

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<PaymentStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(p => p.Status == parsedStatus);
        }

        var total = await query.CountAsync();

        var itemsRaw = await query
            .OrderByDescending(p => p.PaidAt ?? p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new
            {
                p.Id,
                p.UserId,
                status = p.Status.ToString(),
                p.Amount,
                p.Currency,
                p.Provider,
                p.PaymentMethodType,
                p.CreatedAt,
                p.PaidAt,
                p.FailureReason,
                course = new
                {
                    p.CourseId,
                    p.Course.Title,
                    p.Course.ThumbnailUrl
                }
            })
            .ToListAsync();

        var userIds = itemsRaw.Select(x => x.UserId).Distinct().ToList();

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.ProfileImageUrl
            })
            .ToListAsync();

        var items = itemsRaw.Select(p =>
        {
            var u = users.FirstOrDefault(x => x.Id == p.UserId);
            return new
            {
                p.Id,
                p.status,
                p.Amount,
                p.Currency,
                p.Provider,
                p.PaymentMethodType,
                p.CreatedAt,
                p.PaidAt,
                p.FailureReason,
                buyer = new
                {
                    id = p.UserId,
                    email = u?.Email,
                    displayName = u?.DisplayName,
                    profileImageUrl = u?.ProfileImageUrl
                },
                p.course
            };
        });

        return Ok(new
        {
            academyId,
            total,
            page,
            pageSize,
            items
        });
    }

    [HttpGet("instructor/course/{courseId:guid}/sales")]
    [Authorize(Roles = "Instructor,Admin")]
    public async Task<IActionResult> InstructorCourseSales(
        Guid courseId,
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var course = await _db.Courses
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == courseId);

        if (course == null)
            return NotFound("Course not found.");

        if (!await CanInstructorAccessAcademyAsync(course.AcademyId, userId))
            return Forbid();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        IQueryable<Payment> query = _db.Payments
            .AsNoTracking()
            .Include(p => p.Course)
            .Where(p => p.CourseId == courseId);

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<PaymentStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(p => p.Status == parsedStatus);
        }

        var total = await query.CountAsync();
        var totalRevenue = await query
            .Where(p => p.Status == PaymentStatus.Paid)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m;

        var rawItems = await query
            .OrderByDescending(p => p.PaidAt ?? p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new
            {
                p.Id,
                p.UserId,
                status = p.Status.ToString(),
                p.Amount,
                p.Currency,
                p.Provider,
                p.PaymentMethodType,
                p.CreatedAt,
                p.PaidAt,
                p.FailureReason
            })
            .ToListAsync();

        var buyerIds = rawItems.Select(x => x.UserId).Distinct().ToList();

        var buyers = await _db.Users
            .AsNoTracking()
            .Where(u => buyerIds.Contains(u.Id))
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.ProfileImageUrl
            })
            .ToListAsync();

        var items = rawItems.Select(x =>
        {
            var u = buyers.FirstOrDefault(b => b.Id == x.UserId);
            return new
            {
                x.Id,
                x.status,
                x.Amount,
                x.Currency,
                x.Provider,
                x.PaymentMethodType,
                x.CreatedAt,
                x.PaidAt,
                x.FailureReason,
                buyer = new
                {
                    id = x.UserId,
                    email = u?.Email,
                    displayName = u?.DisplayName,
                    profileImageUrl = u?.ProfileImageUrl
                }
            };
        });

        return Ok(new
        {
            course = new
            {
                course.Id,
                course.Title,
                course.AcademyId
            },
            total,
            page,
            pageSize,
            totalRevenue,
            items
        });
    }

    [HttpGet("instructor/me/earnings")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> InstructorMyEarnings(
        [FromQuery] Guid? academyId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        IQueryable<InstructorEarning> query = _db.InstructorEarnings
            .AsNoTracking()
            .Include(x => x.Course)
            .Where(x => x.InstructorUserId == userId);

        if (academyId.HasValue)
            query = query.Where(x => x.AcademyId == academyId.Value);

        var total = await query.CountAsync();
        var available = await query
            .Where(x => !x.IsReleasedForPayout && !x.IsPaidOut)
            .SumAsync(x => (decimal?)x.InstructorAmount) ?? 0m;
        var paidOut = await query
            .Where(x => x.IsPaidOut)
            .SumAsync(x => (decimal?)x.InstructorAmount) ?? 0m;
        var processing = await query
            .Where(x => x.IsReleasedForPayout && !x.IsPaidOut)
            .SumAsync(x => (decimal?)x.InstructorAmount) ?? 0m;

        var items = await query
            .OrderByDescending(x => x.EarnedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.PaymentId,
                x.CourseId,
                x.AcademyId,
                x.GrossAmount,
                x.PlatformAmount,
                x.OrganizationAmount,
                x.InstructorAmount,
                x.Currency,
                x.IsReleasedForPayout,
                x.IsPaidOut,
                x.EarnedAt,
                x.ReleasedAt,
                x.PaidOutAt,
                courseTitle = x.Course.Title
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            page,
            pageSize,
            available,
            processing,
            paidOut,
            items
        });
    }

    [HttpPost("instructor/me/request-now")]
    [Authorize(Roles = "Instructor")]
    public async Task<IActionResult> RequestPayoutNow([FromBody] RequestPayoutNowRequest req)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanInstructorAccessAcademyAsync(req.AcademyId, userId))
            return Forbid();

        var availableEarnings = await _db.InstructorEarnings
            .Where(x =>
                x.AcademyId == req.AcademyId &&
                x.InstructorUserId == userId &&
                !x.IsReleasedForPayout &&
                !x.IsPaidOut)
            .OrderBy(x => x.EarnedAt)
            .ToListAsync();

        if (availableEarnings.Count == 0)
            return BadRequest("No available earnings for payout.");

        var existingOpenRequest = await _db.InstructorPayoutRequests
            .AsNoTracking()
            .AnyAsync(x =>
                x.AcademyId == req.AcademyId &&
                x.InstructorUserId == userId &&
                (x.Status == "Requested" || x.Status == "Approved" || x.Status == "Processing"));

        if (existingOpenRequest)
            return BadRequest("You already have an open payout request.");

        var totalAmount = availableEarnings.Sum(x => x.InstructorAmount);
        var currency = availableEarnings.First().Currency;

        var request = new InstructorPayoutRequest
        {
            Id = Guid.NewGuid(),
            AcademyId = req.AcademyId,
            InstructorUserId = userId,
            RequestedAmount = totalAmount,
            Currency = currency,
            Status = "Requested",
            MessageToInstructor = "Your payout request was received and will be released within 1-2 hours.",
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.InstructorPayoutRequests.Add(request);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            request.Id,
            request.Status,
            request.RequestedAmount,
            request.Currency,
            message = request.MessageToInstructor
        });
    }

    [HttpGet("org/academy/{academyId:guid}/payout-settings")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> GetPayoutSettings(Guid academyId)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanOrgAccessAcademyAsync(academyId, userId))
            return Forbid();

        var settings = await GetOrCreatePayoutSettingsAsync(academyId);

        return Ok(new
        {
            settings.Id,
            settings.AcademyId,
            settings.PlatformFeePercent,
            settings.OrganizationFeePercent,
            settings.InstructorFeePercent,
            settings.WeeklyAutoReleaseEnabled,
            weeklyReleaseDay = (int)settings.WeeklyReleaseDay,
            settings.Currency
        });
    }

    [HttpPut("org/academy/{academyId:guid}/payout-settings")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> UpdatePayoutSettings(Guid academyId, [FromBody] UpdatePayoutSettingsRequest req)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanOrgAccessAcademyAsync(academyId, userId))
            return Forbid();

        var totalPercent = req.PlatformFeePercent + req.OrganizationFeePercent + req.InstructorFeePercent;
        if (totalPercent != 100m)
            return BadRequest("Platform, organization, and instructor percentages must total 100.");

        if (req.WeeklyReleaseDay < 0 || req.WeeklyReleaseDay > 6)
            return BadRequest("WeeklyReleaseDay must be between 0 and 6.");

        var settings = await GetOrCreatePayoutSettingsAsync(academyId);
        settings.PlatformFeePercent = req.PlatformFeePercent;
        settings.OrganizationFeePercent = req.OrganizationFeePercent;
        settings.InstructorFeePercent = req.InstructorFeePercent;
        settings.WeeklyAutoReleaseEnabled = req.WeeklyAutoReleaseEnabled;
        settings.WeeklyReleaseDay = (DayOfWeek)req.WeeklyReleaseDay;
        settings.Currency = string.IsNullOrWhiteSpace(req.Currency) ? settings.Currency : req.Currency.Trim().ToUpperInvariant();
        settings.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            settings.Id,
            settings.AcademyId,
            settings.PlatformFeePercent,
            settings.OrganizationFeePercent,
            settings.InstructorFeePercent,
            settings.WeeklyAutoReleaseEnabled,
            weeklyReleaseDay = (int)settings.WeeklyReleaseDay,
            settings.Currency
        });
    }

    [HttpGet("org/academy/{academyId:guid}/earnings-summary")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> OrgAcademyEarningsSummary(Guid academyId)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanOrgAccessAcademyAsync(academyId, userId))
            return Forbid();

        var totalGross = await _db.InstructorEarnings
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId)
            .SumAsync(x => (decimal?)x.GrossAmount) ?? 0m;

        var totalPlatform = await _db.InstructorEarnings
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId)
            .SumAsync(x => (decimal?)x.PlatformAmount) ?? 0m;

        var totalOrganization = await _db.InstructorEarnings
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId)
            .SumAsync(x => (decimal?)x.OrganizationAmount) ?? 0m;

        var totalInstructor = await _db.InstructorEarnings
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId)
            .SumAsync(x => (decimal?)x.InstructorAmount) ?? 0m;

        var unpaidInstructor = await _db.InstructorEarnings
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId && !x.IsPaidOut)
            .SumAsync(x => (decimal?)x.InstructorAmount) ?? 0m;

        var pendingRequests = await _db.InstructorPayoutRequests
            .AsNoTracking()
            .CountAsync(x => x.AcademyId == academyId && x.Status == "Requested");

        return Ok(new
        {
            academyId,
            totalGross,
            totalPlatform,
            totalOrganization,
            totalInstructor,
            unpaidInstructor,
            pendingRequests
        });
    }

    [HttpGet("org/academy/{academyId:guid}/instructors")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> OrgAcademyInstructorBalances(Guid academyId)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanOrgAccessAcademyAsync(academyId, userId))
            return Forbid();

        var balances = await _db.InstructorEarnings
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId)
            .GroupBy(x => x.InstructorUserId)
            .Select(g => new
            {
                instructorUserId = g.Key,
                lifetimeEarned = g.Sum(x => x.InstructorAmount),
                availableNow = g.Where(x => !x.IsReleasedForPayout && !x.IsPaidOut).Sum(x => x.InstructorAmount),
                processing = g.Where(x => x.IsReleasedForPayout && !x.IsPaidOut).Sum(x => x.InstructorAmount),
                paidOut = g.Where(x => x.IsPaidOut).Sum(x => x.InstructorAmount)
            })
            .OrderByDescending(x => x.availableNow)
            .ToListAsync();

        var instructorIds = balances.Select(x => x.instructorUserId).Distinct().ToList();

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => instructorIds.Contains(u.Id))
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.ProfileImageUrl
            })
            .ToListAsync();

        var items = balances.Select(x =>
        {
            var u = users.FirstOrDefault(z => z.Id == x.instructorUserId);
            return new
            {
                x.instructorUserId,
                instructor = new
                {
                    id = u?.Id,
                    email = u?.Email,
                    displayName = u?.DisplayName,
                    profileImageUrl = u?.ProfileImageUrl
                },
                x.lifetimeEarned,
                x.availableNow,
                x.processing,
                x.paidOut
            };
        });

        return Ok(items);
    }

    [HttpGet("org/academy/{academyId:guid}/payout-requests")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> OrgAcademyPayoutRequests(Guid academyId)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanOrgAccessAcademyAsync(academyId, userId))
            return Forbid();

        var requests = await _db.InstructorPayoutRequests
            .AsNoTracking()
            .Where(x => x.AcademyId == academyId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        var instructorIds = requests.Select(x => x.InstructorUserId).Distinct().ToList();

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => instructorIds.Contains(u.Id))
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.ProfileImageUrl
            })
            .ToListAsync();

        var items = requests.Select(x =>
        {
            var u = users.FirstOrDefault(z => z.Id == x.InstructorUserId);
            return new
            {
                x.Id,
                x.InstructorUserId,
                instructor = new
                {
                    id = u?.Id,
                    email = u?.Email,
                    displayName = u?.DisplayName,
                    profileImageUrl = u?.ProfileImageUrl
                },
                x.RequestedAmount,
                x.Currency,
                x.Status,
                x.MessageToInstructor,
                x.Note,
                x.CreatedAt,
                x.ResolvedAt,
                x.PayoutId
            };
        });

        return Ok(items);
    }

    [HttpPost("org/academy/{academyId:guid}/release-weekly")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> ReleaseWeeklyPayouts(Guid academyId, [FromBody] ReleaseWeeklyPayoutsRequest _)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        if (!await CanOrgAccessAcademyAsync(academyId, userId))
            return Forbid();

        var settings = await GetOrCreatePayoutSettingsAsync(academyId);

        var grouped = await _db.InstructorEarnings
            .Where(x =>
                x.AcademyId == academyId &&
                !x.IsReleasedForPayout &&
                !x.IsPaidOut)
            .GroupBy(x => new { x.InstructorUserId, x.Currency })
            .Select(g => new
            {
                g.Key.InstructorUserId,
                g.Key.Currency,
                Total = g.Sum(x => x.InstructorAmount)
            })
            .Where(x => x.Total > 0m)
            .ToListAsync();

        var created = new List<object>();

        foreach (var group in grouped)
        {
            var payout = new InstructorPayout
            {
                Id = Guid.NewGuid(),
                AcademyId = academyId,
                InstructorUserId = group.InstructorUserId,
                TotalAmount = group.Total,
                Currency = group.Currency,
                Status = "Approved",
                IsInstantRequest = false,
                RequestNote = "Weekly scheduled payout",
                MessageToInstructor = "Your weekly payout has been released and will be processed shortly.",
                CreatedAt = DateTimeOffset.UtcNow,
                ApprovedAt = DateTimeOffset.UtcNow
            };

            _db.InstructorPayouts.Add(payout);

            var earnings = await _db.InstructorEarnings
                .Where(x =>
                    x.AcademyId == academyId &&
                    x.InstructorUserId == group.InstructorUserId &&
                    x.Currency == group.Currency &&
                    !x.IsReleasedForPayout &&
                    !x.IsPaidOut)
                .ToListAsync();

            foreach (var earning in earnings)
            {
                earning.IsReleasedForPayout = true;
                earning.PayoutId = payout.Id;
                earning.ReleasedAt = DateTimeOffset.UtcNow;
            }

            created.Add(new
            {
                payout.Id,
                payout.InstructorUserId,
                payout.TotalAmount,
                payout.Currency,
                payout.Status
            });
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            academyId,
            weeklyReleaseDay = settings.WeeklyReleaseDay.ToString(),
            createdCount = created.Count,
            payouts = created
        });
    }

    [HttpPost("org/payouts/{payoutId:guid}/mark-paid")]
    [Authorize(Roles = "OrgAdmin,Admin")]
    public async Task<IActionResult> MarkPayoutPaid(Guid payoutId, [FromBody] MarkPayoutPaidRequest req)
    {
        var userId = CurrentUserId;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var payout = await _db.InstructorPayouts
            .FirstOrDefaultAsync(x => x.Id == payoutId);

        if (payout == null)
            return NotFound("Payout not found.");

        if (!await CanOrgAccessAcademyAsync(payout.AcademyId, userId))
            return Forbid();

        if (payout.Status == "Paid")
            return BadRequest("Payout is already marked as paid.");

        payout.Status = "Paid";
        payout.PaidAt = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(req.Note))
            payout.RequestNote = req.Note.Trim();

        var earnings = await _db.InstructorEarnings
            .Where(x => x.PayoutId == payoutId)
            .ToListAsync();

        foreach (var earning in earnings)
        {
            earning.IsPaidOut = true;
            earning.PaidOutAt = DateTimeOffset.UtcNow;
        }

        var openRequests = await _db.InstructorPayoutRequests
            .Where(x =>
                x.AcademyId == payout.AcademyId &&
                x.InstructorUserId == payout.InstructorUserId &&
                (x.Status == "Requested" || x.Status == "Approved" || x.Status == "Processing"))
            .ToListAsync();

        foreach (var request in openRequests)
        {
            request.Status = "Paid";
            request.ResolvedAt = DateTimeOffset.UtcNow;
            request.PayoutId = payout.Id;
            request.MessageToInstructor = "Your payout has been released successfully.";
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            payout.Id,
            payout.Status,
            payout.PaidAt
        });
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook()
    {
        var webhookSecret = _stripeOptions.WebhookSecret;
        if (string.IsNullOrWhiteSpace(webhookSecret))
            return StatusCode(500, "Stripe webhook secret is not configured.");

        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"];

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(json, signature, webhookSecret);
        }
        catch
        {
            return BadRequest();
        }

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
            {
                var session = stripeEvent.Data.Object as Session;
                if (session != null)
                    await HandleCheckoutCompleted(session);
                break;
            }

            case "checkout.session.expired":
            {
                var session = stripeEvent.Data.Object as Session;
                if (session != null)
                    await HandleCheckoutExpired(session);
                break;
            }

            case "payment_intent.payment_failed":
            {
                var paymentIntent = stripeEvent.Data.Object as PaymentIntent;
                if (paymentIntent != null)
                    await HandlePaymentFailed(paymentIntent);
                break;
            }
        }

        return Ok();
    }

    private async Task HandleCheckoutCompleted(Session session)
    {
        var payment = await _db.Payments
            .FirstOrDefaultAsync(p => p.CheckoutSessionId == session.Id);

        if (payment == null)
            return;

        if (payment.Status == PaymentStatus.Paid)
            return;

        payment.Status = PaymentStatus.Paid;
        payment.PaymentIntentId = session.PaymentIntentId;
        payment.ProviderReference = session.Id;
        payment.PaymentMethodType = session.PaymentMethodTypes?.FirstOrDefault();
        payment.PaidAt = DateTimeOffset.UtcNow;
        payment.UpdatedAt = DateTimeOffset.UtcNow;

        var courseIdRaw = session.Metadata != null && session.Metadata.TryGetValue("courseId", out var c) ? c : null;
        var userId = session.Metadata != null && session.Metadata.TryGetValue("userId", out var u) ? u : payment.UserId;

        if (!Guid.TryParse(courseIdRaw, out var courseId) || string.IsNullOrWhiteSpace(userId))
        {
            await _db.SaveChangesAsync();
            return;
        }

        var alreadyEnrolled = await _db.Enrollments
            .AnyAsync(e => e.CourseId == courseId && e.StudentUserId == userId);

        if (!alreadyEnrolled)
        {
            _db.Enrollments.Add(new Enrollment
            {
                Id = Guid.NewGuid(),
                CourseId = courseId,
                StudentUserId = userId,
                Status = EnrollmentStatus.NotStarted,
                EnrolledAt = DateTimeOffset.UtcNow
            });
        }

        var earningExists = await _db.InstructorEarnings
            .AnyAsync(x => x.PaymentId == payment.Id);

        if (!earningExists)
        {
            var course = await _db.Courses
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == courseId);

            if (course != null)
            {
                var academy = await _db.Academies
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == course.AcademyId);

                if (academy != null)
                {
                    var settings = await GetOrCreatePayoutSettingsAsync(academy.Id);
                    var instructorUserId = !string.IsNullOrWhiteSpace(course.InstructorUserId)
                        ? course.InstructorUserId
                        : academy.OwnerUserId;

                    if (!string.IsNullOrWhiteSpace(instructorUserId))
                    {
                        var split = CalculateSplit(payment.Amount, settings);

                        _db.InstructorEarnings.Add(new InstructorEarning
                        {
                            Id = Guid.NewGuid(),
                            PaymentId = payment.Id,
                            CourseId = course.Id,
                            AcademyId = academy.Id,
                            InstructorUserId = instructorUserId,
                            StudentUserId = userId,
                            GrossAmount = payment.Amount,
                            PlatformAmount = split.platformAmount,
                            OrganizationAmount = split.organizationAmount,
                            InstructorAmount = split.instructorAmount,
                            Currency = payment.Currency,
                            IsReleasedForPayout = false,
                            IsPaidOut = false,
                            EarnedAt = DateTimeOffset.UtcNow
                        });
                    }
                }
            }
        }

        await _db.SaveChangesAsync();
    }

    private async Task HandleCheckoutExpired(Session session)
    {
        var payment = await _db.Payments
            .FirstOrDefaultAsync(p => p.CheckoutSessionId == session.Id);

        if (payment == null || payment.Status == PaymentStatus.Paid)
            return;

        payment.Status = PaymentStatus.Cancelled;
        payment.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    private async Task HandlePaymentFailed(PaymentIntent intent)
    {
        var payment = await _db.Payments
            .FirstOrDefaultAsync(p => p.PaymentIntentId == intent.Id);

        if (payment == null)
            return;

        if (payment.Status == PaymentStatus.Paid)
            return;

        payment.Status = PaymentStatus.Failed;
        payment.FailureReason = intent.LastPaymentError?.Message;
        payment.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }
}