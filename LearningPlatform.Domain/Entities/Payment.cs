namespace LearningPlatform.Domain.Entities;

public enum PaymentStatus
{
    Pending = 0,
    Paid = 1,
    Failed = 2,
    Cancelled = 3,
    Refunded = 4
}

public class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CourseId { get; set; }
    public Course Course { get; set; } = null!;

    public string UserId { get; set; } = string.Empty;

    public string Provider { get; set; } = "Stripe";
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;

    public string CheckoutSessionId { get; set; } = string.Empty;
    public string? PaymentIntentId { get; set; }
    public string? ProviderReference { get; set; }
    public string? PaymentMethodType { get; set; }

    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EUR";

    public string? FailureReason { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PaidAt { get; set; }
}