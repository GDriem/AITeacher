using AITeacher.Api.Features.Learning;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Assessments;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class AdvancedAssessmentApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
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
    public async Task Attempt_lists_preserve_ownership_feedback_and_author_boundaries()
    {
        using var author = await Login(); using var student = await Login("student-a"); using var other = await Login("student-b");
        using var anonymous = fixture.Host.CreateClient();
        var setup = await Create(author, "never");
        var mine = await Start(student, setup); var theirs = await Start(other, setup);
        var response = await student.GetAsync(Root + "/attempts?limit=100");
        Assert.True(response.Headers.CacheControl?.NoStore);
        var page = await Success(response);
        var rows = page["items"]!.AsArray().Select(x => x!.AsObject()).ToArray();
        Assert.Contains(rows, x => Id(x) == mine);
        Assert.DoesNotContain(rows, x => Id(x) == theirs);
        foreach (var row in rows)
        {
            Assert.Equal(8, row.Count);
            Assert.Null(row["answers"]); Assert.Null(row["scores"]); Assert.Null(row["fraction"]); Assert.Null(row["studentId"]);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Root + "/attempts")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync(Root + "/submissions")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await student.GetAsync(Root + "/attempts?offset=-1")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.GetAsync(Root + "/submissions?limit=101")).StatusCode);
        await Success(await student.PostAsJsonAsync(Attempt(mine) + "/submit", Correct(setup)));
        var submissions = await Success(await author.GetAsync(Root + "/submissions?limit=100"));
        var submitted = submissions["items"]!.AsArray().Select(x => x!.AsObject()).ToArray();
        Assert.Contains(submitted, x => Id(x) == mine && x["status"]!.GetValue<string>() == "submitted");
        Assert.DoesNotContain(submitted, x => Id(x) == theirs);
        var text = submissions.ToJsonString();
        Assert.DoesNotContain("PRIVATE-EDITORIAL", text); Assert.DoesNotContain("correctOptionIds", text); Assert.DoesNotContain("fraction", text);
        var first = await student.GetStringAsync(Root + "/attempts?limit=1");
        Assert.Equal(first, await student.GetStringAsync(Root + "/attempts?limit=1"));
    }

    [Theory]
    [InlineData("openResponse", "afterSubmission")]
    [InlineData("caseAnalysis", "afterSubmission")]
    [InlineData("practicalExercise", "never")]
    public async Task Rubric_review_is_private_atomic_idempotent_and_preserves_snapshots(string type, string feedback)
    {
        using var author = await Login(); using var student = await Login("student-a"); using var other = await Login("student-b");
        var s = await Create(author, feedback);
        var rubric = new RubricDocument(1, [new(Guid.NewGuid(), "Justificar", 3), new(Guid.NewGuid(), "Aplicar", 1)], "PRIVATE-RUBRIC");
        var q = s.Questions[0] with { Id = Guid.NewGuid(), Document = s.Questions[0].Document with {
            Type = type, Options = [], CorrectOptionIds = [], ScoringPolicy = "rubric", Rubric = rubric } };
        var qr = Id(await Success(await author.PostAsJsonAsync(Root + "/questions", q), HttpStatusCode.Created));
        var d = s.Definition with { Id = Guid.NewGuid(), Document = s.Definition.Document with { QuestionRevisionIds = [s.Revisions[0], qr] } };
        var dr = Id(await Success(await author.PostAsJsonAsync(Root + "/definitions", d), HttpStatusCode.Created));
        var id = Id(await Success(await student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(dr, Guid.NewGuid())), HttpStatusCode.Created));
        Assert.DoesNotContain("PRIVATE-RUBRIC", await student.GetStringAsync(Attempt(id)));
        var path = Attempt(id) + "/review";
        Assert.Equal(HttpStatusCode.Conflict, (await author.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync(path)).StatusCode);
        var answer = new SubmitAttemptRequest([new(s.Revisions[0], s.Questions[0].Document.CorrectOptionIds), new(qr, [], "Mi justificación")]);
        Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsJsonAsync(Attempt(id) + "/submit", answer with { Answers = [new(qr, [Guid.NewGuid()], "Texto")] })).StatusCode);
        var pending = await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", answer));
        Assert.Equal("pendingReview", pending["status"]!.GetValue<string>()); Assert.Null(pending["fraction"]); Assert.Equal(0, await Events(id));
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Attempt(id))).StatusCode);
        var review = new ReviewRequest(Guid.NewGuid(), [new(qr, [new(rubric.Criteria[0].Id, 2), new(rubric.Criteria[1].Id, 1)], "Feedback docente")]);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync(path, review)).StatusCode);
        var bad = review with { Grades = [review.Grades[0] with { Criteria = [new(rubric.Criteria[0].Id, 4), new(rubric.Criteria[1].Id, 1)] }] };
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(path, bad)).StatusCode); Assert.Equal(0, await Events(id));
        // A later editorial revision cannot change the rubric fixed by this attempt.
        await Success(await author.PostAsJsonAsync(Root + "/questions", q with { Number = 2, Document = q.Document with { Rubric = rubric with { Version = 2, Criteria = [new(Guid.NewGuid(), "Nueva", 100)] } } }), HttpStatusCode.Created);
        var race = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => author.PostAsJsonAsync(path, review)));
        var results = await Task.WhenAll(race.Select(r => Success(r)));
        Assert.Single(results.Select(r => r["reviewId"]!.GetValue<Guid>()).Distinct());
        Assert.Equal(2, await Events(id));
        Assert.Equal(HttpStatusCode.Conflict, (await author.PostAsJsonAsync(path, review with { RequestId = Guid.NewGuid() })).StatusCode);
        var result = await Success(await student.GetAsync(Attempt(id)));
        Assert.Equal("submitted", result["status"]!.GetValue<string>());
        if (feedback == "never") { Assert.Null(result["scores"]); Assert.Null(result["fraction"]); Assert.DoesNotContain("Feedback docente", result.ToJsonString()); }
        else { Assert.Equal(0.875m, result["fraction"]!.GetValue<decimal>()); Assert.Equal("Feedback docente", result["scores"]![1]!["feedback"]!.GetValue<string>()); }
        Assert.DoesNotContain("PRIVATE-RUBRIC", result.ToJsonString());
        Assert.Equal(result.ToJsonString(), (await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", answer))).ToJsonString());
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AssessmentDbContext>();
        var persisted = await db.Reviews.SingleAsync(x => x.AttemptId == id);
        Assert.Single(System.Text.Json.JsonSerializer.Deserialize<ScoreDocument[]>((await db.Attempts.SingleAsync(x => x.Id == id)).ScoresJson!, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM assessments.reviews WHERE \"Id\" = {persisted.Id}"));
        author.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(path, review)).StatusCode);
    }

    private sealed class FailedAck(IAssessmentEvidenceFeed inner) : IAssessmentEvidenceFeed
    {
        public Task<EvidenceMessage[]> Pending(CancellationToken ct) => inner.Pending(ct);
        public Task Acknowledge(Guid id, CancellationToken ct) => throw new IOException("Simulated crash before acknowledgement");
        public Task<bool> Covers(Guid d, Guid r, Guid c, CancellationToken ct) => inner.Covers(d, r, c, ct);
        public Task<bool> Completed(Guid a, string s, Guid d, DateTimeOffset t, CancellationToken ct) => inner.Completed(a, s, d, t, ct);
    }
    [Fact]
    public async Task Evidence_consumer_recovers_after_failed_ack_and_reviews_require_new_graded_attempts()
    {
        // Preserve a sub-microsecond component even on clocks with coarser resolution.
        fixture.Clock.Now = fixture.Clock.Now.AddTicks(7 - fixture.Clock.Now.Ticks % 10);
        using var author = await Login(); using var student = await Login("student-a"); using var other = await Login("student-b");
        var s = await Create(author, feedback: "never"); var id = await Start(student, s);
        await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", Correct(s)));
        using (var scope = fixture.Host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LearningDbContext>();
            var feed = scope.ServiceProvider.GetRequiredService<IAssessmentEvidenceFeed>();
            await Assert.ThrowsAsync<IOException>(() => new LearningService(db, new FailedAck(feed), fixture.Clock).Consume(default));
        }
        async Task Consume()
        {
            using var scope = fixture.Host.Services.CreateScope();
            while (await scope.ServiceProvider.GetRequiredService<LearningService>().Consume(default) == 100) { }
        }
        await Task.WhenAll(Consume(), Consume()); await Consume();
        var evidence = await Success(await student.GetAsync("/api/learning/evidence?limit=100"));
        var rows = evidence["items"]!.AsArray().Where(x => x!["attemptId"]!.GetValue<Guid>() == id).ToArray();
        Assert.Equal(3, rows.Length); Assert.DoesNotContain("fraction", evidence.ToJsonString()); Assert.DoesNotContain("payloadJson", evidence.ToJsonString());
        var concepts = await Success(await student.GetAsync("/api/learning/concepts"));
        Assert.All(concepts["items"]!.AsArray(), x => Assert.Equal("uncalibrated", x!["masteryStatus"]!.GetValue<string>()));
        var evidenceId = rows[0]!["id"]!.GetValue<Guid>();
        var request = new ScheduleReview(Guid.NewGuid(), evidenceId, s.DefinitionRevision, fixture.Clock.Now.AddDays(1));
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync("/api/learning/reviews", request)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsJsonAsync("/api/learning/reviews", request with { DefinitionRevisionId = Guid.NewGuid() })).StatusCode);
        var created = await Success(await student.PostAsJsonAsync("/api/learning/reviews", request), HttpStatusCode.Created);
        var review = Id(created); var path = $"/api/learning/reviews/{review}/complete";
        Assert.Equal(created.ToJsonString(), (await Success(await student.PostAsJsonAsync("/api/learning/reviews", request))).ToJsonString());
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync("/api/learning/reviews", request with { DueAt = request.DueAt.AddHours(1) })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(path, new CompleteReview(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(id))).StatusCode);
        var now = fixture.Clock.Now;
        try
        {
            fixture.Clock.Now = request.DueAt;
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(id))).StatusCode);
            var next = await Start(student, s);
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(next))).StatusCode);
            await Success(await student.PostAsJsonAsync(Attempt(next) + "/submit", Correct(s)));
            await Success(await student.PostAsJsonAsync(path, new CompleteReview(next)));
            await Success(await student.PostAsJsonAsync(path, new CompleteReview(next)));
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(id))).StatusCode);
            using var scope = fixture.Host.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<LearningDbContext>();
            Assert.Equal(3, await db.Evidence.CountAsync(x => x.AttemptId == id));
            await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM learning.evidence WHERE \"Id\" = {evidenceId}"));
            await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM learning.reviews WHERE \"Id\" = {review}"));
        }
        finally { fixture.Clock.Now = now; }
        Assert.Equal(HttpStatusCode.BadRequest, (await student.GetAsync("/api/learning/evidence?limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await student.GetAsync("/api/learning/concepts?offset=-1")).StatusCode);
        student.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsJsonAsync("/api/learning/reviews", request)).StatusCode);
    }

    [Fact]
    public async Task Rubric_validation_omitted_answers_and_conflicting_review_races()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var s = await Create(author);
        var rubric = new RubricDocument(1, [new(Guid.NewGuid(), "Aplicar", 2)], "PRIVATE");
        var q = s.Questions[0] with { Id = Guid.NewGuid(), Document = s.Questions[0].Document with {
            Type = "caseAnalysis", Options = [], CorrectOptionIds = [], ScoringPolicy = "rubric", Rubric = rubric } };
        foreach (var bad in new[] { q with { Document = q.Document with { Rubric = null } },
            q with { Document = q.Document with { Rubric = rubric with { Criteria = [new(Guid.NewGuid(), "Cero", 0)] } } },
            q with { Document = q.Document with { Rubric = rubric with { Criteria = [rubric.Criteria[0], rubric.Criteria[0]] } } },
            q with { Document = q.Document with { Options = s.Questions[0].Document.Options } },
            q with { Document = q.Document with { CorrectOptionIds = [Guid.NewGuid()] } } })
            Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(Root + "/questions", bad)).StatusCode);
        var qr = Id(await Success(await author.PostAsJsonAsync(Root + "/questions", q), HttpStatusCode.Created));
        var d = s.Definition with { Id = Guid.NewGuid(), Document = s.Definition.Document with { QuestionRevisionIds = [qr] } };
        var dr = Id(await Success(await author.PostAsJsonAsync(Root + "/definitions", d), HttpStatusCode.Created));
        var id = Id(await Success(await student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(dr, Guid.NewGuid())), HttpStatusCode.Created));
        var empty = new SubmitAttemptRequest([]);
        await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", empty));
        await Success(await student.PostAsJsonAsync(Attempt(id) + "/submit", new SubmitAttemptRequest([new(qr, [], "")])));
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(Attempt(id) + "/submit", new SubmitAttemptRequest([new(qr, [], "Cambio")]))).StatusCode);
        var review = new ReviewRequest(Guid.NewGuid(), [new(qr, [new(rubric.Criteria[0].Id, 0)], "Sin respuesta")]);
        var different = review with { RequestId = Guid.NewGuid(), Grades = [review.Grades[0] with { Feedback = "Otra revisión" }] };
        var race = await Task.WhenAll(author.PostAsJsonAsync(Attempt(id) + "/review", review), author.PostAsJsonAsync(Attempt(id) + "/review", different));
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(race, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await Events(id));
        var result = await Success(await student.GetAsync(Attempt(id))); Assert.Equal(0m, result["fraction"]!.GetValue<decimal>());
    }

}
