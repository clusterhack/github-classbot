import querystring from "node:querystring";
import express from "express";
import fetch from "node-fetch";

import { Logger, ProbotOctokit } from "probot";

import { User, UserRole } from "./db/models/user";

export class AuthError extends Error {
  status: number;

  constructor(message?: string, status?: number) {
    super(message);
    this.status = status || 401; // HTTP 401 Unauthorized (default)
  }
}

export class OAuthError extends AuthError {}

export interface OAuthRoutesOptions {
  redirect?: string;
  requireUser?: boolean; // If true, new User db records won't be automatically created
  logger?: Logger;
}

export interface AuthMiddlewareOptions {
  loadUser?: boolean; // If true, User db record will be retrieved into req.user
  logger?: Logger;
}

type LoginReqQuery = { path?: string };

export function oauthRoutes(route_path: string, org_name: string, options?: OAuthRoutesOptions) {
  const router = express.Router();
  const log = options?.logger;

  router.get("/login", (req, res) => {
    const { path: reqPath }: LoginReqQuery = req.query;
    const redirect = reqPath || options?.redirect || "/";

    if (req.session.data && req.session.data.username) {
      res.redirect(redirect);
      return;
    }

    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");

    const params = querystring.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: `${protocol}://${host}${route_path}/cb`,
      allow_signup: false,
      scope: "",
      // TODO? Add random prefix to state (eventually?); if so, don't forget cb route below..
      state: redirect,
    });

    log?.info(`OAuth params:\n${JSON.stringify(params, undefined, 2)}`);

    const url = `https://github.com/login/oauth/authorize?${params}`;
    res.redirect(url);
  });

  router.get("/cb", (req, res, next) =>
    Promise.resolve()
      .then(async () => {
        // Deal with errors first
        if (req.query.error) {
          throw new OAuthError((req.query.error_description || req.query.error) as string);
        }

        // Exchange our "code" and credentials for a real token
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          // Use our app's OAuth credentials and the code that GitHub gave us
          body: new URLSearchParams({
            client_id: process.env.GITHUB_CLIENT_ID as string,
            client_secret: process.env.GITHUB_CLIENT_SECRET as string,
            code: req.query.code as string,
          }),
        });
        if (tokenRes.status !== 200) {
          log?.info(`OAuth token request failed with HTTP ${tokenRes.status}`);
          throw new OAuthError("OAuth token request failed", tokenRes.status); // TODO? Double-check status
        }

        // const token = tokenRes.body.access_token
        const tokenData = new URLSearchParams(await tokenRes.text());
        log?.info(`OAuth token response data:\n${tokenData}`);
        const access_token = tokenData.get("access_token");
        if (!access_token) {
          throw new OAuthError("Invalid OAuth token response");
        }

        // Get user id and login
        const octokit = new ProbotOctokit({
          auth: {
            token: access_token,
          },
          log: log, // TODO? Is this necessary (or else, should it be a child?)
        });
        const authRes = await octokit.users.getAuthenticated();
        if (authRes.status !== 200) {
          throw new OAuthError("Cannot get authenticated user", authRes.status); // TODO? Double-check status
        }
        log?.info(`getAuthenticated:\n${JSON.stringify(authRes.data, undefined, 2)}`);
        const { id: userid, login: username } = authRes.data;

        // Check if user exists
        const user = await User.query().findById(userid);
        log?.info(`User..findById(${userid}) -> ${user}`);

        // Create user if they do not exist
        if (user === undefined) {
          if (options?.requireUser === true) {
            throw new OAuthError(`Username ${username} does not exist (new users not allowed)`);
          }

          // Get user's org role
          let userRole = UserRole.MEMBER; // Safe default
          try {
            const memberRes = await octokit.orgs.getMembershipForUser({
              org: org_name,
              username: username,
            });
            // Students may be external collaborators of org, not full members...
            // TODO? If this fails (with 404 not found or 403 forbidden),
            //   ideally we should verify external collaborator status (but which GH API endpoint?)
            if (
              memberRes.status === 200 &&
              memberRes.data.state === "active" &&
              memberRes.data.role === "admin"
            ) {
              userRole = UserRole.ADMIN;
            }
          } catch (err) {
            log?.info(`Error getting user org membership: ${err}`);
          }

          await User.query().insert({
            id: userid,
            username: username,
            role: userRole,
            name: authRes.data.name || undefined,
          });
          log?.info(`Inserted new user ${username} (${userid}) with ${userRole} role`);
        }

        req.session.data = { userid, username };
        log?.info(`Set session.data to:\n${JSON.stringify(req.session.data, undefined, 2)}`);

        // Redirect after login
        res.redirect(tokenData.get("state") || options?.redirect || "/");
      })
      .catch(next)
  );

  return router;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Inject user property on express.Request
    interface Request {
      user?: User;
    }
  }
}

export function authMiddleware(login_url: string, options?: AuthMiddlewareOptions) {
  const handler: express.RequestHandler = (req, res, next) =>
    Promise.resolve()
      .then(async () => {
        const userData = req.session.data;
        if (userData && userData.userid) {
          options?.logger?.info(`Session user ${userData.username} (${userData.userid})`);
          if (options?.loadUser === true) {
            req.user = await User.query().findById(userData.userid);
            if (req.user === undefined) {
              throw new AuthError(`Session cookie without matching userid ${userData.userid}`, 500);
            }
          }
          next();
        } else {
          options?.logger?.info("No user session cookie, redirecting to login");
          res.redirect(`${login_url}?${querystring.stringify({ path: req.path })}`);
        }
      })
      .catch(next);
  return handler;
}
