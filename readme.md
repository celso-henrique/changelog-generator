# Changelog Generator

Simple local tool to generate a changelog from GitHub commits between two tags.

The script fetches commits from a repository, filters them by author and commit type, and generates a structured changelog in Markdown format. It is designed to run locally without requiring CI/CD pipeline changes or additional infrastructure.

---

## Features

- Fetch commits between two Git tags
- Filter commits by author
- Parse conventional-style commit messages
- Group changes by type
- Generate a `CHANGELOG.md` file
- Runs locally with minimal setup

---

## Requirements

- Node.js 18+
- GitHub personal access token with read access
- Access to the target GitHub repository

---

## Project Structure

```text
changelog-generator/
├── changelog.js
├── config.json
├── .env
├── package.json
└── CHANGELOG.md
````

---

## Installation

```bash
npm install
```

---

## Configuration

### Environment variables

Create a `.env` file in the project root:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-github-org-or-user
GITHUB_REPO=your-repository
```

---

### Commit filters

Edit `config.json`:

```json
{
  "authors": [
    "username1",
    "username2"
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

* `authors`: GitHub usernames to include
* `types`: mapping between commit types and changelog sections
* `ignoreTypes`: commit types that will be ignored

---

## Usage

Run the script with the base and target tag:

```bash
node changelog.js v1.3.0
```

If successful, the changelog will be generated in:

```text
CHANGELOG.md
```

---

## Commit Message Format

The script supports commit messages in the following format:

```text
<type>: <description> (#<PR_NUMBER>)
```

Examples:

```text
feat: remove legacy onboarding selector kmp flow (#21544)
feat: improving analytics events (#21546)
fix: adjusts nullable responses LPPJ-675 (#21540)
chore: bump multiplatform SDK version to 2.303.0
```

Notes:

* The PR number is optional and ignored in the changelog output
* Commits with ignored types (e.g. `chore`) are excluded

---

## Output Example

```md
## Features
- Remove legacy onboarding selector kmp flow
- Improving analytics events
- New plan id

## Bug Fixes
- Navigate to Cards Home via external navigation in PopUp
- Adjusts nullable responses LPPJ-675
```

---

## Notes

* Commits are retrieved using the GitHub `compareCommits` API.
* Merge commits and commits without a recognized type are ignored.
* Output format can be adapted to CSV, JSON, HTML, or messaging platforms.

---

## License

MIT
