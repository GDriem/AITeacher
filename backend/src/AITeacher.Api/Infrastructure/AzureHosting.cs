using Azure.Core;
using Azure.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Npgsql;

namespace AITeacher.Api.Infrastructure;

public static class AzureHosting
{
    public static TokenCredential Credential(IConfiguration configuration)
    {
        if (!Guid.TryParse(configuration["Azure:ManagedIdentityClientId"], out var clientId))
            throw new InvalidOperationException("Azure:ManagedIdentityClientId must identify an explicitly assigned managed identity.");
        return new ManagedIdentityCredential(ManagedIdentityId.FromUserAssignedClientId(clientId.ToString()));
    }

    public static void AddAzureHosting(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var connection = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Configure ConnectionStrings:Postgres.");
        var managed = configuration.GetValue("Database:UseManagedIdentity", false);
        PostgresConnections.Validate(connection, managed);
        TokenCredential? credential = managed ? Credential(configuration) : null;
        services.AddSingleton(_ => new PostgresConnections(connection, credential));
        services.Configure<ForwardedHeadersOptions>(options => ConfigureProxy(options,
            configuration.GetSection("Proxy:KnownNetworks").Get<string[]>() ?? []));

        var blob = configuration["DataProtection:BlobUri"];
        var key = configuration["DataProtection:KeyIdentifier"];
        if (blob is not null || key is not null)
        {
            if (!Uri.TryCreate(blob, UriKind.Absolute, out var blobUri) || blobUri.Scheme != "https" ||
                !Uri.TryCreate(key, UriKind.Absolute, out var keyUri) || keyUri.Scheme != "https" ||
                blobUri.Query.Length != 0 || keyUri.Query.Length != 0)
                throw new InvalidOperationException("Configure HTTPS DataProtection:BlobUri and DataProtection:KeyIdentifier without credentials.");
            credential ??= Credential(configuration);
            services.AddDataProtection().SetApplicationName("AITeacher")
                .PersistKeysToAzureBlobStorage(blobUri, credential)
                .ProtectKeysWithAzureKeyVault(keyUri, credential);
        }
    }

    public static void ConfigureProxy(ForwardedHeadersOptions options, string[] networks)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;
        // Explicit networks only; preserve loopback defaults when no Azure proxy is configured.
        if (networks.Length == 0) return;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
        foreach (var network in networks) options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
    }
}

public sealed class PostgresConnections : IAsyncDisposable
{
    private readonly TokenCredential? credential;
    public NpgsqlDataSource Pooled { get; }
    public NpgsqlDataSource Unpooled { get; }

    public PostgresConnections(string connection, TokenCredential? credential)
    {
        this.credential = credential;
        Validate(connection, credential is not null);
        Pooled = Build(connection, credential);
        var unpooled = new NpgsqlConnectionStringBuilder(connection) { Pooling = false, KeepAlive = 30 };
        Unpooled = Build(unpooled.ConnectionString, credential);
    }

    public static void Validate(string connection, bool managed)
    {
        var settings = new NpgsqlConnectionStringBuilder(connection);
        if (managed && (settings.SslMode != SslMode.VerifyFull || !string.IsNullOrEmpty(settings.Password) ||
            !string.IsNullOrEmpty(settings.Passfile) || string.IsNullOrWhiteSpace(settings.Username) ||
            string.IsNullOrWhiteSpace(settings.Host) || string.IsNullOrWhiteSpace(settings.Database)))
            throw new InvalidOperationException("Managed PostgreSQL requires host, database, username, SSL Mode=VerifyFull and no password/passfile.");
    }

    public NpgsqlDataSource ForDatabase(string database) => Build(new NpgsqlConnectionStringBuilder(Pooled.ConnectionString) { Database = database }.ConnectionString, credential);

    private static NpgsqlDataSource Build(string connection, TokenCredential? credential)
    {
        var builder = new NpgsqlDataSourceBuilder(connection);
        if (credential is not null)
            builder.UsePasswordProvider(_ => throw new NotSupportedException("Use asynchronous database connections."),
                async (_, cancellation) => (await credential.GetTokenAsync(
                    new TokenRequestContext(["https://ossrdbms-aad.database.windows.net/.default"]), cancellation)).Token);
        return builder.Build();
    }

    public async ValueTask DisposeAsync()
    {
        await Pooled.DisposeAsync();
        await Unpooled.DisposeAsync();
    }
}
