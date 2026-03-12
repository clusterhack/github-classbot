import { ApplicationFunction, Context, Probot } from "probot";

import { getConfig } from "./config.js";
import watchdog from "./components/watchdog.js";
import autograde from "./components/autograde.js";
import badges, { statusBranchSetup } from "./components/badges.js";
import gradelog from "./components/gradelog.js";
import { classroomWorkflowSetup } from "./components/workflows.js";

// Global config constants
// TODO Fix default fallbacks (or, alternatively, fail on undefined)
const CLASSBOT_USERNAME = process.env.CLASSBOT_USERNAME || "classbot";
const CLASSBOT_USERID = process.env.CLASSBOT_USERID || "0";
// XXX TODO See below
// TODO? Also, ensure (or require?) that both regex ends are anchored?
const CLASSBOT_REPO_OWNER_PATTERN = new RegExp(process.env.CLASSBOT_REPO_OWNER_PATTERN || "^.*$");
const CLASSBOT_REPO_NAME_PATTERN = new RegExp(process.env.CLASSBOT_REPO_NAME_PATTERN || "^.*$");

// @ts-ignore(6133)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function classbotGitUserConfig(context: Context<"push" | "check_run" | "repository.created">) {
  // const id = context.payload.installation?.id || process.env.APP_ID;
  const id = CLASSBOT_USERID;
  return {
    name: CLASSBOT_USERNAME,
    email: `${id}+${CLASSBOT_USERNAME}@users.noreply.github.com`,
  };
}

// XXX Hardcoded out of paranoia; is there better way?
// TODO E.g., instantiate app in classroom org and make it private?
//   Also app config might be more appropriate than dotenv for repo name (but not owner) pattern?
function classbotSkipRepo(owner: string, repo: string): boolean {
  if (owner.match(CLASSBOT_REPO_OWNER_PATTERN) === null) return true;
  if (repo.match(CLASSBOT_REPO_NAME_PATTERN) === null) return true;
  return false;
}

const classbotApp: ApplicationFunction = (app: Probot) => {
  const log = app.log;

  log?.info("Classbot starting...");

  log?.info(`Classbot environment:
NODE_ENV: ${process.env.NODE_ENV}
CLASSBOT_USERNAME: '${CLASSBOT_USERNAME}'
CLASSBOT_USERID: '${CLASSBOT_USERID}'
CLASSBOT_REPO_OWNER_PATTERN: ${CLASSBOT_REPO_OWNER_PATTERN}
CLASSBOT_REPO_NAME_PATTERN: ${CLASSBOT_REPO_NAME_PATTERN}
CLASSBOT_DB_DATABASE: ${process.env.CLASSBOT_DB_DATABASE}
CLASSBOT_DB_USER: ${process.env.CLASSBOT_DB_USER}
  `);

  /***********************************************************************
   * Webhooks
   */

  app.on("push", async context => {
    // log?.info(context);
    log?.info("Watchdog: Start (on push)");
    const { owner, repo } = context.repo();
    log?.info(
      `Watchdog: owner/repo = ${owner}/${repo} (inst: ${context.payload.installation?.id})`
    );
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);
    const botUser = classbotGitUserConfig(context);

    await classroomWorkflowSetup(app, context, config, botUser, { owner, repo });
    await watchdog(app, context, config, { owner, repo });
    log?.info("Watchdog: Done");
  });

  app.on("check_suite.requested", async context => {
    // log?.info(context);
    log?.info("Autograde: Start (on check_suite.requested)");
    const { owner, repo } = context.repo();
    log?.info(
      `Autograde: owner/repo = ${owner}/${repo} (inst: ${context.payload.installation?.id})`
    );
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await autograde(app, context, config, { owner, repo });
    log?.info("Autograde: Done");
  });

  app.on("check_run", async context => {
    // log?.info(context);
    log?.info("Badges: Start (on check_run)");
    const { owner, repo } = context.repo();
    log?.info(`Badges: owner/repo = ${owner}/${repo} (inst: ${context.payload.installation?.id})`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await badges(app, context, config, classbotGitUserConfig(context), { owner, repo });
    log?.info("Badges: Done");
  });

  app.on("workflow_job.completed", async context => {
    log?.info("Gradelog: Start (on workflow_job.completed");
    const { owner, repo } = context.repo();
    log?.info(`Gradelog: owner/repo = ${owner}/${repo} (inst: ${context.payload.installation?.id})`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await gradelog(app, context, config, { owner, repo });
    log?.info("Gradelog: Done");
  });

  // TODO! Can we get event when org is renamed (to update name of ClassroomOrg record?)

  app.on("fork", async context => {
    const repoName = context.payload.repository.full_name;
    const forkeeName = context.payload.forkee.full_name;
    log?.info(`Fork: repo = ${repoName}, forkee = ${forkeeName} (inst: ${context.payload.installation?.id})`);
    // Info only, setup tasks handled in "repository.created" and "push" ...
  });

  app.on("repository.created", async context => {
    log?.info("Setup: Start (on repository.created)");
    const { owner, repo } = context.repo();
    log?.info(`Setup: owner/repo = ${owner}/${repo} (inst: ${context.payload.installation?.id})`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await statusBranchSetup(app, context, config, classbotGitUserConfig(context), { owner, repo });
    log?.info("Setup: Done");
  });

  // app.on("pull_request.opened", async (context) => {
  //   // log?.info(context);
  //   log?.info("pull_request.opened");
  // });
};

export default classbotApp;
