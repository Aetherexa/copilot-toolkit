# VS Code Marketplace release with Microsoft Entra ID

Copilot Toolkit uses GitHub Actions OIDC and Microsoft Entra workload identity federation for Marketplace publishing. No long-lived Visual Studio Marketplace PAT is required.

## Release trust chain

```text
GitHub release environment
        ↓ OIDC
Microsoft Entra workload identity
        ↓ short-lived token
Visual Studio Marketplace publisher
        ↓
vsce publish --azure-credential
```

The Marketplace publisher remains:

```text
imsp-vibe-Coder-2596
```

Keeping that publisher ID updates the existing Marketplace listing even though the source repository now belongs to the Aetherexa GitHub organization.

## One-time Microsoft Entra setup

### 1. Create a user-assigned managed identity

Create a dedicated identity for Marketplace publishing, for example:

```text
copilot-toolkit-marketplace-publisher
```

Place it in an Azure subscription/resource group controlled by the project owner. Microsoft's VS Code publishing guidance uses a user-assigned managed identity with Reader access and recommends Microsoft Entra authentication plus workload identity federation instead of global Azure DevOps PATs. Global Azure DevOps PATs are scheduled for retirement on December 1, 2026.

Record:

- client ID;
- tenant ID;
- subscription ID.

### 2. Create the GitHub federated identity credential

Create a federated credential on the managed identity for this repository and the GitHub environment:

```text
repository: Aetherexa/copilot-toolkit
environment: marketplace-production
```

Use the exact GitHub OIDC subject expected for the repository/environment. GitHub introduced immutable repository/owner identifiers in OIDC subjects in 2026, so prefer the current GitHub/Azure configuration flow instead of copying an old name-only `sub` value from older examples.

The federated credential must trust GitHub's token issuer and the Azure token-exchange audience used by `azure/login`.

### 3. Authorize the identity in Visual Studio Marketplace

Authenticate as the managed identity in an Azure CLI context and resolve its Azure DevOps/Marketplace profile identity:

```bash
az rest \
  -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me \
  --resource 499b84ac-1321-427f-aa17-267ca6975798
```

Capture the returned profile `id`.

In Visual Studio Marketplace publisher management:

1. open publisher `imsp-vibe-Coder-2596`;
2. add the managed identity/profile ID as a member;
3. grant the minimum role that can publish extensions (Contributor in Microsoft's documented flow).

### 4. Create the protected GitHub environment

Create:

```text
marketplace-production
```

Recommended protection:

- restrict deployments to version tags;
- require a maintainer approval before deployment;
- keep Marketplace identity values scoped to this environment.

Add these environment secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

There is intentionally no `VSCE_PAT` secret. The workflow also pins Azure Identity to `AzureCliCredential` after `azure/login@v3`, so the publisher step cannot silently fall through to an unrelated interactive credential.

## Publishing

The release workflow:

1. checks out the version tag;
2. verifies the tag matches `package.json`;
3. compiles and type-checks extension + webview;
4. runs coverage gates;
5. audits runtime dependencies;
6. packages and verifies the VSIX;
7. authenticates to Microsoft Entra with `azure/login@v3`;
8. verifies Marketplace publisher rights with `vsce ... --azure-credential`;
9. publishes the exact validated VSIX;
10. creates a SHA-256 checksum and matching GitHub Release.

To release 2.0.0 after the production-readiness PR is merged:

```bash
git checkout main
git pull origin main
git tag v2.0.0
git push origin v2.0.0
```

Do not create the tag until the Entra identity and GitHub environment are configured and the packaged extension has passed a manual Extension Development Host smoke test.

## Credential rotation

There is no Marketplace PAT to rotate. The GitHub workflow exchanges its OIDC assertion for short-lived Microsoft Entra credentials at release time.

If repository ownership, repository identity, environment name, or trust policy changes, review the federated credential before the next release.
