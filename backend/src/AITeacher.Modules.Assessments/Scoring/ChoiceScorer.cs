using AITeacher.Modules.Assessments.Questions;

namespace AITeacher.Modules.Assessments.Scoring;

public sealed record ChoiceScore(decimal Fraction, bool IsCorrect);

public sealed class ChoiceScorer
{
    public ChoiceScore Score(ChoiceQuestion question, IEnumerable<Guid> selectedOptionIds)
    {
        var submitted = selectedOptionIds.ToArray();
        var selected = submitted.ToHashSet();
        if (submitted.Length != selected.Count || !selected.IsSubsetOf(question.Options.Select(x => x.Id)))
            throw new ArgumentException("Answers must contain distinct, known option IDs.", nameof(selectedOptionIds));
        if (question.Type != QuestionType.MultipleChoice && selected.Count > 1)
            throw new ArgumentException("This question accepts at most one answer.", nameof(selectedOptionIds));

        var exact = selected.SetEquals(question.CorrectOptionIds);
        if (question.ScoringPolicy == ChoiceScoringPolicy.ExactMatch)
            return new ChoiceScore(exact ? 1m : 0m, exact);

        var hits = selected.Count(question.CorrectOptionIds.Contains);
        var misses = selected.Count - hits;
        var distractors = question.Options.Count - question.CorrectOptionIds.Count;
        // Selecting every option scores zero; omissions and wrong choices have distinct costs.
        var fraction = (decimal)hits / question.CorrectOptionIds.Count - (decimal)misses / distractors;
        return new ChoiceScore(Math.Clamp(fraction, 0m, 1m), exact);
    }
}
