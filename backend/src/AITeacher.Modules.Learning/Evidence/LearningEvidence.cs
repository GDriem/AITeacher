namespace AITeacher.Modules.Learning.Evidence;

public enum EvidenceSource { Conversation, Practice, Assessment, DelayedReview }
public enum AssistanceLevel { None, Hint, WorkedExample, AnswerRevealed }

// Evidence is an input to a versioned mastery policy, never a mastery flag itself.
public sealed class LearningEvidence
{
    public Guid Id { get; }
    public Guid StudentId { get; }
    public Guid ConceptId { get; }
    public Guid SourceRecordId { get; }
    public int SourceRevision { get; }
    public EvidenceSource Source { get; }
    public AssistanceLevel Assistance { get; }
    public decimal Score { get; }
    public DateTimeOffset ObservedAt { get; }

    public LearningEvidence(Guid id, Guid studentId, Guid conceptId, Guid sourceRecordId,
        int sourceRevision, EvidenceSource source, AssistanceLevel assistance,
        decimal score, DateTimeOffset observedAt)
    {
        if (id == Guid.Empty || studentId == Guid.Empty || conceptId == Guid.Empty || sourceRecordId == Guid.Empty)
            throw new ArgumentException("Evidence requires identity, concept and provenance.");
        if (sourceRevision < 1 || score is < 0 or > 1 || !Enum.IsDefined(source) || !Enum.IsDefined(assistance)
            || observedAt == default)
            throw new ArgumentException("Evidence requires a valid revision, score, source, assistance and timestamp.");
        Id = id;
        StudentId = studentId;
        ConceptId = conceptId;
        SourceRecordId = sourceRecordId;
        SourceRevision = sourceRevision;
        Source = source;
        Assistance = assistance;
        Score = score;
        ObservedAt = observedAt;
    }
}
