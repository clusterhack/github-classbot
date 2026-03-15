// XXX Set up dotenv before importing anything else!
import "./env.js";

import { Model } from "objection";
import Knex from "knex";
import Express from "express";
import { createNodeMiddleware, createProbot } from "probot";
// eslint-disable-next-line node/no-extraneous-import
import pino from "pino";
// eslint-disable-next-line node/no-extraneous-import
import { getTransformStream } from "@probot/pino";

import app from "./robot.js";
import { webRoutes } from "./webroutes.js";

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
 * Server
 */

// Unline probot run(), createProbot() does not initialize a logger;
// this code is slightly adapted from probot/helpers/get-log.ts (which is what run() relies on)
// XXX Note that this does not parse process.env like run() does...
const transformStream = await getTransformStream({
  logFormat: process.env.NODE_ENV === "production" ? "json" : "pretty",
  logLevelInString: true,
  // sentryDsn for sentry.io
});
transformStream.pipe(pino.destination(1) as unknown as NodeJS.WritableStream);
const log = pino(
  {
    level: "info",
    name: "probot",
    messageKey: "msg",
  },
  transformStream
);

const express = Express();

const probot = createProbot({
  overrides: {
    log,
  },
});
express.use(
  await createNodeMiddleware(app, {
    webhooksPath: "/api/github/webhooks",
    probot,
  })
);

express.use("/classbot", webRoutes("/classbot", { logger: log }));

async function logInstallations() {
  // Log installations
  const octokit = await probot.auth();
  const resp = await octokit.rest.apps.listInstallations();
  const installations = resp.data;
  log.info(
    "Installations:\n" +
      installations
        .map(
          inst => `${inst.id}: ${inst.account?.name} <${inst.account?.login}> (${inst.account?.id})`
        )
        .join("\n")
  );
}
await logInstallations();

const serverPort = parseInt(process.env.PORT || "3000");
express.listen(serverPort, () => {
  log.info(`Server is running at http://localhost:${serverPort}`);
});
