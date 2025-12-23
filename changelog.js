import { Octokit } from "@octokit/rest";
import fs from "fs";
import "dotenv/config";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

if (!owner || !repo) {
  console.error("GITHUB_OWNER and GITHUB_REPO must be set");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));

async function getCommitsBetweenTags(fromTag, toTag) {
  const { data } = await octokit.repos.compareCommits({
    owner,
    repo,
    base: fromTag,
    head: toTag,
  });

  return data.commits || [];
}

async function listTags() {
  const tags = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.repos.listTags({
      owner,
      repo,
      per_page: 100,
      page,
    });

    if (!data.length) break;
    tags.push(...data);
    page++;
  }

  return tags;
}

async function getPreviousTag(currentTag) {
  const tags = await listTags();

  const index = tags.findIndex(t => t.name === currentTag);
  if (index === -1) {
    throw new Error(`Tag not found: ${currentTag}`);
  }

  const previous = tags[index + 1];
  if (!previous) {
    throw new Error(`No previous tag found before ${currentTag}`);
  }

  return previous.name;
}

function parseCommit(message) {
  const firstLine = message.split("\n")[0];
  const match = firstLine.match(
    /^(\w+)(?:\([^)]+\))?(!)?:\s*(.+)$/
  );

  if (!match) {
    return {
      type: "other",
      description: firstLine.trim(),
      prNumber: null,
    };
  }

  const prMatch = firstLine.match(/\(#(\d+)\)/);

  return {
    type: match[1].toLowerCase(),
    description: match[3].trim(),
    prNumber: prMatch ? prMatch[1] : null,
  };
}

function normalize(value) {
  return value?.toLowerCase().trim();
}

function isAuthorAllowed(commit) {
  if (!config.authors || config.authors.length === 0) {
    return true;
  }

  const candidates = [
    commit.author?.login,
    commit.commit.author?.name,
    commit.commit.author?.email,
  ]
    .filter(Boolean)
    .map(normalize);

  return config.authors.some(configAuthor =>
    candidates.some(candidate =>
      candidate.includes(normalize(configAuthor))
    )
  );
}

function generateChangelog(commits) {
  const sections = {};

  for (const commit of commits) {
    if (!isAuthorAllowed(commit)) continue;

    const parsed = parseCommit(commit.commit.message);
    if (!parsed) continue;

    if (config.ignoreTypes?.includes(parsed.type)) continue;

    const sectionTitle =
      config.types?.[parsed.type] || 'Others';

    const prLink = parsed.prNumber
      ? ` ([#${parsed.prNumber}](https://github.com/${owner}/${repo}/pull/${parsed.prNumber}))`
      : "";

    const line = `- ${parsed.description}${prLink}`;

    sections[sectionTitle] ??= [];
    sections[sectionTitle].push(line);
  }

  return Object.entries(sections)
    .map(
      ([title, items]) =>
        `## ${title}\n${items.join("\n")}`
    )
    .join("\n\n");
}

async function run() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  let fromTag;
  let toTag;

  if (arg1 && arg2) {
    fromTag = arg1;
    toTag = arg2;
  } else if (arg1) {
    toTag = arg1;
    fromTag = await getPreviousTag(toTag);
    console.log(`Using interval: ${fromTag} → ${toTag}`);
  } else {
    console.error("Usage:");
    console.error("  node changelog.js <fromTag> <toTag>");
    console.error("  node changelog.js <tag>");
    process.exit(1);
  }

  const commits = await getCommitsBetweenTags(fromTag, toTag);
  const changelog = generateChangelog(commits);

  fs.writeFileSync("CHANGELOG.md", changelog);
  console.log("✅ Changelog generated in CHANGELOG.md");
}

run().catch(err => {
  console.error("Error generating changelog:", err.message || err);
  process.exit(1);
});
