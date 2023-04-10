import querystring from "node:querystring";
import express from "express";
import fetch from "node-fetch";

import { Logger, ProbotOctokit } from "probot";

import { HTTPError } from "./types";
import { RelationExpression } from "objection";
import { User, UserRole } from "./db/models/user";

export class AuthError extends HTTPError {
  constructor(message?: string, status?: number) {
    super(message, status || 401); // HTTP 401 Unauthorized (default)
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
  userFetchRelations?: RelationExpression<User>; // Relations to load eagerly, when loadUser is set
  logger?: Logger;
}

type LoginReqQuery = { path?: string };

export function oauthRoutes(org_name: string, options?: OAuthRoutesOptions) {
  const router = express.Router();
  const log = options?.logger;

  router.get("/login", (req, res) => {
    log?.info(`OAuth login: baseUrl = ${req.baseUrl}`);
    const { path: reqPath }: LoginReqQuery = req.query;
    const redirect = reqPath || options?.redirect || "/";

    if (req.session.data && req.session.data.username) {
      // Send them back (where they came from)
      res.redirect(redirect);
      return;
    }

    // TODO? Should defer to "trust proxy" express setting
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");

    const params = querystring.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: `${protocol}://${host}${req.baseUrl}/cb`,
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
        log?.info(`OAuth cb: baseUrl = ${req.baseUrl}`);
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
        log?.info(`User..findById(${userid}) ->\n${JSON.stringify(user, undefined, 2)}`);

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
        const stateParam = typeof req.query.state === "string" ? req.query.state : undefined;
        res.redirect(stateParam || options?.redirect || "/");
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
  const log = options?.logger;

  const handler: express.RequestHandler = (req, res, next) =>
    Promise.resolve()
      .then(async () => {
        const userData = req.session.data;
        if (userData && userData.userid) {
          log?.info(`Session user ${userData.username} (${userData.userid})`);
          if (options?.loadUser === true) {
            let query = User.query().findById(userData.userid);
            if (options?.userFetchRelations !== undefined) {
              query = query.withGraphFetched(options.userFetchRelations);
            }
            req.user = await query;
            if (req.user === undefined) {
              throw new AuthError(`Session cookie without matching userid ${userData.userid}`, 500);
            }
          }
          next();
        } else {
          const url = `${req.baseUrl}/${req.url}`;
          log?.info(`No session cookie, redirecting from ${url} to ${login_url}`);
          res.redirect(`${login_url}?${querystring.stringify({ path: url })}`);
        }
      })
      .catch(next);
  return handler;
}

export function requireRole(roles: readonly UserRole[]): express.RequestHandler;
export function requireRole(...roles: readonly UserRole[]): express.RequestHandler;
export function requireRole(
  ...args: readonly (UserRole | readonly UserRole[])[]
): express.RequestHandler {
  const roles = args[0] instanceof Array ? args[0] : (args as readonly UserRole[]);
  const handler: express.RequestHandler = (req, _res, next) => {
    if (!req.user?.role) {
      next(new AuthError("Unknown user role"));
    } else if (!roles.includes(req.user.role)) {
      next(new AuthError("User does not have required role privileges", 403)); // HTPP Forbidden
    } else {
      // console.log(`User role ${req.user.role} satisfies requirement ${JSON.stringify(roles)}`);
      next();
    }
  };
  return handler;
}
