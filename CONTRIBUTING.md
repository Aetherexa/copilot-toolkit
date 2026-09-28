# Contributing to Copilot Toolkit

Thanks for helping improve Copilot Toolkit.

## Development requirements

- VS Code 1.90+
- Node.js 22+
- npm

Install and validate locally:

```bash
npm ci
npm run compile
npm test
npm run test:coverage
npm run package:vsix
```

## Pull requests

Keep pull requests focused and include tests for behavior changes.

Before opening a PR:

1. run the full compile/typecheck;
2. run unit tests;
3. verify the coverage gate;
4. package the VSIX;
5. smoke-test relevant UI changes in an Extension Development Host with `F5`.

CI runs tests on Node.js 22 and 24, performs security checks, validates coverage, and verifies that the VSIX does not contain development-only files.

## Architecture guidelines

- Keep React/webview code presentation-focused.
- Workspace/file/Git operations belong in extension-host services.
- Extend typed webview messages rather than creating untyped parallel channels.
- Reuse `ContextEngine`, `ExecutionEngine`, `ProviderRegistry`, and `WorkflowEngine` instead of duplicating execution logic.
- Keep the core workspace graph language/framework agnostic.
- Deterministic repository evidence should remain the source of truth for context selection.
- Avoid introducing external AI SDKs unless there is a concrete provider implementation and security review.

## Tests

Tests use Node's built-in test runner. Add or update tests under `src/test`.

Coverage must remain at or above the repository gates for lines, branches, and functions.

## Dependencies

Avoid broad automated major-version upgrades. Major React, Vite, Node type, VS Code API, and packaging-tool changes should be reviewed independently and validated through the packaged extension.

## Security

Follow [SECURITY.md](SECURITY.md) for vulnerability reports. Never place credentials in source, issues, PR descriptions, fixtures, or workflow files.

## Releases

Release publishing is performed by the protected release workflow. Contributors should not add Marketplace tokens or bypass release validation.

See [docs/marketplace-release.md](docs/marketplace-release.md).
