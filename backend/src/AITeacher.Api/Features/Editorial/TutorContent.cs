using System.Text.Json;
using AITeacher.Api.Features.Tutor;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Editorial;

// Public, student-safe application contract. No assessment or private criteria cross this boundary.
public sealed class TutorContent(EditorialDbContext db) : ITutorContent
{
    public async Task<TutorUnit?> Active(Guid unitId, CancellationToken ct)
    {
        var row = await (from u in db.Units.AsNoTracking()
                         join r in db.Revisions.AsNoTracking() on u.PublishedRevisionId equals r.Id
                         where u.Id == unitId
                         select new { r.Id, r.DocumentJson }).SingleOrDefaultAsync(ct);
        if (row is null) return null;
        var d = JsonSerializer.Deserialize<UnitDocument>(row.DocumentJson, EditorialService.Json)!;
        return new(unitId, row.Id, d.Title, d.Objectives.Select(x => new TutorObjective(x.Id, x.Description)).ToArray(),
            d.Readings.Select(x => new TutorReading(x.Id, x.Title, x.Text, x.Source, x.ObjectiveIds)).ToArray(),
            d.Exercises.Select(x => new TutorExercise(x.Id, x.Prompt, x.ObjectiveIds)).ToArray());
    }
}
