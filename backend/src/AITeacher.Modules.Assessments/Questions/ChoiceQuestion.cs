namespace AITeacher.Modules.Assessments.Questions;

public enum QuestionType
{
    SingleChoice,
    MultipleChoice,
    TrueFalse,
    OpenResponse,
    CaseAnalysis,
    PracticalExercise
}

public enum ChoiceScoringPolicy { ExactMatch, PartialCredit }

public sealed record AnswerOption(Guid Id, string Text);

// Server-side answer key. Never use this object as an API response DTO.
public sealed class ChoiceQuestion
{
    public Guid Id { get; }
    public int Revision { get; }
    public QuestionType Type { get; }
    public string Prompt { get; }
    public IReadOnlyList<AnswerOption> Options { get; }
    public IReadOnlySet<Guid> CorrectOptionIds { get; }
    public IReadOnlySet<Guid> ConceptIds { get; }
    public ChoiceScoringPolicy ScoringPolicy { get; }

    public ChoiceQuestion(Guid id, int revision, QuestionType type, string prompt,
        IEnumerable<AnswerOption> options, IEnumerable<Guid> correctOptionIds,
        IEnumerable<Guid> conceptIds, ChoiceScoringPolicy scoringPolicy = ChoiceScoringPolicy.ExactMatch)
    {
        if (id == Guid.Empty || revision < 1 || string.IsNullOrWhiteSpace(prompt))
            throw new ArgumentException("A question requires an ID, revision and prompt.");
        if (type is not (QuestionType.SingleChoice or QuestionType.MultipleChoice or QuestionType.TrueFalse))
            throw new ArgumentException("This question requires a rubric-based evaluator.", nameof(type));
        if (!Enum.IsDefined(scoringPolicy))
            throw new ArgumentException("Unknown scoring policy.", nameof(scoringPolicy));

        var items = options.ToArray();
        var correct = correctOptionIds.ToHashSet();
        var concepts = conceptIds.ToHashSet();
        if (items.Length < 2 || items.Any(x => x.Id == Guid.Empty || string.IsNullOrWhiteSpace(x.Text))
            || items.Select(x => x.Id).Distinct().Count() != items.Length)
            throw new ArgumentException("At least two distinct, valid options are required.", nameof(options));
        if (correct.Count == 0 || !correct.IsSubsetOf(items.Select(x => x.Id)))
            throw new ArgumentException("The answer key must reference existing options.", nameof(correctOptionIds));
        if (type != QuestionType.MultipleChoice && correct.Count != 1)
            throw new ArgumentException("Single-choice and true/false require exactly one correct option.");
        if (type == QuestionType.TrueFalse && items.Length != 2)
            throw new ArgumentException("True/false requires exactly two options.");
        if (scoringPolicy == ChoiceScoringPolicy.PartialCredit && type != QuestionType.MultipleChoice)
            throw new ArgumentException("Partial credit applies only to multiple-choice questions.");
        if (type == QuestionType.MultipleChoice && correct.Count == items.Length)
            throw new ArgumentException("Multiple-choice questions require at least one distractor.");
        if (concepts.Count == 0 || concepts.Contains(Guid.Empty))
            throw new ArgumentException("A question must assess at least one concept.", nameof(conceptIds));

        Id = id;
        Revision = revision;
        Type = type;
        Prompt = prompt.Trim();
        Options = Array.AsReadOnly(items);
        CorrectOptionIds = System.Collections.Frozen.FrozenSet.ToFrozenSet(correct);
        ConceptIds = System.Collections.Frozen.FrozenSet.ToFrozenSet(concepts);
        ScoringPolicy = scoringPolicy;
    }
}
