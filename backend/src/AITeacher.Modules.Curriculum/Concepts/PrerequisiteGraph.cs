namespace AITeacher.Modules.Curriculum.Concepts;

public sealed record Prerequisite(Guid ConceptId, Guid RequiresConceptId);

public static class PrerequisiteGraph
{
    // Only prerequisite edges must be acyclic. Other conceptual relations may form cycles.
    public static void Validate(IEnumerable<Guid> conceptIds, IEnumerable<Prerequisite> prerequisites)
    {
        var nodes = conceptIds.ToHashSet();
        var edges = prerequisites.ToArray();
        if (nodes.Contains(Guid.Empty) || edges.Any(x => !nodes.Contains(x.ConceptId) || !nodes.Contains(x.RequiresConceptId)))
            throw new ArgumentException("Prerequisites must reference existing concepts.");

        var incoming = nodes.ToDictionary(x => x, _ => 0);
        var outgoing = nodes.ToDictionary(x => x, _ => new List<Guid>());
        foreach (var edge in edges.Distinct())
        {
            outgoing[edge.RequiresConceptId].Add(edge.ConceptId);
            incoming[edge.ConceptId]++;
        }
        var ready = new Queue<Guid>(nodes.Where(x => incoming[x] == 0));
        var visited = 0;
        while (ready.TryDequeue(out var node))
        {
            visited++;
            foreach (var next in outgoing[node])
                if (--incoming[next] == 0)
                    ready.Enqueue(next);
        }
        if (visited != nodes.Count)
            throw new ArgumentException("Prerequisites cannot contain cycles.");
    }
}
