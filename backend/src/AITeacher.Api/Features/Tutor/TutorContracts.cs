namespace AITeacher.Api.Features.Tutor;

public sealed record CreateConversationRequest(Guid UnitId, string Mode = "chat", Guid? ActivityId = null);
public sealed record CreateTurnRequest(Guid RequestId, long Version, string Text);
public sealed record CreateNoteRequest(string Kind, string? Text = null, Guid? ConversationId = null, Guid? MessageId = null);
public sealed record UpdateNoteRequest(long Version, string Text);
public sealed record TutorObjective(Guid Id, string Description);
public sealed record TutorReading(Guid Id, string Title, string Text, string Source, Guid[] ObjectiveIds);
public sealed record TutorExercise(Guid Id, string Prompt, Guid[] ObjectiveIds);
public sealed record TutorUnit(Guid UnitId, Guid RevisionId, string Title, TutorObjective[] Objectives, TutorReading[] Readings, TutorExercise[] Exercises);
public interface ITutorContent
{
    Task<TutorUnit?> Active(Guid unitId, CancellationToken ct);
}
public sealed record TutorSource(Guid Id, Guid UnitId, Guid RevisionId, string Title, string Source, string Excerpt);
public sealed record ContextMessage(string Role, string Text);
public sealed record ContextManifest(string SkillVersion, int CharacterCount, int Utf8TokenUpperBound, Guid[] MessageIds,
    Guid[] SourceIds, Guid? RevisionId, string Capability, bool Truncated);
public sealed record TutorContext(string System, string Payload, TutorSource[] Sources, ContextManifest Manifest);
public sealed record ProviderSelection(string Provider, string Model, string ConfigurationVersion, bool StructuredOutput);
public sealed record ProviderReply(string Text, Guid[] SourceIds, int? InputTokens = null, int? OutputTokens = null);
public sealed class TutorUnavailableException : Exception;
public sealed class TutorOutputException : Exception;
