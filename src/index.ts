// eslint-disable-next-line node/no-extraneous-require
require("dotenv").config();

import { Context, Probot } from "probot";

import { getConfig } from "./config";
import watchdog from "./components/watchdog";
import autograde from "./components/autograde";
import badges from "./components/badges";

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
function classbotGitUserConfig(context: Context<"push" | "check_run">) {
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

export default (app: Probot) => {
  app.log.info("Classbot starting...");

  app.log.info(`Classbot environment:
NODE_ENV: ${process.env.NODE_ENV}
CLASSBOT_USERNAME: '${CLASSBOT_USERNAME}'
CLASSBOT_USERID: '${CLASSBOT_USERID}'
CLASSBOT_REPO_OWNER_PATTERN: ${CLASSBOT_REPO_OWNER_PATTERN}
CLASSBOT_REPO_NAME_PATTERN: ${CLASSBOT_REPO_NAME_PATTERN}
  `);

  app.on("push", async context => {
    // app.log.info(context);
    app.log.info("Watchdog: Start (on push)");
    const { owner, repo } = context.repo();
    app.log.info(`Watchdog: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await watchdog(app, context, config, { owner, repo });
    app.log.info("Watchdog: Done");
  });
  app.on("check_suite.requested", async context => {
    // app.log.info(context);
    app.log.info("Autograde: Start (on check_suite.requested)");
    const { owner, repo } = context.repo();
    app.log.info(`Autograde: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await autograde(app, context, config, { owner, repo });
    app.log.info("Autograde: Done");
  });
  app.on("check_run", async context => {
    //app.log.info(context);
    app.log.info("Badges: Start (on check_run)");
    const { owner, repo } = context.repo();
    app.log.info(`Badges: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await badges(app, context, config, classbotGitUserConfig(context), { owner, repo });
    app.log.info("Badges: Done");
  });

  // app.on("fork", async (context) => {
  //   //app.log.info(context);
  //   app.log.info("fork");
  // });

  // app.on("pull_request.opened", async (context) => {
  //   //app.log.info(context);
  //   app.log.info("pull_request.opened");
  // });
};
