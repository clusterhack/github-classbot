import path from "node:path";
import { Probot, Context } from "probot";
import { RequestError as OctokitError } from "@octokit/request-error";
import { CheckRunCompletedEvent } from "@octokit/webhooks-types";

import { isComponentEnabled } from "../config";
import { ClassbotConfig, ClassbotComponentConfig } from "../types";

export interface BadgesConfig extends ClassbotComponentConfig {
  branch: string;
  path: string;
}

export function createPointsBadge(
  points: number | string,
  max_points: number | string = 100
): string {
  const ariaLabel = `${points} out of ${max_points} points`;
  const titleLabel = "🎯 score";
  const valueLabel = `${points} / ${max_points}`;
  let bgColor = "#aaa"; // Light grey (default)
  if (typeof points === "number") {
    const bound = (typeof max_points === "number" && max_points) || Infinity;
    if (points === 0) {
      bgColor = "#fe3737"; // Red
    } else if (points < bound) {
      bgColor = "#fe7d37"; // Orange
    } else if (points === bound) {
      bgColor = "#35f235"; // Green
    }
  }
  // eslint-disable-next-line prettier/prettier
  return (
`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="140" height="24" role="img" aria-label="${ariaLabel}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#ddd" stop-opacity=".2" />
    <stop offset="1" stop-opacity=".2" />
  </linearGradient>
  <clipPath id="r">
    <rect width="140" height="24" rx="4" fill="#fff" />
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="70" height="24" fill="#666" />
    <rect x="70" width="70" height="24" fill="${bgColor}" />
    <rect width="140" height="24" fill="url(#s)" />
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'"
    text-rendering="geometricPrecision" font-size="140">
    <g font-size="140">
      <text aria-hidden="true" x="350" y="160" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="580">${titleLabel}</text>
      <text x="350" y="160" transform="scale(.1)" fill="#fff" textLength="580">${titleLabel}</text>
    </g>
    <text aria-hidden="true" x="1050" y="170" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="580">${valueLabel}</text>
    <text x="1050" y="170" transform="scale(.1)" fill="#fff" textLength="580">${valueLabel}</text>
  </g>
</svg>`); // eslint-disable-line prettier/prettier
}
/***********************************************************************
 * Status branch initialization (for score badges)
 */

export async function statusBranchSetup(
  app: Probot,
  context: Context<"repository.created">,
  config: ClassbotConfig,
  botUser: { name: string; email: string },
  repoInfo?: { owner: string; repo: string }
): Promise<void> {
  if (!isComponentEnabled(config.badges)) {
    return;
  }

  const { owner, repo } = repoInfo || context.repo();
  const log = app.log.child({ name: "status-setup", repo: `${owner}/${repo}` });

  // TODO? Check if we should skip...

  const branch = config.badges.branch; // Shorthand
  const branchRef = `refs/heads/${branch}`;

  // Check if branch already exists
  const matchingRefs = (
    await context.octokit.git.listMatchingRefs({
      owner,
      repo,
      ref: branchRef,
    })
  ).data;
  if (matchingRefs.length !== 0 && matchingRefs[0].ref === branchRef) {
    log.error(`Branch ${branch} already exists; aborting...`);
    return;
  }

  // Default badge SVG
  const badge = createPointsBadge("??", "??");

  try {
    // Create badges sub-tree
    const badgesTreeSha = (
      await context.octokit.git.createTree({
        owner,
        repo,
        tree: [
          {
            path: "score.svg",
            mode: "100644",
            type: "blob",
            content: badge,
          },
        ],
      })
    ).data.sha;

    // Create root tree
    // Config validation ensures that badges.path is not nested, so this should be fine
    const rootTreeSha = (
      await context.octokit.git.createTree({
        owner,
        repo,
        tree: [
          {
            path: config.badges.path,
            mode: "040000",
            type: "tree",
            sha: badgesTreeSha,
          },
        ],
      })
    ).data.sha;

    // Create commit with new root tree
    const commitSha = (
      await context.octokit.git.createCommit({
        owner,
        repo,
        message: `Setting up "${branch}" orphan branch`,
        tree: rootTreeSha,
        author: botUser,
      })
    ).data.sha;

    // Create branch reference to new commit
    const refResp = await context.octokit.git.createRef({
      owner,
      repo,
      ref: branchRef,
      sha: commitSha,
    });

    log.info(`Set up "${branch}" branch (HTTP ${refResp.headers.status}) to commit ${commitSha}`);
  } catch (err) {
    const error = err as OctokitError; // TODO? CHECK exception type (there is a different RequestError in @octokit/types..)
    log.error(
      `Error creating "${branch}" branch on request ${error.request?.url}: ${error.message}`
    );
  }
}

/***********************************************************************
 * Score badge update
 */

type Score = { score: string | number; max_score: string | number };
function parseAutogradingScore(scoreSummary: string): Score;
function parseAutogradingScore(event: CheckRunCompletedEvent): Score;
function parseAutogradingScore(eventOrSummary: string | CheckRunCompletedEvent): Score {
  const result: Score = { score: "??", max_score: "??" };
  if (typeof eventOrSummary === "object") {
    switch (eventOrSummary.check_run.conclusion) {
      case "success":
      case "failure":
        eventOrSummary =
          eventOrSummary.check_run.output.summary || eventOrSummary.check_run.output.text || "";
        break;
      case "timed_out":
        result.score = 0;
        return result;
      default:
        return result;
    }
  }

  // Expected format: "Points 100/100"
  console.log(`Parse score from: ${eventOrSummary}`);
  const grp = eventOrSummary.match(/^Points\s+(?<score>\d+)\s*\/\s*(?<max_score>\d+)/)?.groups;
  result.score = (grp && parseInt(grp.score)) || "??";
  result.max_score = (grp && parseInt(grp.max_score)) || "??";

  return result;
}

export default async function (
  app: Probot,
  context: Context<"check_run">,
  config: ClassbotConfig,
  botUser: { name: string; email: string },
  repoInfo?: { owner: string; repo: string }
): Promise<void> {
  if (!isComponentEnabled(config.badges)) {
    return;
  }

  const { owner, repo } = repoInfo || context.repo();
  const log = app.log.child({ name: "badges", repo: `${owner}/${repo}` });

  if (
    context.payload.action !== "completed" ||
    context.payload.check_run.conclusion === "skipped" ||
    context.payload.check_run.name !== "Autograding"
  ) {
    return;
  }

  const { score, max_score } = parseAutogradingScore(context.payload);
  log.info(`Autograde score=${score}, max_score=${max_score}`);

  const badge = createPointsBadge(score, max_score);
  const badgeFile = path.join(config.badges.path, "score.svg");

  // Updating file contents requires blob SHA of current contents
  const oldContents = (
    await context.octokit.repos.getContent({
      owner,
      repo,
      path: badgeFile,
      ref: config.badges.branch,
    })
  ).data as
    | { sha: string; encoding?: string; content?: string }
    | { sha: undefined; message?: string };
  const sha = oldContents.sha;

  if (sha === undefined) {
    log.error(`Could not find SHA of ${badgeFile}: ${oldContents.message}`);
    return;
  }

  const resp = await context.octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: badgeFile,
    branch: config.badges.branch,
    sha,
    message: `Updated badge (${score}/${max_score} points)`,
    content: Buffer.from(badge).toString("base64"),
    commiter: botUser,
  });
  log.info(`Updated score badge file contents (HTTP status: ${resp.headers.status})`);
}
