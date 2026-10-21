using Azure;
using Azure.Security.KeyVault.Keys;

namespace AITeacher.Api.Infrastructure;

// Explicit migration-job step inside the VNet. Never executed by API startup.
public static class PrivateKeyBootstrap
{
    public static async Task Run(IConfiguration configuration)
    {
        var uri = new Uri(configuration["Bootstrap:KeyVaultUri"] ?? throw new InvalidOperationException("Configure Bootstrap:KeyVaultUri."));
        if (uri.Scheme != "https" || uri.Query.Length != 0 || !uri.Host.EndsWith(".vault.azure.net", StringComparison.Ordinal))
            throw new InvalidOperationException("Expected an Azure Key Vault HTTPS URI.");
        var client = new KeyClient(uri, AzureHosting.Credential(configuration));
        // A newly assigned RBAC role can take several minutes to propagate.
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                KeyVaultKey key;
                try { key = (await client.GetKeyAsync("dataprotection")).Value; }
                catch (RequestFailedException exception) when (exception.Status == 404)
                {
                    var options = new CreateRsaKeyOptions("dataprotection") { KeySize = 2048, ExpiresOn = DateTimeOffset.UtcNow.AddYears(1) };
                    options.KeyOperations.Add(KeyOperation.WrapKey);
                    options.KeyOperations.Add(KeyOperation.UnwrapKey);
                    key = (await client.CreateRsaKeyAsync(options)).Value;
                }
                if (key.KeyType != KeyType.Rsa || key.Key.N.Length != 256 || key.Properties.Enabled == false ||
                    !key.KeyOperations.Contains(KeyOperation.WrapKey) || !key.KeyOperations.Contains(KeyOperation.UnwrapKey))
                    throw new InvalidOperationException("Existing data protection key does not match the required RSA-2048 wrapping key.");
                var policy = new KeyRotationPolicy { ExpiresIn = "P365D" };
                policy.LifetimeActions.Add(new KeyRotationLifetimeAction(KeyRotationPolicyAction.Rotate) { TimeAfterCreate = "P90D" });
                await client.UpdateKeyRotationPolicyAsync("dataprotection", policy);
                Console.WriteLine("Private data protection key and rotation policy ready; existing key versions retained.");
                return;
            }
            catch (RequestFailedException exception) when (exception.Status == 403 && attempt < 30)
            {
                Console.WriteLine("Waiting for private Key Vault bootstrap RBAC propagation.");
                await Task.Delay(TimeSpan.FromSeconds(10));
            }
        }
    }
}
