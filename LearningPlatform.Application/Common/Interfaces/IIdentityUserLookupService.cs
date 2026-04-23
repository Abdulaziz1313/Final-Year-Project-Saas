namespace LearningPlatform.Application.Common.Interfaces;

public interface IIdentityUserLookupService
{
    Task<List<IdentityUserLookupItem>> GetUsersByIdsAsync(
        List<string> userIds,
        CancellationToken cancellationToken = default);
}

public class IdentityUserLookupItem
{
    public string Id { get; set; } = default!;
    public string? Email { get; set; }
    public string? DisplayName { get; set; }
}