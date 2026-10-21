using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Catalog;

// Application contract: editorial content does not navigate catalog EF entities.
public interface ITopicCatalog
{
    Task<bool> ExistsAsync(Guid topicId, CancellationToken ct);
}

public sealed class TopicCatalog(CatalogDbContext db) : ITopicCatalog
{
    public Task<bool> ExistsAsync(Guid topicId, CancellationToken ct) => db.Topics.AnyAsync(x => x.Id == topicId, ct);
}
