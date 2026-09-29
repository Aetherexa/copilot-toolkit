# Security Policy

## Supported versions

Security fixes are provided for the latest Marketplace release of Copilot Toolkit.

| Version | Supported |
| --- | --- |
| 2.x | Yes |
| 1.x | Security fixes only when practical |
| <1.0 | No |

## Reporting a vulnerability

Please do not open a public issue containing exploit details, credentials, private source code, or other sensitive information.

Use GitHub's private vulnerability reporting/security advisory flow for this repository when available. If that option is unavailable, contact the repository maintainers privately before public disclosure.

Include:

- affected Copilot Toolkit version;
- VS Code version and operating system;
- reproduction steps;
- security impact;
- proof of concept, if safe to share;
- suggested mitigation, if known.

## Data and trust boundaries

Copilot Toolkit performs repository indexing locally and stores Toolkit state through VS Code extension/workspace state or workspace files.

When an AI request is executed, the assembled prompt and selected context are sent to the configured provider. The production provider currently uses GitHub Copilot through VS Code-supported APIs or a Copilot Chat handoff.

The project does not intentionally transmit Toolkit analytics to a separate telemetry backend.

## Secrets

Never commit:

- Visual Studio Marketplace PATs;
- Microsoft Entra client secrets;
- GitHub tokens;
- private repository credentials;
- API keys.

Production Marketplace publishing uses short-lived Microsoft Entra credentials obtained through GitHub Actions OIDC/workload identity federation.

## Dependency and supply-chain controls

Pull requests are checked with:

- CodeQL;
- runtime dependency audit;
- critical build-tool dependency audit;
- TypeScript compilation;
- unit tests and coverage gates;
- VSIX package-content verification.

Dependabot is enabled for npm and GitHub Actions dependencies.
