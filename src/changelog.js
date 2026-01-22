import "dotenv/config";
import { Octokit } from "@octokit/rest";
import fs from "fs";
import { updateConfluencePage } from "./confluence.js";

// Validate required environment variables
function validateEnvVars() {
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
    console.error("Please check your .env file");
    process.exit(1);
  }
}

validateEnvVars();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

let config;
try {
  config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
} catch (error) {
  console.error("❌ Error reading config.json:", error.message);
  process.exit(1);
}

async function getCommitsBetweenTags(fromTag, toTag) {
  try {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base: fromTag,
      head: toTag,
    });
    return data.commits || [];
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`Tag not found: ${fromTag} or ${toTag}. Please verify the tag names.`);
    }
    if (error.status === 401) {
      throw new Error("Authentication failed. Please check your GITHUB_TOKEN has 'repo' or 'public_repo' scope.");
    }
    throw new Error(`Failed to get commits: ${error.message}`);
  }
}

async function listTags() {
  try {
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
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`Repository not found: ${owner}/${repo}. Please verify GITHUB_OWNER and GITHUB_REPO in your .env file.`);
    }
    if (error.status === 401) {
      throw new Error("Authentication failed. Please check your GITHUB_TOKEN has 'repo' or 'public_repo' scope.");
    }
    if (error.status === 403) {
      throw new Error("Access forbidden. Your token may not have permission to access this repository.");
    }
    throw new Error(`Failed to list tags: ${error.message}`);
  }
}

async function getPreviousTag(currentTag) {
  const tags = await listTags();

  if (tags.length === 0) {
    throw new Error(`No tags found in repository ${owner}/${repo}`);
  }

  const index = tags.findIndex(t => t.name === currentTag);

  if (index === -1) {
    const availableTags = tags.slice(0, 5).map(t => t.name).join(", ");
    throw new Error(`Tag "${currentTag}" not found. Available tags: ${availableTags}${tags.length > 5 ? "..." : ""}`);
  }

  if (!tags[index + 1]) {
    throw new Error(`No previous tag found before "${currentTag}". This is the oldest tag.`);
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
    .map(([title, items]) => {
      const itemsList = `<ul>${items.join("")}</ul>`;

      return `
        <table style="width: 100%; table-layout: fixed;">
          <colgroup>
            <col style="width: 50%">
            <col style="width: 35%">
            <col style="width: 15%">
          </colgroup>
          <tbody>
            <tr>
              <th>${title}</th>
              <th>Descrição</th>
              <th>Links</th>
            </tr>
            <tr>
              <td>${itemsList}</td>
              <td></td>
              <td>
                <ul>
                  <li>Link to doc here</li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      `.trim();
    })
    .join("");

  return `<h2>${version}</h2>${body}`;
}

async function run() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  let fromTag;
  let toTag;

  if (arg1 && arg2) {
    fromTag = arg1;
    toTag = arg2;
    console.log(`📊 Generating changelog from ${fromTag} to ${toTag}...`);
  } else if (arg1) {
    toTag = arg1;
    console.log(`📊 Finding previous tag for ${toTag}...`);
    fromTag = await getPreviousTag(toTag);
    console.log(`✓ Previous tag found: ${fromTag}`);
  } else {
    console.error("❌ Usage: node changelog.js <tag> | <from> <to>");
    console.error("\nExamples:");
    console.error("  node changelog.js v1.2.0              # Generate from previous tag to v1.2.0");
    console.error("  node changelog.js v1.1.0 v1.2.0       # Generate from v1.1.0 to v1.2.0");
    process.exit(1);
  }

  console.log(`🔍 Fetching commits between ${fromTag} and ${toTag}...`);
  const commits = await getCommitsBetweenTags(fromTag, toTag);

  if (commits.length === 0) {
    console.warn(`⚠️  No commits found between ${fromTag} and ${toTag}`);
  } else {
    console.log(`✓ Found ${commits.length} commits`);
  }

  console.log("📝 Generating changelog...");
  const changelogHtml = generateChangelog(commits, toTag);

  try {
    fs.writeFileSync("CHANGELOG.html", changelogHtml);
    console.log("✅ CHANGELOG.html generated successfully");
  } catch (error) {
    throw new Error(`Failed to write CHANGELOG.html: ${error.message}`);
  }

  if (process.env.CONFLUENCE_PAGE_ID) {
    console.log("📤 Updating Confluence page...");
    try {
      await updateConfluencePage(changelogHtml);
      console.log("✅ Confluence page updated successfully");
    } catch (error) {
      console.error(`⚠️  Confluence update failed: ${error.message}`);
      console.error("The changelog was still saved to CHANGELOG.html");
    }
  }
}

run().catch(err => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
