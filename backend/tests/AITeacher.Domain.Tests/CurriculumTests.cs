using AITeacher.Modules.Curriculum.Concepts;
using AITeacher.Modules.Curriculum.Publishing;
using AITeacher.Modules.Learning.Evidence;
using Xunit;

namespace AITeacher.Domain.Tests;

public sealed class CurriculumTests
{
    [Fact]
    public void PublicationRequiresReadingPracticeAndAssessmentForEveryObjective()
    {
        var valid = new ObjectiveCoverage(Guid.NewGuid(), [Guid.NewGuid()], [Guid.NewGuid()],
            [Guid.NewGuid()], [Guid.NewGuid()]);
        Assert.Empty(LearningUnitPublication.Validate([valid]));
        Assert.NotEmpty(LearningUnitPublication.Validate([]));
        Assert.NotEmpty(LearningUnitPublication.Validate([valid with { ReadingRevisionIds = [] }]));
        Assert.NotEmpty(LearningUnitPublication.Validate([valid with { ExerciseRevisionIds = [] }]));
        Assert.NotEmpty(LearningUnitPublication.Validate([valid with { AssessmentQuestionRevisionIds = [] }]));
        Assert.NotEmpty(LearningUnitPublication.Validate([valid with { ConceptIds = [Guid.Empty] }]));
        Assert.NotEmpty(LearningUnitPublication.Validate([valid, valid]));
    }

    [Fact]
    public void PrerequisitesRejectCyclesAndUnknownConcepts()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var c = Guid.NewGuid();
        PrerequisiteGraph.Validate([a, b, c], [new(b, a), new(c, b)]);
        Assert.Throws<ArgumentException>(() => PrerequisiteGraph.Validate([a, b, c],
            [new(b, a), new(c, b), new(a, c)]));
        Assert.Throws<ArgumentException>(() => PrerequisiteGraph.Validate([a], [new(a, a)]));
        Assert.Throws<ArgumentException>(() => PrerequisiteGraph.Validate([a], [new(a, b)]));
    }

    [Fact]
    public void EvidencePreservesAssistanceAndProvenance()
    {
        var source = Guid.NewGuid();
        var evidence = new LearningEvidence(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), source,
            2, EvidenceSource.Practice, AssistanceLevel.AnswerRevealed, 1m, DateTimeOffset.UtcNow);
        Assert.Equal(source, evidence.SourceRecordId);
        Assert.Equal(2, evidence.SourceRevision);
        Assert.Equal(AssistanceLevel.AnswerRevealed, evidence.Assistance);
        Assert.Throws<ArgumentException>(() => new LearningEvidence(Guid.NewGuid(), Guid.NewGuid(),
            Guid.NewGuid(), source, 1, EvidenceSource.Assessment, AssistanceLevel.None, 1.1m,
            DateTimeOffset.UtcNow));
    }
}
