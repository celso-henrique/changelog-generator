import { Octokit } from "@octokit/rest";
import axios from "axios";
import fs from "fs";
import "dotenv/config";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

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
  if (index === -1 || !tags[index + 1]) {
    throw new Error("Previous tag not found");
  }
  return tags[index + 1].name;
}

function parseCommit(message) {
  const firstLine = message.split("\n")[0];
  const match = firstLine.match(/^(\w+)(?:\([^)]+\))?(!)?:\s*(.+)$/);

  const prMatch = firstLine.match(/\(#(\d+)\)/);

  if (!match) {
    return {
      type: "other",
      description: firstLine.trim(),
      prNumber: prMatch ? prMatch[1] : null,
    };
  }

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

  return config.authors.some(author =>
    candidates.some(candidate =>
      candidate.includes(normalize(author))
    )
  );
}

function generateChangelog(commits, version) {
  const sections = {};

  for (const commit of commits) {
    if (!isAuthorAllowed(commit)) continue;

    const parsed = parseCommit(commit.commit.message);
    if (config.ignoreTypes?.includes(parsed.type)) continue;

    const section =
      config.types?.[parsed.type] || "Others";

    const prLink = parsed.prNumber
      ? ` (<a href="https://github.com/${owner}/${repo}/pull/${parsed.prNumber}">#${parsed.prNumber}</a>)`
      : "";

    sections[section] ??= [];
    sections[section].push(`<li>${parsed.description}${prLink}</li>`);
  }

  const body = Object.entries(sections)
    .map(
      ([title, items]) =>
        `<h3>${title}</h3><ul>${items.join("")}</ul>`
    )
    .join("");

  return `<h2>${version}</h2>${body}`;
}

async function getConfluencePage() {
  const url = `${process.env.CONFLUENCE_BASE_URL}/wiki/rest/api/content/${process.env.CONFLUENCE_PAGE_ID}?expand=body.storage,version,title`;

  const { data } = await axios.get(url, {
    auth: {
      username: process.env.CONFLUENCE_EMAIL,
      password: process.env.CONFLUENCE_API_TOKEN,
    },
  });

  return data;
}

async function updateConfluencePage(newSectionHtml) {
  const page = await getConfluencePage();

  const updatedBody =
    newSectionHtml + page.body.storage.value;

  const payload = {
    id: page.id,
    type: "page",
    title: page.title,
    version: {
      number: page.version.number + 1,
    },
    body: {
      storage: {
        value: updatedBody,
        representation: "storage",
      },
    },
  };

  await axios.put(
    `${process.env.CONFLUENCE_BASE_URL}/wiki/rest/api/content/${page.id}`,
    payload,
    {
      auth: {
        username: process.env.CONFLUENCE_EMAIL,
        password: process.env.CONFLUENCE_API_TOKEN,
      },
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
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
  } else {
    console.error("Usage: node changelog.js <tag> | <from> <to>");
    process.exit(1);
  }

  const commits = await getCommitsBetweenTags(fromTag, toTag);
  const changelogHtml = generateChangelog(commits, toTag);

  fs.writeFileSync("CHANGELOG.html", changelogHtml);

  if (process.env.CONFLUENCE_PAGE_ID) {
    await updateConfluencePage(changelogHtml);
    console.log("✅ Confluence page updated");
  }
}

run().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
