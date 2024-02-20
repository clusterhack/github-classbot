// eslint-disable-next-line node/no-extraneous-require
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH });

import path from "node:path";
import helmet from "helmet";
import { Model } from "objection";
import Knex from "knex";
import express from "express";
// eslint-disable-next-line node/no-unpublished-import
import { createProxyMiddleware } from "http-proxy-middleware"; // Only used for dev server
import { ApplicationFunction, Context, Probot } from "probot";

import { getConfig } from "./config";
import { isEnvTruthy } from "./util";
import { sessionMiddleware } from "./session";
import { authMiddleware, oauthRoutes } from "./auth";
import { apiRoutes } from "./api";
import watchdog from "./components/watchdog";
import autograde from "./components/autograde";
import badges, { statusBranchSetup } from "./components/badges";
import gradelog from "./components/gradelog";
import { classroomWorkflowSetup } from "./components/workflows";

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

const classbotApp: ApplicationFunction = (app: Probot, { getRouter }) => {
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
   * Database
   */

  const knex = Knex({
    client: "mysql",
    useNullAsDefault: true,
    connection: {
      host: "127.0.0.1",
      port: 3306,
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
    // log?.info(context);
    log?.info("Watchdog: Start (on push)");
    const { owner, repo } = context.repo();
    log?.info(`Watchdog: owner/repo = ${owner}/${repo}`);
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
    log?.info(`Autograde: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await autograde(app, context, config, { owner, repo });
    log?.info("Autograde: Done");
  });

  app.on("check_run", async context => {
    // log?.info(context);
    log?.info("Badges: Start (on check_run)");
    const { owner, repo } = context.repo();
    log?.info(`Badges: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await badges(app, context, config, classbotGitUserConfig(context), { owner, repo });
    log?.info("Badges: Done");
  });

  app.on("workflow_job.completed", async context => {
    log?.info("Gradelog: Start (on workflow_job.completed");
    const { owner, repo } = context.repo();
    log?.info(`Gradelog: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await gradelog(app, context, config, { owner, repo });
    log?.info("Gradelog: Done");
  });

  // TODO! Can we get event when org is renamed (to update name of ClassroomOrg record?)

  app.on("fork", async context => {
    const repoName = context.payload.repository.full_name;
    const forkeeName = context.payload.forkee.full_name;
    log?.info(`Fork: repo = ${repoName}, forkee = ${forkeeName}`);
    // Info only, setup tasks handled in "repository.created" and "push" ...
  });

  app.on("repository.created", async context => {
    log?.info("Setup: Start (on repository.created)");
    const { owner, repo } = context.repo();
    log?.info(`Setup: owner/repo = ${owner}/${repo}`);
    if (classbotSkipRepo(owner, repo)) return;
    const config = await getConfig(context);

    await statusBranchSetup(app, context, config, classbotGitUserConfig(context), { owner, repo });
    log?.info("Setup: Done");
  });

  // app.on("pull_request.opened", async (context) => {
  //   // log?.info(context);
  //   log?.info("pull_request.opened");
  // });

  /***********************************************************************
   * Additional routes
   */

  const router = getRouter!("/classbot");

  const proxyViteServer =
    process.env.NODE_ENV === "development" && !isEnvTruthy(process.env.VITE_DEV_STATIC);

  // Basic security (helmet)
  router.use(
    helmet({
      referrerPolicy: { policy: "same-origin" },
      hidePoweredBy: false,
      crossOriginEmbedderPolicy: { policy: "credentialless" },
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "https://avatars.githubusercontent.com"],
          // Vite dev server injects script into index, for HMR websockets; ok to allow just in dev
          ...(proxyViteServer && { "script-src": ["'self'", "'unsafe-inline'"] }),
        },
      },
    })
  );

  // Sessions
  router.use(
    sessionMiddleware({
      proxy: true,
      sameSite: "none",
      secure: true,
      logger: log?.child({ name: "session-store" }),
    })
  );

  // OAuth login
  router.use(
    "/oauth",
    oauthRoutes("pybait", {
      redirect: "/classbot",
      logger: log?.child({ name: "oauth-login" }),
    })
  );

  // User authentication
  router.use(
    authMiddleware("/classbot/oauth/login", {
      loadUser: true,
      userFetchRelations: "orgs.assignments", // XXX Also determines behavior of /api/self/profile endpoint ...hmm
      logger: log?.child({ name: "auth-session" }),
    })
  );

  // REST API endpoints
  router.use("/api", apiRoutes({ logger: log?.child({ name: "api" }) }));

  // Frontend  // TODO?
  // XXX We *could* use vite server in middleware mode (https://vitejs.dev/config/server-options.html#server-middlewaremode)
  //   but, since we use two very different tsconfigs for bot and ui, I don't want / have time to deal with surprises right now
  //  (...however small the chance).
  if (!proxyViteServer) {
    // Serve static assets from build dir
    log?.info("Frontend: directly serving bundled static assets");
    router.use("/ui", express.static(path.join(__dirname, "../lib-ui")));
  } else {
    // Proxy to dev server (easier this way around, with all the webhook HTTPS stuff etc)
    log?.info("Frontend: proxying to Vite dev server");
    router.use(
      "/ui",
      createProxyMiddleware({
        target: `http://localhost:${process.env.VITE_DEV_PORT || 4000}/`,
        ws: true,
      })
    );
  }

  // XXX Just for basic testing...
  router.get("/", (req, res) => {
    const name = req.user?.name || req.session.data?.userid;
    res.send(`Hello, ${name}!`);
  });
};

export default classbotApp;
