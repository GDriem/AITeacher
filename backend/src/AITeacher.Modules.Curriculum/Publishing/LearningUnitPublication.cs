namespace AITeacher.Modules.Curriculum.Publishing;

public sealed record ObjectiveCoverage(
    Guid ObjectiveId,
    IReadOnlyCollection<Guid> ConceptIds,
    IReadOnlyCollection<Guid> ReadingRevisionIds,
    IReadOnlyCollection<Guid> ExerciseRevisionIds,
    IReadOnlyCollection<Guid> AssessmentQuestionRevisionIds);

public static class LearningUnitPublication
{
    public static IReadOnlyList<string> Validate(IReadOnlyCollection<ObjectiveCoverage> objectives)
    {
        var errors = new List<string>();
        if (objectives.Count == 0)
            errors.Add("A learning unit must have at least one objective.");
        if (objectives.Select(x => x.ObjectiveId).Distinct().Count() != objectives.Count)
            errors.Add("Objective IDs must be unique.");
        foreach (var objective in objectives)
        {
            if (objective.ObjectiveId == Guid.Empty)
                errors.Add("An objective must have an ID.");
            RequireReferences(objective.ConceptIds, "concepts");
            RequireReferences(objective.ReadingRevisionIds, "reading");
            RequireReferences(objective.ExerciseRevisionIds, "exercises");
            RequireReferences(objective.AssessmentQuestionRevisionIds, "assessment questions");

            void RequireReferences(IReadOnlyCollection<Guid> references, string name)
            {
                if (references.Count == 0 || references.Contains(Guid.Empty))
                    errors.Add($"Objective {objective.ObjectiveId} requires valid {name} references.");
            }
        }
        // The application layer must also resolve these IDs to published revisions.
        return errors.AsReadOnly();
    }
}
