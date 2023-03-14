// eslint-disable-next-line node/no-extraneous-require
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH });

import { Model } from "objection";
import Knex from "knex";
import { ApplicationFunction, Context, Probot } from "probot";

import { getConfig } from "./config";
import { sessionMiddleware } from "./session";
import { authMiddleware, oauthRoutes } from "./auth";
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
const classbotApp: ApplicationFunction = (app: Probot, { getRouter }) => {
  app.log.info("Classbot starting...");

  app.log.info(`Classbot environment:
NODE_ENV: ${process.env.NODE_ENV}
CLASSBOT_USERNAME: '${CLASSBOT_USERNAME}'
CLASSBOT_USERID: '${CLASSBOT_USERID}'
CLASSBOT_REPO_OWNER_PATTERN: ${CLASSBOT_REPO_OWNER_PATTERN}
CLASSBOT_REPO_NAME_PATTERN: ${CLASSBOT_REPO_NAME_PATTERN}
CLASSBOT_DB_DATABASE: ${process.env.CLASSBOT_DB_DATABASE}
CLASSBOT_DB_USER: ${process.env.CLASSBOT_DB_USER}
  `);

  /***********************************************************************
   * Database
   */

  const knex = Knex({
    client: "mysql",
    useNullAsDefault: true,
    connection: {
      // host: "127.0.0.1",
      // port: 3306,
      user: process.env.CLASSBOT_DB_USER,
      password: process.env.CLASSBOT_DB_PASSWORD,
      database: process.env.CLASSBOT_DB_DATABASE,
    },
  });

  Model.knex(knex);

  /***********************************************************************
   * Webhooks
   */

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

  /***********************************************************************
   * Additional routes
   */

  const router = getRouter!("/classbot");

  // Sessions
  router.use(sessionMiddleware());

  // OAuth login
  router.use(
    "/oauth",
    oauthRoutes("/classbot/oauth", "pybait", {
      redirect: "/classbot",
      logger: app.log.child({ name: "oauth-login" }),
    })
  );

  // User authentication
  router.use(
    authMiddleware("/classbot/oauth/login", {
      loadUser: true,
      logger: app.log.child({ name: "auth-session" }),
    })
  );

  // XXX Just for basic testing...
  router.get("/", async (req, res) => {
    const name = req.user?.name || req.session.data?.userid;
    res.send(`Hello, ${name}!`);
  });
};

export default classbotApp;
