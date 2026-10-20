using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace AITeacher.Api.Features.Graphs;

internal static class GraphHtml
{
    private const string Css = """
        :root{color-scheme:dark;--canvas-default:#07111f;--content-strong:#edf5ff;--content-muted:#a9bbcf;--action-primary:#7cb0ff;--focus-ring:#9bc2ff;--space-4:1rem;--space-6:1.5rem;--space-7:2rem}
        body{margin:0;background:var(--canvas-default);color:var(--content-strong);font:1rem/1.6 "Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}
        main{max-width:54rem;margin:auto;padding:var(--space-6) var(--space-4)}
        h1{font-size:1.75rem;line-height:1.25}h2{font-size:1.25rem;margin-top:var(--space-7)}
        li{margin-block:.5rem}ul,ol{padding-left:var(--space-6)}p{color:var(--content-muted)}
        a{color:var(--action-primary);text-underline-offset:.2em}a:focus-visible{outline:.2rem solid var(--focus-ring);outline-offset:.2rem}
        """;
    internal static string ContentSecurityPolicy => "default-src 'none'; style-src 'sha256-" + Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(Css))) + "'; frame-ancestors 'none'; base-uri 'none'";
    private static string Label(string value) => value switch {
        "requires" => "requiere", "explains" => "explica", "applies" => "aplica", "differsFrom" => "se diferencia de",
        "mention" => "mención", "exploration" => "exploración", "understanding" => "comprensión declarada",
        "pending" => "pendiente de validar", "accepted" => "aceptada por el alumno", "rejected" => "rechazada",
        "student" => "propuesta del alumno", "name-match-v1" => "coincidencia de nombre, versión 1", _ => value };
    internal static string Source(GraphMessage message) => "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Mensaje de origen</title><style>" + Css + "</style></head><body><main><h1>Mensaje de origen</h1><p>" + WebUtility.HtmlEncode(message.Text).Replace("\n", "<br>") + "</p></main></body></html>";
    public static string Render(GraphRevision graph, GraphNode[] nodes, GraphRelation[] edges, GraphObservation[] observations,
        ILookup<Guid, ObservationRevision> history, HashSet<Guid> accepted, HashSet<Guid> mentioned, GraphRelation[] gaps, int differences)
    {
        static string H(string x) => WebUtility.HtmlEncode(x);
        string Name(Guid id) => H(nodes.Single(x => x.Id == id).Name);
        var s = new StringBuilder("<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Mapa conversacional</title><style>" + Css + "</style></head><body><main>");
        s.Append($"<h1>{H(graph.Title)}</h1><p>Referencia editorial, revisión {graph.Number}. Las menciones y su validación no acreditan dominio.</p><h2>Conceptos</h2><ul>");
        foreach (var n in nodes) s.Append($"<li>{H(n.Name)} — {(accepted.Contains(n.Id) ? "cobertura aceptada por el alumno" : mentioned.Contains(n.Id) ? "mención pendiente" : "sin mención")}</li>");
        s.Append("</ul><h2>Relaciones editoriales</h2><ul>");
        if (edges.Length == 0) s.Append("<li>No hay relaciones editoriales en esta revisión.</li>");
        foreach (var e in edges) s.Append($"<li>{Name(e.FromNodeId)} — {H(Label(e.Relation))} — {Name(e.ToNodeId)}</li>");
        s.Append("</ul><h2>Observaciones y procedencia</h2><ul>");
        if (observations.Length == 0) s.Append("<li>No hay observaciones registradas para esta referencia.</li>");
        foreach (var o in observations)
        {
            var r = history[o.Id].Last();
            s.Append($"<li>{Name(r.FromNodeId)}{(r.ToNodeId is Guid target ? " — " + H(Label(r.Relation!)) + " — " + Name(target) : "")} — {H(Label(r.Stage))}, {H(Label(r.Status))}; origen {H(Label(o.Origin))}, confianza {r.Confidence.ToString(System.Globalization.CultureInfo.InvariantCulture)}. <a href=\"/api/graphs/conversations/{o.ConversationId}/messages/{o.MessageId}\">Mensaje de origen</a><ol>");
            foreach (var h in history[o.Id]) s.Append($"<li>Versión {h.Version}: {H(Label(h.Reason))} ({H(Label(h.Status))})</li>");
            s.Append("</ol></li>");
        }
        s.Append("</ul><h2>Comparación para revisión</h2><ul>");
        foreach (var gap in gaps) s.Append($"<li>Prerrequisito sin cobertura aceptada: {Name(gap.FromNodeId)} requiere {Name(gap.ToNodeId)}.</li>");
        s.Append($"<li>{differences} relaciones propuestas difieren de la referencia editorial.</li></ul></main></body></html>");
        return s.ToString();
    }
}
