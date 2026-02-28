# Contributing to SpeakScribe

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
to automate version bumping and changelog generation.

### Format

```
<type>(<optional scope>): <description>

[optional body]

[optional footer]
```

### Types and Their Effect on Versioning

| Type       | Description                          | Version Bump |
|------------|--------------------------------------|--------------|
| `fix`      | Bug fix                              | PATCH        |
| `feat`     | New feature                          | MINOR        |
| `feat!`    | New feature with breaking change     | MAJOR        |
| `fix!`     | Bug fix with breaking change         | MAJOR        |
| `docs`     | Documentation only                   | PATCH        |
| `style`    | Code style (formatting, semicolons)  | PATCH        |
| `refactor` | Code change (no new feature or fix)  | PATCH        |
| `perf`     | Performance improvement              | PATCH        |
| `test`     | Adding or fixing tests               | PATCH        |
| `ci`       | CI/CD configuration                  | PATCH        |
| `chore`    | Maintenance tasks                    | PATCH        |

### Examples

```bash
# Bug fix -> 2.0.0 becomes 2.0.1
git commit -m "fix(widget): prevent FAB from jumping on hover"

# New feature -> 2.0.1 becomes 2.1.0
git commit -m "feat(export): add PDF export format"

# Breaking change -> 2.1.0 becomes 3.0.0
git commit -m "feat!: redesign settings storage schema

BREAKING CHANGE: Per-site settings now use a flat key format.
Old settings will need manual migration."

# Scoped fix
git commit -m "fix(speech): handle no-speech timeout gracefully"

# Documentation
git commit -m "docs: update PUBLISHING.md with refresh token steps"

# CI change
git commit -m "ci: add artifact retention to publish workflow"
```

### Breaking Changes

You can indicate a breaking change in two ways:

1. Add `!` after the type: `feat!: remove legacy API`
2. Add a `BREAKING CHANGE:` footer in the commit body

Both trigger a MAJOR version bump.

## How Releases Work

1. Push commits to `main` using conventional commit messages
2. The **Release** workflow runs automatically
3. It analyzes commits since the last tag to determine the bump type
4. It updates `manifest.json` and `CHANGELOG.md`
5. It creates a git tag (`v2.1.0`) and a GitHub Release
6. The tag push triggers the **Publish** workflow
7. The extension is uploaded and published to the Chrome Web Store

You can also trigger a release manually from the Actions tab with
an optional forced bump type.
