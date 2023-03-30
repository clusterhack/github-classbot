import { Probot, Context } from "probot";
import { Commit } from "@octokit/webhooks-types";
import ignore from "ignore";
import Mustache from "mustache";

import { ClassbotConfig, ClassbotComponentConfig, normalizeFileManifest } from "../types";
import { isComponentEnabled } from "../config";
import { parseAssignmentRepo } from "../util";
import { Assignment } from "../db/models/assignment";
import { Alert } from "../db/models/alert";

export interface WatchdogConfig extends ClassbotComponentConfig {
  validate_files?: boolean;
  validate_author?: boolean;
  timestamp_comment?: boolean;
  issue: {
    // Required label, should be unique to bot (used to find already-existing issue)
    label: string;
    // Optional list of assignees (e.g., a TA) to help students resolve
    assignees?: string[];
    // Optional list of additional labels to attach
    extra_labels?: string[];
    // Title of issue
    title: string;
    // Moustache template for auto-generated issue. The following template variables are available:
    //   description: string, assignees: string[], labels: string[], owner: string, repo: string
    template: string;
  };
}

function setUnionUpdate(target: Set<string>, ...sources: Readonly<Set<string> | string[]>[]) {
  for (const src of sources) {
    for (const el of src) {
      target.add(el);
    }
  }
}

export function findInvalidCommitFiles(
  commits: readonly Commit[],
  patterns: readonly string[],
  commiters_allow?: readonly string[]
): string[] {
  // Manifest specifies filenames that *are* allowed,
  // so the ignore filter (on those glob patterns) will drop *acceptable* modifications
  const notInManifest = ignore().add(patterns).createFilter();
  const invalidFiles = new Set<string>();
  for (const commit of commits) {
    if (
      commit.committer.username &&
      commiters_allow &&
      commiters_allow.includes(commit.committer.username)
    ) {
      // Allow whitelisted commiters to modify any files they wish
      continue;
    }
    setUnionUpdate(
      invalidFiles,
      commit.modified.filter(notInManifest),
      commit.removed.filter(notInManifest),
      commit.added.filter(notInManifest)
    );
  }
  return [...invalidFiles];
}

export function validateCommitFiles(
  commits: readonly Commit[],
  patterns: readonly string[],
  commiters_allow?: readonly string[]
): boolean {
  return findInvalidCommitFiles(commits, patterns, commiters_allow).length > 0;
}

function dedup<T>(arr: readonly T[]): T[] {
  // XXX Not sure if JS Set preserves order, but don't care for what this is used...
  return [...new Set(arr)];
}

export function findInvalidCommitAuthors(
  commits: readonly Commit[],
  authors: readonly string[],
  commiters?: readonly string[]
): string[] {
  // Deduplicate arrays (we may lose ordering, but that's ok)
  authors = dedup(authors);
  if (commiters) commiters = dedup(commiters);

  const invalidUsers = new Set<string>();
  for (const commit of commits) {
    if (!commit.author.username || !authors.includes(commit.author.username)) {
      invalidUsers.add(commit.author.username || "UNDEFINED");
    }
    if (
      commiters &&
      (!commit.committer.username || !commiters.includes(commit.committer.username))
    ) {
      invalidUsers.add(commit.committer.username || "UNDEFINED");
    }
  }
  return [...invalidUsers];
}

export function validateCommitAuthor(
  commits: readonly Commit[],
  authors: readonly string[],
  commiters?: readonly string[]
): boolean {
  return findInvalidCommitAuthors(commits, authors, commiters).length > 0;
}

export async function fileWatchdogIssue(
  config: WatchdogConfig,
  context: Context<"push">,
  description: string
) {
  const { owner, repo } = context.repo();
  const issueTemplate = config.issue.template as string;
  const assignees = config.issue.assignees;
  const title = config.issue.title;
  const labels = [config.issue.label, ...(config.issue.extra_labels || [])];
  const templateView = {
    owner,
    repo,
    title,
    assignees: assignees || [],
    labels,
    description,
  };
  const body = Mustache.render(issueTemplate, templateView);

  // Search open issues (with classbot's label)
  const openIssues = (
    await context.octokit.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: config.issue.label,
      sort: "updated",
      direction: "desc", // *Should* be default, but since we rely on it..
      per_page: 2, // Just need to know if there's more than one...
    })
  ).data;

  const timestamp = new Date().toString();
  if (openIssues.length === 0) {
    // No previous open issue exists
    console.log("Filing new issue");
    return await context.octokit.issues.create({
      owner,
      repo,
      title,
      body: `***Created on ${timestamp}:***\n\n${body}`,
      assignees,
      labels,
    });
  } else {
    // Open bot issue exists, update that one instead
    const issue = openIssues[0];
    const alert =
      openIssues.length > 1
        ? "> **Warning**\n> Other open classbot issues found! Updating only the latest, but please resolve others too.\n\n"
        : "";
    const updatedTitle = issue.title.startsWith("[Updated]")
      ? issue.title
      : `[Updated] ${issue.title}`;
    // Updates in reverse-chrono order
    const updatedBody = `***Updated on ${timestamp}:***\n\n${alert}${body}\n---\n\n${issue.body}`;
    console.log(`Updating previous issue #${issue.number}`);
    return await context.octokit.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      title: updatedTitle,
      body: updatedBody,
    });
  }
}

export async function createTimestampComment(context: Context<"push">, timestamp?: Date) {
  if (timestamp === undefined) {
    timestamp = new Date();
  }
  const { owner, repo } = context.repo();
  await context.octokit.repos.createCommitComment({
    owner,
    repo,
    commit_sha: context.payload.commits.at(-1)?.id as string,
    body: `Pushed at ${timestamp.toString()}`,
  });
}

function markdownIdList(identifiers: readonly string[]): string {
  // Utility function to create comma-separated list of code-styled text fragments
  return identifiers.map(id => `\`${id}\``).join(", ");
}

export default async function (
  app: Probot,
  context: Context<"push">,
  config: ClassbotConfig,
  repoInfo?: { owner: string; repo: string }
): Promise<void> {
  if (!isComponentEnabled(config.watchdog)) {
    return;
  }

  const { owner, repo } = repoInfo || context.repo();
  const log = app.log.child({ name: "watchdog", repo: `${owner}/${repo}` });

  // 1. Validations
  type IssueDetails = { description: string } & (
    | {
        type: "invalid-files";
        files: readonly string[];
      }
    | {
        type: "invalid-users";
        users: readonly string[];
      }
  );
  let issueBodyMd = "";
  const issueDetails: IssueDetails[] = [];

  // Validate filenames modified/deleted/added
  if (config.watchdog.validate_files === true) {
    const branch = context.payload.ref.match(/refs\/heads\/(?<branch>\w+)/)?.groups?.branch;
    const patterns = normalizeFileManifest(config.submission.manifest, branch);
    log.info(
      "File manifest patterns " +
        `(for ${context.payload.ref} -> ${branch}): ${JSON.stringify(patterns)}`
    );

    const invalidFiles = findInvalidCommitFiles(
      context.payload.commits,
      patterns,
      config.submission.commiters_allow // XXX Predominantly for official GH bot's initial commit...
    );
    if (invalidFiles.length > 0) {
      // eslint-disable-next-line prettier/prettier
      issueBodyMd += `* The following file(s) were modified: ${markdownIdList(invalidFiles)}\n`;
      issueDetails.push({
        type: "invalid-files",
        description: "Commit modified unexpected files",
        files: invalidFiles,
      });
    }
  }

  // Validate commiter and author
  if (config.watchdog.validate_author === true) {
    const resp = await context.octokit.repos.listCollaborators({
      owner,
      repo,
      affiliation: "direct",
    });
    const collaborators = resp.data.filter(c => c.permissions?.push === true).map(c => c.login);
    log.info(`Repo collaborators: ${collaborators.toString()}`);

    const authors = [owner, ...collaborators, ...(config.submission.authors_allow || [])];
    const commiters = [
      owner,
      ...collaborators,
      ...(config.submission.commiters_allow || config.submission.authors_allow || []),
    ];
    log.info(`Allowed authors: ${authors.toString()}`);
    log.info(`Allowed commiters: ${commiters.toString()}`);

    const invalidUsers = findInvalidCommitAuthors(context.payload.commits, authors, commiters);
    if (invalidUsers.length > 0) {
      issueBodyMd += `* The following user(s) commited: ${markdownIdList(invalidUsers)}\n`;
      issueDetails.push({
        type: "invalid-users",
        description: "Commit authored by unexpected users",
        users: invalidUsers,
      });
    }
  }

  // File GitHub issue (create or update) and log alert, if any validations failed
  if (issueDetails) {
    log.info(`Validation(s) failed on push by ${owner}`);
    // Construct markdown summary of commits
    let commitDetails = "Potentially offending commit(s):\n\n";
    for (const commit of context.payload.commits) {
      const commitSummary = commit.message.split("\n", 1)[0];
      commitDetails += `* [${commitSummary}](${commit.url}) (by ${commit.author.name})\n`;
    }
    const issueResp = await fileWatchdogIssue(
      config.watchdog,
      context,
      `${issueBodyMd}\n${commitDetails}`
    );
    const issueNumber = issueResp.data.number;
    log.info("Filed watchdog issue");

    try {
      // Figure out author of push head (after) sha
      const commitResp = await context.octokit.repos.getCommit({
        owner,
        repo,
        ref: context.payload.after,
      });
      // Figure out assignment id (database)
      const assignmentName = parseAssignmentRepo(repo, commitResp.data.author?.login)?.assignment;
      const assignmentRows = await Assignment.query().where({ org: owner, name: assignmentName });
      const assignment = assignmentRows[0];

      await Alert.query().insert({
        timestamp: new Date(),
        userid: commitResp.data.author?.id,
        assignment_id: assignment?.id,
        repo: `${owner}/${repo}`,
        issue: issueNumber,
        sha: context.payload.after,
        details: issueDetails,
      });
      log.info("Logged alert into database");
    } catch (err) {
      log.error(`Failed to log alert into database: ${err}`);
    }
  }

  // 2. Annotations
  if (config.watchdog.timestamp_comment === true) {
    await createTimestampComment(context);
    log.info("Submitted commit timestamp comment");
  }
}
