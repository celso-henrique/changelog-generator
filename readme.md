# Changelog Generator

Local tool to generate changelogs from GitHub commits between releases.

The script fetches commits from a GitHub repository, applies author and commit-type filters, parses conventional-style commit messages, and generates a structured changelog. It can also optionally publish the generated changelog to a specific Confluence page.

Designed to run locally, without requiring CI/CD pipeline changes or additional infrastructure.

---

## Features

- Fetch commits between Git tags
- Accepts **one or two version parameters**
- Automatically resolves the previous tag when only one version is provided
- Filter commits by author (login, name, or email)
- Parse conventional-style commit messages (robust and tolerant)
- Group changes by type
- Generate local changelog output
- Include links to GitHub pull requests
- Optionally publish the changelog to Confluence
- Runs locally with minimal setup

---

## Requirements

- Node.js 18+
- GitHub personal access token with repository read access
- Access to the target GitHub repository
- (Optional) Confluence API token for publishing

---

## Project Structure

```text
changelog-generator/
├── changelog.js
├── config.json
├── .env
├── package.json
├── CHANGELOG.md
└── CHANGELOG.html
````

---

## Installation

```bash
npm install
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-github-org-or-user
GITHUB_REPO=your-repository
```

#### Optional: Confluence publishing

```env
CONFLUENCE_BASE_URL=https://your-company.atlassian.net
CONFLUENCE_EMAIL=your.email@company.com
CONFLUENCE_API_TOKEN=xxxxxxxxxxxx
CONFLUENCE_PAGE_ID=123456789
```

---

### Commit Filters

Edit `config.json`:

```json
{
  "authors": [
    "username",
    "name fragment",
    "@company.com"
  ],
  "types": {
    "feat": "Features",
    "fix": "Bug Fixes",
    "perf": "Performance",
    "refactor": "Refactoring"
  },
  "ignoreTypes": ["chore", "ci", "test"]
}
```

**Fields**

* `authors`: list of fragments used to match commit authors (login, name, or email)
* `types`: mapping between commit types and changelog sections
* `ignoreTypes`: commit types that will be excluded

Author matching is **case-insensitive** and **partial**, making it compatible with squash merges, bots, and different email formats.

---

## Usage

### Generate changelog for a release (recommended)

```bash
node changelog.js v1.3.0
```

The script automatically determines the previous tag and generates the changelog for that release.

---

### Generate changelog for an explicit interval

```bash
node changelog.js v1.2.0 v1.3.0
```

---

### Output

* Local files:

  * `CHANGELOG.md`
  * `CHANGELOG.html`
* If Confluence is configured, the changelog is prepended to the specified page.

---

## Commit Message Format

The parser supports common conventional commit variations, including:

```text
<type>: <description>
<type>(scope): <description>
<type>!: <description>
<type>(scope)!: <description>
```

Examples:

```text
feat: remove legacy onboarding selector kmp flow (#21544)
feat(auth): improving analytics events
fix!: adjust nullable responses
fix: adjusts nullable responses LPPJ-675 (#21540)
chore: bump multiplatform SDK version
```

Notes:

* Pull request numbers are optional
* When present, PR numbers are converted into clickable links
* Commits with ignored types are excluded
* Commits that do not match the pattern are grouped under `Outros`

---

## Output Example

```md
## Features
- Remove legacy onboarding selector kmp flow ([#21544](https://github.com/org/repo/pull/21544))
- Improving analytics events

## Bug Fixes
- Adjusts nullable responses LPPJ-675 ([#21540](https://github.com/org/repo/pull/21540))
```

---

## Notes

* Commits are retrieved using the GitHub `compareCommits` API.
* The tool reflects the actual Git history; squash merges result in one entry per PR.
* The changelog generation is tolerant to inconsistent commit formats.
* Output format can be adapted to HTML, JSON, CSV, or messaging platforms.

---

## License

MIT
