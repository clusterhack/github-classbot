import { Probot, Context } from "probot";
import { RequestError as OctokitError } from "@octokit/request-error";

import { isComponentEnabled } from "../config";
import { ClassbotConfig, ClassbotComponentConfig } from "../types";

export interface WorkflowsConfig extends ClassbotComponentConfig {
  // Paths relative to repo root (*not* to .github folder)
  // For now, the file from source_path is copied verbatim into destination_path (and the original is left intact)
  source_path: string;
  destination_path: string;
  // Optional filtering regexps, for determining on which push to trigger setup commit
  // We trigger on "push" not "repository:create", to avoid any races with Classroom's bot.
  // The filters are meant to help more accurately identify Classroom bot's setup commits.
  pusher_filter?: string;
  message_filter?: string;
}

/***********************************************************************
 * GitHub Classroom autograding action workflow initialization
 */

export async function classroomWorkflowSetup(
  app: Probot,
  context: Context<"push">,
  config: ClassbotConfig,
  botUser: { name: string; email: string },
  repoInfo?: { owner: string; repo: string }
): Promise<void> {
  if (!isComponentEnabled(config.workflows)) {
    return;
  }
  const { owner, repo } = repoInfo || context.repo();
  const log = app.log.child({ name: "workflow-setup", repo: `${owner}/${repo}` });

  const pusherPattern = config.workflows.pusher_filter
    ? new RegExp(config.workflows.pusher_filter)
    : undefined;
  const commitMessagePattern = config.workflows.message_filter
    ? new RegExp(config.workflows.message_filter)
    : undefined;
  const srcPath = config.workflows.source_path;
  const dstPath = config.workflows.destination_path;

  const { pusher, commits } = context.payload; // Shorthands

  // Verify pusher (if configured)
  if (pusherPattern && !pusher.name.match(pusherPattern)) {
    log.info(`Pusher ${pusher.name} does not match filter; skipping setup`);
    return;
  } else {
    log.info("Pusher filter matched");
  }

  // Verify commit message (if configured)
  if (commitMessagePattern && commits.every(c => !c.message.match(commitMessagePattern))) {
    log.info("No commit matches message filter; skipping setup");
    log.info(`Filter: ${commitMessagePattern}`);
    log.info(`Commits:\n${JSON.stringify(commits, undefined, 2)}`);
    log.info(`Payload:\n${JSON.stringify(context.payload, undefined, 2)}`);
    return;
  } else {
    log.info("Message filter matched at least one commit");
  }

  // Check that file does not already exist
  try {
    await context.octokit.repos.getContent({ owner, repo, path: dstPath });
    // Since this is a one-time setup, doesn't make sense to do diff vs srcPath ...
    log.info(`Workflow ${dstPath} already exists; skipping setup`);
    return;
  } catch (err) {
    log.info(`Workflow ${dstPath} does not already exist`);
  }

  // Check if source exists ...
  let getResp = undefined;
  try {
    getResp = (
      await context.octokit.repos.getContent({
        owner,
        repo,
        path: srcPath,
      })
    ).data as { sha: string; content?: string; size?: number };
  } catch (err) {
    // TODO Ugh, this error handling (w/ if below) is *quite* fugly..!
    const error = err as OctokitError;
    getResp = { sha: undefined, message: error.message };
  }

  if (getResp?.sha === undefined) {
    log.info(`Did not find ${srcPath} (message: ${getResp.message}); skipping setup`);
    return;
  }

  if (getResp.content === undefined) {
    log.error(`Unexpected response for ${srcPath} content; content missing!`);
    return;
  }

  // ...and copy it into destination, if it does exist
  const resp = await context.octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: dstPath,
    message: "Setting up classroom autograde workflow",
    content: getResp.content,
    commiter: botUser,
  });

  log.info(
    `Set up classroom workflow (HTTP ${resp.headers.status}) in commit ${resp.data.commit.sha}`
  );
}
