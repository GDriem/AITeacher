using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Assessments;
using AITeacher.Modules.Curriculum.Publishing;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class CourseApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
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
    private static Guid Id(JsonObject row) => row["id"]!.GetValue<Guid>();
    private sealed record Quiz(Guid UnitId, Guid DefinitionRevision, Guid[] Questions, Guid[][] Correct, Guid[][] Wrong);

    private static UnitDocument UnitContent(string title)
    {
        var concept = Guid.NewGuid(); var objective = Guid.NewGuid();
        return new UnitDocument(title, [new(concept, "Concepto")], [new(objective, "Aplicar", [concept])],
            [new(Guid.NewGuid(), "Lectura", "Contenido", "Propia", [objective])], [new(Guid.NewGuid(), "Ejercicio", [objective])],
            [new(Guid.NewGuid(), "Evaluación", "PRIVADO", [objective])], []);
    }

    private static async Task<(Guid Subject, Guid Category)> Course(HttpClient author, string name)
    {
        var entry = new { name, slug = "course-" + Guid.NewGuid().ToString("N") };
        var subject = await Success(await author.PostAsJsonAsync("/api/catalog/subjects", entry), HttpStatusCode.Created);
        var category = await Success(await author.PostAsJsonAsync("/api/catalog/categories", new { subjectId = Id(subject), entry }), HttpStatusCode.Created);
        return (Id(subject), Id(category));
    }
    private static async Task<Quiz> Unit(HttpClient author, (Guid Subject, Guid Category) course, string title, string mode = "assessment", string feedback = "afterSubmission")
    {
        var entry = new { name = title, slug = "topic-" + Guid.NewGuid().ToString("N") };
        var topic = await Success(await author.PostAsJsonAsync("/api/catalog/topics", new { subjectId = course.Subject, categoryId = course.Category, entry }), HttpStatusCode.Created);
        var document = UnitContent(title);
        var c = document.Concepts[0].Id; var o = document.Objectives[0].Id;
        var unit = await Success(await author.PostAsJsonAsync("/api/units", new { topicId = Id(topic), document }), HttpStatusCode.Created);
        var ur = unit["revision"]!["id"]!.GetValue<Guid>();
        await Success(await author.PostAsJsonAsync($"/api/units/{Id(unit)}/revisions/{ur}/publish", new { version = 1 }));
        var questions = new List<Guid>(); var correct = new List<Guid[]>(); var wrong = new List<Guid[]>();
        for (var i = 0; i < 2; i++)
        {
            var options = Enumerable.Range(0, 2).Select(n => new OptionDocument(Guid.NewGuid(), "Opción " + n)).ToArray();
            var q = new QuestionRequest(Guid.NewGuid(), 1, new(Id(unit), ur, [o], [c], "singleChoice", "Pregunta " + i, options, [options[0].Id], "exactMatch"));
            questions.Add(Id(await Success(await author.PostAsJsonAsync("/api/assessments/questions", q), HttpStatusCode.Created)));
            correct.Add([options[0].Id]); wrong.Add([options[1].Id]);
        }
        var d = new DefinitionRequest(Guid.NewGuid(), 1, new("Quiz " + title, Id(unit), ur, [o], questions.ToArray(), mode, 10, 5, feedback, "none"));
        var dr = Id(await Success(await author.PostAsJsonAsync("/api/assessments/definitions", d), HttpStatusCode.Created));
        return new(Id(unit), dr, questions.ToArray(), correct.ToArray(), wrong.ToArray());
    }
    private static async Task Answer(HttpClient student, Quiz quiz, int right)
    {
        var attempt = Id(await Success(await student.PostAsJsonAsync("/api/assessments/attempts", new StartAttemptRequest(quiz.DefinitionRevision, Guid.NewGuid())), HttpStatusCode.Created));
        var answers = quiz.Questions.Select((q, i) => new AnswerDocument(q, i < right ? quiz.Correct[i] : quiz.Wrong[i])).ToArray();
        await Success(await student.PostAsJsonAsync($"/api/assessments/attempts/{attempt}/submit", new SubmitAttemptRequest(answers)));
    }
    private static async Task<JsonObject> Summary(HttpClient client, Guid subject) =>
        (await Success(await client.GetAsync("/api/learning/courses")))["items"]!.AsArray().Single(x => x!["subjectId"]!.GetValue<Guid>() == subject)!.AsObject();

    [Fact]
    public async Task A_quiz_from_a_previous_publication_does_not_make_a_unit_required()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var course = await Course(author, "Curso con revisión publicada");
        var current = await Unit(author, course, "Unidad con quiz vigente");
        var revised = await Unit(author, course, "Unidad que cambia de revisión");
        Assert.Equal(2, (await Summary(student, course.Subject))["unitCount"]!.GetValue<int>());

        var unitPath = $"/api/units/{revised.UnitId}";
        var revision = await Success(await author.PostAsJsonAsync($"{unitPath}/revisions", new { version = 2, document = UnitContent("Revisión sin quiz") }), HttpStatusCode.Created);
        var revisionId = Id(revision["revision"]!.AsObject());
        await Success(await author.PostAsJsonAsync($"{unitPath}/revisions/{revisionId}/publish", new { version = 3 }));

        await Answer(student, current, 2);
        var detail = await Success(await student.GetAsync($"/api/learning/courses/{course.Subject}"));
        var included = Assert.Single(detail["sections"]![0]!["units"]!.AsArray());
        Assert.Equal(current.UnitId, included!["unitId"]!.GetValue<Guid>());
        var certificate = await Success(await student.PostAsync($"/api/learning/courses/{course.Subject}/certificate", null), HttpStatusCode.Created);
        Assert.Equal(1, certificate["unitCount"]!.GetValue<int>());
    }

    [Fact]
    public async Task Concurrent_enrollment_changes_return_success()
    {
        using var author = await Login(); using var student = await Login("student-a");
        var course = await Course(author, "Curso con inscripción simultánea");
        await Unit(author, course, "Unidad de prueba");
        var path = $"/api/learning/courses/{course.Subject}/enrollment";

        await Success(await student.PutAsync(path, null));
        for (var i = 0; i < 10; i++)
        {
            var enroll = student.PutAsync(path, null);
            var leave = student.DeleteAsync(path);
            await Task.WhenAll(enroll, leave);
            var enrollment = await Success(await enroll);
            Assert.Equal(course.Subject, enrollment["subjectId"]!.GetValue<Guid>());
            Assert.Equal(HttpStatusCode.NoContent, (await leave).StatusCode);
        }
    }

    [Fact]
    public async Task Progress_counts_units_passed_with_graded_quizzes_and_unlocks_a_verifiable_certificate()
    {
        using var author = await Login(); using var student = await Login("student-a"); using var other = await Login("student-b");
        var course = await Course(author, "Curso de prueba");
        var first = await Unit(author, course, "Unidad 1"); var second = await Unit(author, course, "Unidad 2");
        // Practice and hidden-score tests never block a course: their units stay out of the count.
        await Unit(author, course, "Práctica", mode: "practice");
        await Unit(author, course, "Oculta", feedback: "never");

        var summary = await Summary(student, course.Subject);
        Assert.Equal(2, summary["unitCount"]!.GetValue<int>());
        Assert.Equal(0, summary["percent"]!.GetValue<int>());
        Assert.Null(summary["enrolledAt"]);
        Assert.Contains("no-store", (await student.GetAsync("/api/learning/courses")).Headers.CacheControl!.ToString());

        var enrolled = await Success(await student.PutAsync($"/api/learning/courses/{course.Subject}/enrollment", null));
        fixture.Clock.Now = fixture.Clock.Now.AddMinutes(1);
        Assert.Equal(enrolled.ToJsonString(), (await Success(await student.PutAsync($"/api/learning/courses/{course.Subject}/enrollment", null))).ToJsonString());
        Assert.NotNull((await Summary(student, course.Subject))["enrolledAt"]);
        Assert.Equal(HttpStatusCode.NotFound, (await student.PutAsync($"/api/learning/courses/{Guid.NewGuid()}/enrollment", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/learning/courses/{course.Subject}/certificate", null)).StatusCode);

        // 1 of 2 right is 50 %: started, but below the passing mark.
        await Answer(student, first, 1);
        var detail = await Success(await student.GetAsync($"/api/learning/courses/{course.Subject}"));
        var units = detail["sections"]![0]!["units"]!.AsArray();
        Assert.Equal("inProgress", units[0]!["status"]!.GetValue<string>());
        Assert.Equal(50, units[0]!["bestPercent"]!.GetValue<int>());
        Assert.Equal(first.UnitId, detail["nextUnitId"]!.GetValue<Guid>());
        Assert.Equal(70, detail["passingPercent"]!.GetValue<int>());

        await Answer(student, first, 2);
        detail = await Success(await student.GetAsync($"/api/learning/courses/{course.Subject}"));
        Assert.Equal("completed", detail["sections"]![0]!["units"]![0]!["status"]!.GetValue<string>());
        Assert.Equal(50, detail["course"]!["percent"]!.GetValue<int>());
        Assert.Equal(second.UnitId, detail["nextUnitId"]!.GetValue<Guid>());

        await Answer(student, second, 2);
        var certificate = await Success(await student.PostAsync($"/api/learning/courses/{course.Subject}/certificate", null), HttpStatusCode.Created);
        var code = certificate["code"]!.GetValue<string>();
        Assert.Matches("^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$", code);
        Assert.Equal("Student A", certificate["studentName"]!.GetValue<string>());
        Assert.Equal(100, certificate["averagePercent"]!.GetValue<int>());
        Assert.Equal(code, (await Success(await student.PostAsync($"/api/learning/courses/{course.Subject}/certificate", null)))["code"]!.GetValue<string>());
        Assert.Equal(100, (await Summary(student, course.Subject))["percent"]!.GetValue<int>());
        Assert.Equal(code, (await Success(await student.GetAsync("/api/learning/certificates")))["items"]![0]!["code"]!.GetValue<string>());

        // Anyone can verify a code, case-insensitively, without seeing scores.
        using var anonymous = fixture.Host.CreateClient();
        var verified = await Success(await anonymous.GetAsync($"/api/certificates/{code.ToLowerInvariant()}"));
        Assert.Equal("Curso de prueba", verified["courseName"]!.GetValue<string>());
        Assert.Null(verified["averagePercent"]);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/certificates/AAAA-AAAA-AAAA")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/learning/courses")).StatusCode);

        // Progress, enrollments and certificates are private to each student.
        var others = await Summary(other, course.Subject);
        Assert.Equal(0, others["percent"]!.GetValue<int>());
        Assert.Null(others["certificate"]);
        Assert.Empty((await Success(await other.GetAsync("/api/learning/certificates")))["items"]!.AsArray());

        // Leaving the course keeps the diploma.
        Assert.Equal(HttpStatusCode.NoContent, (await student.DeleteAsync($"/api/learning/courses/{course.Subject}/enrollment")).StatusCode);
        summary = await Summary(student, course.Subject);
        Assert.Null(summary["enrolledAt"]);
        Assert.Equal(code, summary["certificate"]!["code"]!.GetValue<string>());
    }
}
