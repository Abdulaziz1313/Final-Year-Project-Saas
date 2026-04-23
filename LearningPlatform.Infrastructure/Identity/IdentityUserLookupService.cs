using LearningPlatform.Application.Common.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Infrastructure.Identity;

public class IdentityUserLookupService : IIdentityUserLookupService
{
    private readonly UserManager<ApplicationUser> _userManager;

    public IdentityUserLookupService(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    public async Task<List<IdentityUserLookupItem>> GetUsersByIdsAsync(
        List<string> userIds,
        CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
            return new List<IdentityUserLookupItem>();

        return await _userManager.Users
            .AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new IdentityUserLookupItem
            {
                Id = u.Id,
                Email = u.Email,
                DisplayName = u.DisplayName
            })
            .ToListAsync(cancellationToken);
    }
}