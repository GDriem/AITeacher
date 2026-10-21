using AITeacher.Api.Features.Learning;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.Json;
using AITeacher.Api.Features.Assessments;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class HistoricalReviewApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
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
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Historical_review_survives_R2_publication_and_requires_its_exact_graded_R1_attempt(bool open)
    {
        using var author = await Login(); using var student = await Login("student-a"); using var other = await Login("student-b");
        var setup = await Create(author, maxAttempts: 2);
        var rubric = new RubricDocument(1, [new(Guid.NewGuid(), "Justificar", 1)], "PRIVATE-R1");
        var question = setup.Questions[0] with { Id = Guid.NewGuid(), Document = setup.Questions[0].Document with {
            Type = "openResponse", Options = [], CorrectOptionIds = [], ScoringPolicy = "rubric", Rubric = rubric } };
        var qr = open ? Id(await Success(await author.PostAsJsonAsync(Root + "/questions", question), HttpStatusCode.Created)) : setup.Revisions[0];
        var definition = setup.Definition with { Id = Guid.NewGuid(), Document = setup.Definition.Document with { QuestionRevisionIds = [qr] } };
        var dr = Id(await Success(await author.PostAsJsonAsync(Root + "/definitions", definition), HttpStatusCode.Created));
        var answers = new SubmitAttemptRequest([open ? new(qr, [], "Justificación R1") : new(qr, setup.Questions[0].Document.CorrectOptionIds)]);
        async Task Grade(Guid id)
        {
            await Success(await author.PostAsJsonAsync(Attempt(id) + "/review", new ReviewRequest(Guid.NewGuid(),
                [new(qr, [new(rubric.Criteria[0].Id, 1)], "Correcto con R1")])));
        }
        var initial = Id(await Success(await student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(dr, Guid.NewGuid())), HttpStatusCode.Created));
        await Success(await student.PostAsJsonAsync(Attempt(initial) + "/submit", answers));
        if (open) await Grade(initial);
        using (var scope = fixture.Host.Services.CreateScope())
            while (await scope.ServiceProvider.GetRequiredService<LearningService>().Consume(default) == 100) { }
        var evidence = (await Success(await student.GetAsync("/api/learning/evidence?limit=100")))["items"]!.AsArray()
            .Single(e => e!["attemptId"]!.GetValue<Guid>() == initial)!;
        var schedule = new ScheduleReview(Guid.NewGuid(), evidence["id"]!.GetValue<Guid>(), dr, fixture.Clock.Now.AddDays(1));
        var scheduled = await Success(await student.PostAsJsonAsync("/api/learning/reviews", schedule), HttpStatusCode.Created);
        var path = $"/api/learning/reviews/{Id(scheduled)}/complete";
        var second = await Success(await student.PostAsJsonAsync("/api/learning/reviews", schedule with { RequestId = Guid.NewGuid() }), HttpStatusCode.Created);

        var unit = await Success(await author.GetAsync($"/api/units/{setup.UnitId}"));
        var document = unit["revision"]!["document"]!.Deserialize<UnitDocument>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var r2 = await Success(await author.PostAsJsonAsync($"/api/units/{setup.UnitId}/revisions", new { version = unit["version"]!.GetValue<long>(), document = document with { Title = "Unidad R2" } }), HttpStatusCode.Created);
        var r2id = r2["revision"]!["id"]!.GetValue<Guid>();
        await Success(await author.PostAsJsonAsync($"/api/units/{setup.UnitId}/revisions/{r2id}/publish", new { version = r2["version"]!.GetValue<long>() }));
        var r2question = setup.Questions[0] with { Id = Guid.NewGuid(), Document = setup.Questions[0].Document with { UnitRevisionId = r2id } };
        var r2qr = Id(await Success(await author.PostAsJsonAsync(Root + "/questions", r2question), HttpStatusCode.Created));
        var r2definition = definition with { Id = Guid.NewGuid(), Document = definition.Document with { UnitRevisionId = r2id, QuestionRevisionIds = [r2qr] } };
        var r2dr = Id(await Success(await author.PostAsJsonAsync(Root + "/definitions", r2definition), HttpStatusCode.Created));
        Assert.Equal(r2id, (await Success(await student.GetAsync($"/api/units/{setup.UnitId}")))["revision"]!["id"]!.GetValue<Guid>());
        var now = fixture.Clock.Now;
        try
        {
            fixture.Clock.Now = scheduled["dueAt"]!.GetValue<DateTimeOffset>();
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(initial))).StatusCode);
            var wrong = Id(await Success(await student.PostAsJsonAsync(Root + "/attempts", new StartAttemptRequest(r2dr, Guid.NewGuid())), HttpStatusCode.Created));
            await Success(await student.PostAsJsonAsync(Attempt(wrong) + "/submit", new SubmitAttemptRequest([new(r2qr, r2question.Document.CorrectOptionIds)])));
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(wrong))).StatusCode);
            var start = new StartAttemptRequest(dr, Guid.NewGuid());
            var historical = await Success(await student.PostAsJsonAsync(Root + "/attempts", start), HttpStatusCode.Created);
            var next = Id(historical);
            Assert.Equal(dr, historical["definitionRevisionId"]!.GetValue<Guid>());
            Assert.Equal(next, Id(await Success(await student.PostAsJsonAsync(Root + "/attempts", start))));
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(Root + "/attempts", start with { RequestId = Guid.NewGuid() })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(next))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Attempt(next))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(path, new CompleteReview(next))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync(Attempt(next) + "/review", new ReviewRequest(Guid.NewGuid(), []))).StatusCode);
            await Success(await student.PostAsJsonAsync(Attempt(next) + "/submit", answers));
            if (open)
            {
                Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync(path, new CompleteReview(next))).StatusCode);
                await Grade(next);
            }
            var completed = await Success(await student.PostAsJsonAsync(path, new CompleteReview(next)));
            Assert.Equal(next, completed["completedAttemptId"]!.GetValue<Guid>());
            Assert.Equal(dr, completed["definitionRevisionId"]!.GetValue<Guid>());
            await Success(await student.PostAsJsonAsync(path, new CompleteReview(next)));
            Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsJsonAsync($"/api/learning/reviews/{Id(second)}/complete", new CompleteReview(next))).StatusCode);
        }
        finally { fixture.Clock.Now = now; }
    }

}
