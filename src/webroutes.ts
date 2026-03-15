import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
// eslint-disable-next-line node/no-unpublished-import
import { createProxyMiddleware } from "http-proxy-middleware"; // Only used for dev server
import { Logger } from "probot";

import { isEnvTruthy } from "./util.js";
import { sessionMiddleware } from "./session.js";
import { authMiddleware, oauthRoutes } from "./auth.js";
import { apiRoutes } from "./api.js";

// Polyfill for __dirname
// XXX For node >= 21.2.0, could just use import.meta.dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/***********************************************************************
 * Additional routes
 */

export interface WebRouteOptions {
  logger?: Logger;
}

// TODO? Is routePrefix necessary?
export function webRoutes(routePrefix: string, options?: WebRouteOptions) {
  const log = options?.logger;
  const router = express.Router();

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
      redirect: routePrefix,
      logger: log?.child({ name: "oauth-login" }),
    })
  );

  // User authentication
  router.use(
    authMiddleware(`${routePrefix}/oauth/login`, {
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
    // Fallback route, to make GET requests directly into react-router routes work correctly..
    router.get("/ui/*splat", (_req, res) => {
      res.sendFile(path.join(__dirname, "../lib-ui/index.html"));
    });
  } else {
    // Proxy to dev server (easier this way around, with all the webhook HTTPS stuff etc)
    log?.info("Frontend: proxying to Vite dev server");
    router.use(
      "/ui",
      createProxyMiddleware({
        target: `http://localhost:${process.env.VITE_DEV_PORT || 4000}/classbot/ui`,
        ws: true,
      })
    );
  }

  // XXX Just for basic testing...
  router.get("/", (req, res) => {
    const name = req.user?.name || req.session.data?.userid;
    res.send(`Hello, ${name}!`);
  });

  return router;
}
