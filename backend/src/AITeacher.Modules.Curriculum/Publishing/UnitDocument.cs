using AITeacher.Modules.Curriculum.Concepts;

namespace AITeacher.Modules.Curriculum.Publishing;

// These IDs are local to this immutable unit revision, not references to an external bank.
public sealed record UnitConcept(Guid Id, string Name);
public sealed record UnitObjective(Guid Id, string Description, Guid[] ConceptIds);
public sealed record UnitReading(Guid Id, string Title, string Text, string Source, Guid[] ObjectiveIds);
public sealed record UnitExercise(Guid Id, string Prompt, Guid[] ObjectiveIds);
// Editorial assessment material only. Executable questions and attempts belong to milestone 3.
public sealed record UnitAssessment(Guid Id, string Prompt, string PrivateCriteria, Guid[] ObjectiveIds);
public sealed record ReadingProvenance(string SourceId, string Topic, string Level, string[] Keywords);
public sealed record UnitDocument(string Title, UnitConcept[] Concepts, UnitObjective[] Objectives,
    UnitReading[] Readings, UnitExercise[] Exercises, UnitAssessment[] Assessments, Prerequisite[] Prerequisites,
    string Kind = "learningUnit", ReadingProvenance? ReadingProvenance = null);

public static class UnitDocumentValidation
{
    public static IReadOnlyList<string> Validate(UnitDocument document, bool publishing = false)
    {
        var errors = new List<string>();
        if (document is null || !Text(document.Title, 150) ||
            !Collection(document.Concepts) || !Collection(document.Objectives) || !Collection(document.Readings) ||
            !Collection(document.Exercises) || !Collection(document.Assessments) || !Collection(document.Prerequisites))
            return ["A title and all document arrays are required (maximum 200 entries each)."];
        if (document.Concepts.Any(x => x is null || !Text(x.Name, 150)) ||
            document.Objectives.Any(x => x is null || !Text(x.Description, 2000) || !Ids(x.ConceptIds)) ||
            document.Readings.Any(x => x is null || !Text(x.Title, 150) || !Text(x.Text, 100000) || !Text(x.Source, 1000) || !Ids(x.ObjectiveIds)) ||
            document.Exercises.Any(x => x is null || !Text(x.Prompt, 20000) || !Ids(x.ObjectiveIds)) ||
            document.Assessments.Any(x => x is null || !Text(x.Prompt, 20000) || !Text(x.PrivateCriteria, 20000) || !Ids(x.ObjectiveIds)) ||
            document.Prerequisites.Any(x => x is null))
            return ["Invalid document entry, text length or reference array."];
        if (document.Kind is not ("learningUnit" or "reading"))
            errors.Add("Unknown material kind.");
        if (document.ReadingProvenance is { } provenance &&
            (!Text(provenance.SourceId, 150) || !Text(provenance.Topic, 150) ||
             !Text(provenance.Level, 80) || !Collection(provenance.Keywords) || provenance.Keywords.Any(x => !Text(x, 150))))
            errors.Add("Invalid reading provenance.");
        if (document.Kind == "reading" && (document.Readings.Length == 0 || document.Objectives.Length != 0 ||
            document.Concepts.Length != 0 || document.Exercises.Length != 0 || document.Assessments.Length != 0 || document.Prerequisites.Length != 0))
            errors.Add("Reading material requires readings and cannot claim objectives, concepts, practice or assessment.");
        var ids = document.Concepts.Select(x => x.Id).Concat(document.Objectives.Select(x => x.Id))
            .Concat(document.Readings.Select(x => x.Id)).Concat(document.Exercises.Select(x => x.Id))
            .Concat(document.Assessments.Select(x => x.Id)).ToArray();
        if (ids.Contains(Guid.Empty) || ids.Distinct().Count() != ids.Length)
            errors.Add("Document entry IDs must be nonempty and unique within the revision.");
        var concepts = document.Concepts.Select(x => x.Id).ToHashSet();
        var objectives = document.Objectives.Select(x => x.Id).ToHashSet();
        if (document.Objectives.Any(x => x.ConceptIds.Any(id => !concepts.Contains(id))) ||
            document.Readings.SelectMany(x => x.ObjectiveIds).Concat(document.Exercises.SelectMany(x => x.ObjectiveIds))
                .Concat(document.Assessments.SelectMany(x => x.ObjectiveIds)).Any(id => !objectives.Contains(id)))
            errors.Add("References must resolve inside this unit revision.");
        try { PrerequisiteGraph.Validate(concepts, document.Prerequisites); }
        catch (ArgumentException exception) { errors.Add(exception.Message); }
        if (publishing && document.Kind == "learningUnit")
        {
            var coverage = document.Objectives.Select(x => new ObjectiveCoverage(x.Id, x.ConceptIds,
                document.Readings.Where(r => r.ObjectiveIds.Contains(x.Id)).Select(r => r.Id).ToArray(),
                document.Exercises.Where(r => r.ObjectiveIds.Contains(x.Id)).Select(r => r.Id).ToArray(),
                document.Assessments.Where(r => r.ObjectiveIds.Contains(x.Id)).Select(r => r.Id).ToArray())).ToArray();
            errors.AddRange(LearningUnitPublication.Validate(coverage));
        }
        return errors;
    }

    private static bool Text(string? value, int max) => !string.IsNullOrWhiteSpace(value) && value.Length <= max;
    private static bool Collection<T>(T[]? values) => values is { Length: <= 200 };
    private static bool Ids(Guid[]? values) => values is { Length: <= 200 } && !values.Contains(Guid.Empty) && values.Distinct().Count() == values.Length;
}
