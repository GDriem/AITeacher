using Npgsql;

namespace AITeacher.Api.Infrastructure;

// Run explicitly with the migration-owner identity AFTER --migrate; never on API startup.
public static class RuntimeDatabaseAccess
{
    private static readonly string[] Schemas = ["identity", "curriculum", "content", "assessments", "conversations", "graphs", "learning", "history"];

    public static string Identifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || System.Text.Encoding.UTF8.GetByteCount(value) > 63 || value.Contains('\0'))
            throw new InvalidOperationException("PostgreSQL identifiers must contain 1–63 UTF-8 bytes and no NUL.");
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }

    public static string Grants(string database, string runtime)
    {
        var role = Identifier(runtime);
        return $"GRANT CONNECT ON DATABASE {Identifier(database)} TO {role};\n" +
            string.Join("\n", Schemas.Select(schema => $"""
                GRANT USAGE ON SCHEMA "{schema}" TO {role};
                GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "{schema}" TO {role};
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "{schema}" TO {role};
                ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role};
                ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema}" GRANT USAGE, SELECT ON SEQUENCES TO {role};
                """));
    }

    public static async Task Grant(PostgresConnections connections, IConfiguration configuration)
    {
        if (!configuration.GetValue("Database:UseManagedIdentity", false))
            throw new InvalidOperationException("Runtime principal provisioning requires managed identity mode.");
        var name = configuration["Database:RuntimePrincipalName"] ?? "";
        _ = Identifier(name);
        if (!Guid.TryParse(configuration["Database:RuntimePrincipalObjectId"], out var objectId))
            throw new InvalidOperationException("Database:RuntimePrincipalObjectId must be a GUID.");
        var owner = new NpgsqlConnectionStringBuilder(connections.Pooled.ConnectionString).Username;
        if (string.Equals(name, owner, StringComparison.Ordinal))
            throw new InvalidOperationException("Runtime and migration identities must differ.");
        await using (var source = connections.ForDatabase("postgres"))
        await using (var admin = await source.OpenConnectionAsync())
        {
            // Parameterized role/OID data; an existing different mapping must never be silently reused.
            await using var check = new NpgsqlCommand("""
                SELECT COALESCE(to_jsonb(p)->>'objectid', to_jsonb(p)->>'objectId')
                FROM pg_catalog.pgaadauth_list_principals(false) p
                WHERE COALESCE(to_jsonb(p)->>'rolename', to_jsonb(p)->>'rolname') = @name
                """, admin);
            check.Parameters.AddWithValue("name", name);
            var existing = await check.ExecuteScalarAsync();
            if (existing is null)
            {
                await using var create = new NpgsqlCommand("SELECT pg_catalog.pgaadauth_create_principal_with_oid(@name, @oid, 'service', false, false)", admin);
                create.Parameters.AddWithValue("name", name);
                create.Parameters.AddWithValue("oid", objectId.ToString());
                await create.ExecuteNonQueryAsync();
            }
            else if (!Guid.TryParse(existing.ToString(), out var actual) || actual != objectId)
                throw new InvalidOperationException("Existing PostgreSQL role has a different Entra object ID.");
        }
        await using var app = await connections.Pooled.OpenConnectionAsync();
        await using var transaction = await app.BeginTransactionAsync();
        // The same migration owner creates the tables and grants future object privileges.
        await using var grant = new NpgsqlCommand(Grants(app.Database, name), app, transaction);
        await grant.ExecuteNonQueryAsync();
        await transaction.CommitAsync();
        Console.WriteLine("Runtime database permissions granted.");
    }
}
