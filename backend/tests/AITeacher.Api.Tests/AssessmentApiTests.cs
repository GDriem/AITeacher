using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Assessments;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class AssessmentApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private async Task<HttpClient> Login(string credential = "author")
    {
        var client = fixture.Host.CreateClient();
        await Csrf(client);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/google", new { credential })).StatusCode);
        await Csrf(client);
        return client;
    }
    private static async Task Csrf(HttpClient client)
    {
        var token = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!["requestToken"]!.GetValue<string>());
    }
    private static async Task<JsonObject> Success(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"Expected {expected}, got {response.StatusCode}: {body}");
        return JsonNode.Parse(body)!.AsObject();
    }
    private const string Root = "/api/assessments";
    private static Guid Id(JsonObject row) => row["id"]!.GetValue<Guid>();
    private static string Attempt(Guid id) => Root + "/attempts/" + id;
    private sealed record Setup(QuestionRequest[] Questions, Guid[] Revisions, DefinitionRequest Definition, Guid DefinitionRevision, Guid UnitId);
    private async Task<Setup> Create(HttpClient author, string feedback = "afterSubmission", int maxAttempts = 3)
    {
        var entry = new { name = "Tema", slug = "assessment-" + Guid.NewGuid().ToString("N") };
        var subject = await Success(await author.PostAsJsonAsync("/api/catalog/subjects", entry), HttpStatusCode.Created);
        var category = await Success(await author.PostAsJsonAsync("/api/catalog/categories", new { subjectId = Id(subject), entry }), HttpStatusCode.Created);
        var topic = await Success(await author.PostAsJsonAsync("/api/catalog/topics", new { subjectId = Id(subject), categoryId = Id(category), entry }), HttpStatusCode.Created);
        var c = Guid.NewGuid(); var o = Guid.NewGuid();
        var document = new UnitDocument("Unidad", [new(c, "Concepto")], [new(o, "Aplicar", [c])],
            [new(Guid.NewGuid(), "Lectura", "Contenido", "Propia", [o])], [new(Guid.NewGuid(), "Ejercicio", [o])],
            [new(Guid.NewGuid(), "Evaluación", "PRIVATE-EDITORIAL", [o])], []);
        var unit = await Success(await author.PostAsJsonAsync("/api/units", new { topicId = Id(topic), document }), HttpStatusCode.Created);
        var ur = unit["revision"]!["id"]!.GetValue<Guid>();
        await Success(await author.PostAsJsonAsync($"/api/units/{Id(unit)}/revisions/{ur}/publish", new { version = 1 }));
        var questions = new List<QuestionRequest>(); var revisions = new List<Guid>();
        foreach (var type in new[] { "singleChoice", "trueFalse", "multipleChoice" })
        {
            var options = Enumerable.Range(0, type == "multipleChoice" ? 4 : 2).Select(i => new OptionDocument(Guid.NewGuid(), "Opción " + i)).ToArray();
            var q = new QuestionRequest(Guid.NewGuid(), 1, new(Id(unit), ur, [o], [c], type, "Pregunta " + type, options,
                type == "multipleChoice" ? [options[0].Id, options[1].Id] : [options[0].Id], type == "multipleChoice" ? "partialCredit" : "exactMatch"));
            questions.Add(q);
            revisions.Add(Id(await Success(await author.PostAsJsonAsync(Root + "/questions", q), HttpStatusCode.Created)));
        }
        var d = new DefinitionRequest(Guid.NewGuid(), 1, new("Prueba", Id(unit), ur, [o], revisions.ToArray(), "assessment", 10, maxAttempts, feedback, "none"));
        var dr = Id(await Success(await author.PostAsJsonAsync(Root + "/definitions", d), HttpStatusCode.Created));
        return new(questions.ToArray(), revisions.ToArray(), d, dr, Id(unit));
    }
    private static SubmitAttemptRequest Correct(Setup s) => new(s.Questions.Select((q, i) => new AnswerDocument(s.Revisions[i], q.Document.CorrectOptionIds)).ToArray());
    private static async Task<Guid> Start(HttpClient student, Setup s) => Id(await Success(await student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(s.DefinitionRevision, Guid.NewGuid())), HttpStatusCode.Created));
    private async Task<int> Events(Guid attempt)
    {
        using var scope = fixture.Host.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AssessmentDbContext>().EvidenceEvents.CountAsync(x => x.AttemptId == attempt);
    }

    [Fact]
    public async Task Closed_types_are_scored_persisted_and_retries_do_not_duplicate_evidence()
    {
        // Preserve a sub-microsecond component even on clocks with coarser resolution.
        fixture.Clock.Now = fixture.Clock.Now.AddTicks(7 - fixture.Clock.Now.Ticks % 10);
        using var author = await Login(); using var student = await Login("student-a");
        var s = await Create(author); var id = await Start(student, s);
        var before = await student.GetStringAsync(Attempt(id));
        Assert.DoesNotContain("correctOptionIds", before); Assert.DoesNotContain("PRIVATE", before);
        Assert.Null(JsonNode.Parse(before)!["scores"]); Assert.Null(JsonNode.Parse(before)!["fraction"]);
        Assert.Contains("no-store", (await student.GetAsync(Attempt(id))).Headers.CacheControl!.ToString());
        var answer = Correct(s);
        // A wrong multiple-choice distractor cancels one hit: 2/2 - 1/2 = 0.5.
        answer.Answers[2] = answer.Answers[2] with { SelectedOptionIds = s.Questions[2].Document.Options.Take(3).Select(x => x.Id).ToArray() };
        var result = await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", answer));
        Assert.Equal("submitted", result["status"]!.GetValue<string>());
        Assert.Equal(0.5m, result["scores"]![2]!["fraction"]!.GetValue<decimal>());
        Assert.DoesNotContain("correctOptionIds", result.ToJsonString());
        var repeat = new SubmitAttemptRequest(answer.Answers.Reverse().Select(x => x with { SelectedOptionIds = x.SelectedOptionIds.Reverse().ToArray() }).ToArray());
        Assert.Equal(result.ToJsonString(), (await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", repeat))).ToJsonString());
        Assert.Equal(3, await Events(id));
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s))).StatusCode);
        await using var restarted = new ApiHost(fixture.Connection, fixture.Clock);
        using var scope = restarted.Services.CreateScope();
        var persisted = await scope.ServiceProvider.GetRequiredService<AssessmentDbContext>().Attempts.SingleAsync(x => x.Id == id);
        Assert.NotNull(persisted.SubmittedAt); Assert.NotNull(persisted.ScoresJson);
    }

    [Fact]
    public async Task Student_projections_hide_keys_and_other_students_attempts_even_from_authors()
    {
        using var author = await Login(); using var student = await Login("student-a"); using var other = await Login("student-b");
        var s = await Create(author, "never"); var id = await Start(student, s);
        foreach (var path in new[] { "/questions", "/questions/" + s.Revisions[0], "/definitions/" + s.DefinitionRevision })
            Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync(Root + path)).StatusCode);
        var definitions = await student.GetStringAsync(Root + "/definitions");
        Assert.DoesNotContain("correctOptionIds", definitions); Assert.DoesNotContain("questionRevisionIds", definitions);
        foreach (var client in new[] { other, author })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Attempt(id))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s))).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync(Root + "/questions", s.Questions[0])).StatusCode);
        student.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s))).StatusCode);
        await Csrf(student);
        var result = await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s)));
        Assert.Null(result["scores"]); Assert.Null(result["fraction"]);
        Assert.Null((await student.GetFromJsonAsync<JsonObject>(Attempt(id)))!["scores"]);
    }

    [Fact]
    public async Task Concurrent_starts_deduplicate_and_enforce_limit_across_definition_revisions()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var s = await Create(author, maxAttempts: 1);
        var request = new StartAttemptRequest(s.DefinitionRevision, Guid.NewGuid());
        var starts = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => student.PostAsJsonAsync(Root + "/attempts", request)));
        Assert.Single(starts, x => x.StatusCode == HttpStatusCode.Created);
        var ids = await Task.WhenAll(starts.Select(async r => Id(await Success(r, r.StatusCode == HttpStatusCode.Created ? HttpStatusCode.Created : HttpStatusCode.OK))));
        Assert.Single(ids.Distinct());
        var next = await Success(await author.PostAsJsonAsync(Root + "/definitions", s.Definition with { Number = 2 }), HttpStatusCode.Created);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(Id(next), Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(Root + "/attempts", request with { DefinitionRevisionId = Id(next) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsJsonAsync(Root + "/attempts", request)).StatusCode);
        var second = await Create(author, maxAttempts: 1);
        var race = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(second.DefinitionRevision, Guid.NewGuid()))));
        Assert.Single(race, x => x.StatusCode == HttpStatusCode.Created); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Concurrent_deliveries_commit_one_result_and_one_set_of_evidence()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var s = await Create(author); var id = await Start(student, s);
        var same = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s))));
        Assert.All(same, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(3, await Events(id));
        id = await Start(student, s);
        var different = await Task.WhenAll(student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s)), student.PostAsJsonAsync(Attempt(id) + "/submit", new SubmitAttemptRequest([])));
        Assert.Single(different, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(different, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(3, await Events(id));
    }

    [Fact]
    public async Task Invalid_answers_rollback_and_expiration_is_server_controlled()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var s = await Create(author); var id = await Start(student, s);
        foreach (var answers in new[] { new SubmitAttemptRequest([new(Guid.NewGuid(), [])]), new([new(s.Revisions[0], [Guid.NewGuid()])]),
            new([new(s.Revisions[0], [s.Questions[0].Document.Options[0].Id, s.Questions[0].Document.Options[1].Id])]),
            new([new(s.Revisions[0], []), new(s.Revisions[0], [])]), new([new(s.Revisions[2], [s.Questions[2].Document.Options[0].Id, s.Questions[2].Document.Options[0].Id])]),
            new(null!), new([null!]), new([new(s.Revisions[0], null!)]) })
            Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsJsonAsync(Attempt(id) + "/submit", answers)).StatusCode);
        Assert.Equal(0, await Events(id));
        var now = fixture.Clock.Now;
        try
        {
            var a = await student.GetFromJsonAsync<JsonObject>(Attempt(id));
            fixture.Clock.Now = a!["expiresAt"]!.GetValue<DateTimeOffset>();
            Assert.Equal("expired", (await student.GetFromJsonAsync<JsonObject>(Attempt(id)))!["status"]!.GetValue<string>());
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s))).StatusCode);
            Assert.Equal(0, await Events(id));
        }
        finally { fixture.Clock.Now = now; }
        id = await Start(student, s);
        var all = new SubmitAttemptRequest(s.Revisions.Select((r, i) => new AnswerDocument(r, i == 2 ? s.Questions[i].Document.Options.Select(x => x.Id).ToArray() : [])).ToArray());
        var result = await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", all));
        Assert.Equal(0m, result["fraction"]!.GetValue<decimal>());
    }

    [Fact]
    public async Task Revisions_are_immutable_and_old_attempts_keep_their_questions_and_policy()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var s = await Create(author); var id = await Start(student, s);
        var old = s.Questions[0];
        var next = old with { Number = 2, Document = old.Document with { Prompt = "Nuevo enunciado", CorrectOptionIds = [old.Document.Options[1].Id] } };
        var revision = await Success(await author.PostAsJsonAsync(Root + "/questions", next), HttpStatusCode.Created);
        var d = s.Definition with { Number = 2, Document = s.Definition.Document with { QuestionRevisionIds = [Id(revision), s.Revisions[1], s.Revisions[2]], Feedback = "never" } };
        await Success(await author.PostAsJsonAsync(Root + "/definitions", d), HttpStatusCode.Created);
        Assert.DoesNotContain("Nuevo enunciado", await student.GetStringAsync(Attempt(id)));
        var result = await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s)));
        Assert.Equal(1m, result["fraction"]!.GetValue<decimal>());
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AssessmentDbContext>();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE assessments.revisions SET \"DocumentJson\" = '{{}}'::jsonb WHERE \"Id\" = {s.Revisions[0]}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM assessments.revisions WHERE \"Id\" = {s.DefinitionRevision}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE assessments.attempts SET \"StudentId\" = 'other' WHERE \"Id\" = {id}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM assessments.evidence_outbox WHERE \"AttemptId\" = {id}"));
    }

    [Fact]
    public async Task Authoring_validates_references_coverage_and_revision_races()
    {
        using var author = await Login(); var s = await Create(author);
        var q = s.Questions[0];
        foreach (var bad in new[] { q with { Id = Guid.Empty }, q with { Document = null! }, q with { Document = q.Document with { Type = "openResponse" } },
            q with { Document = q.Document with { CorrectOptionIds = [Guid.NewGuid()] } }, q with { Document = q.Document with { ObjectiveIds = [Guid.NewGuid()] } },
            q with { Document = q.Document with { ConceptIds = [Guid.NewGuid()] } }, q with { Document = q.Document with { UnitRevisionId = Guid.NewGuid() } } })
            Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(Root + "/questions", bad)).StatusCode);
        foreach (var d in new[] { s.Definition with { Document = s.Definition.Document with { QuestionRevisionIds = [] } },
            s.Definition with { Document = s.Definition.Document with { QuestionRevisionIds = [Guid.NewGuid()] } },
            s.Definition with { Document = s.Definition.Document with { ObjectiveIds = [Guid.NewGuid()] } },
            s.Definition with { Document = s.Definition.Document with { Assistance = "hint" } } })
            Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(Root + "/definitions", d)).StatusCode);
        var race = await Task.WhenAll(author.PostAsJsonAsync(Root + "/questions", q with { Number = 2 }), author.PostAsJsonAsync(Root + "/questions", q with { Number = 2 }));
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.Created); Assert.Single(race, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.GetAsync(Root + "/questions?limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.GetAsync(Root + "/definitions?offset=-1")).StatusCode);
    }
}
