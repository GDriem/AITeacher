using AITeacher.Modules.Assessments.Questions;
using AITeacher.Modules.Assessments.Scoring;
using Xunit;

namespace AITeacher.Domain.Tests;

public sealed class AssessmentTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();
    private static readonly Guid C = Guid.NewGuid();
    private static readonly Guid D = Guid.NewGuid();

    private static ChoiceQuestion Question(QuestionType type = QuestionType.MultipleChoice,
        ChoiceScoringPolicy policy = ChoiceScoringPolicy.ExactMatch) =>
        new(Guid.NewGuid(), 1, type, "Selecciona las respuestas correctas.",
            [new(A, "A"), new(B, "B"), new(C, "C"), new(D, "D")],
            type == QuestionType.MultipleChoice ? [A, B] : [A], [Guid.NewGuid()], policy);

    [Fact]
    public void ExactMatchRequiresAllCorrectAnswersAndNoDistractors()
    {
        var scorer = new ChoiceScorer();
        var question = Question();
        Assert.Equal(new ChoiceScore(1m, true), scorer.Score(question, [B, A]));
        Assert.Equal(0m, scorer.Score(question, [A]).Fraction);
        Assert.Equal(0m, scorer.Score(question, [A, B, C]).Fraction);
        Assert.Equal(0m, scorer.Score(question, []).Fraction);
    }

    [Fact]
    public void SelectingEveryOptionCannotEarnPartialCredit()
    {
        var question = Question(policy: ChoiceScoringPolicy.PartialCredit);
        var scorer = new ChoiceScorer();
        Assert.Equal(0m, scorer.Score(question, [A, B, C, D]).Fraction);
        Assert.Equal(0.5m, scorer.Score(question, [A]).Fraction);
        Assert.Equal(0.5m, scorer.Score(question, [A, B, C]).Fraction);
        Assert.Equal(0m, scorer.Score(question, [C, D]).Fraction);
    }

    [Fact]
    public void InvalidSelectionsCannotBeScored()
    {
        var scorer = new ChoiceScorer();
        Assert.Throws<ArgumentException>(() => scorer.Score(Question(), [Guid.NewGuid()]));
        Assert.Throws<ArgumentException>(() => scorer.Score(Question(), [A, A]));
        Assert.Throws<ArgumentException>(() => scorer.Score(Question(QuestionType.SingleChoice), [A, B]));
    }

    [Fact]
    public void TrueFalseAcceptsExactlyTwoOptionsAndOneCorrectAnswer()
    {
        var question = new ChoiceQuestion(Guid.NewGuid(), 1, QuestionType.TrueFalse, "¿Es correcto?",
            [new(A, "Verdadero"), new(B, "Falso")], [B], [Guid.NewGuid()]);
        Assert.True(new ChoiceScorer().Score(question, [B]).IsCorrect);
        Assert.False(new ChoiceScorer().Score(question, [A]).IsCorrect);
        Assert.Throws<ArgumentException>(() => Question(QuestionType.TrueFalse));
    }

    [Fact]
    public void RubricQuestionsCannotUseChoiceCorrection()
    {
        Assert.Throws<ArgumentException>(() => Question(QuestionType.CaseAnalysis));
        Assert.Throws<ArgumentException>(() => Question(QuestionType.OpenResponse));
        Assert.Throws<ArgumentException>(() => Question(QuestionType.PracticalExercise));
    }

    [Fact]
    public void MultipleChoiceRequiresADistractorUnderEveryPolicy()
    {
        foreach (var policy in Enum.GetValues<ChoiceScoringPolicy>())
            Assert.Throws<ArgumentException>(() => new ChoiceQuestion(Guid.NewGuid(), 1,
                QuestionType.MultipleChoice, "Selecciona las correctas.",
                [new(A, "A"), new(B, "B")], [A, B], [Guid.NewGuid()], policy));
    }
}
