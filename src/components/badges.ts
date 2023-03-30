import path from "node:path";
import { Probot, Context } from "probot";
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
  ).data as { sha?: string; message?: string };
  const sha = oldContents.sha;

  if (sha === undefined) {
    log.error(`ERROR: Could not find SHA of ${badgeFile}: ${oldContents.message}`);
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
