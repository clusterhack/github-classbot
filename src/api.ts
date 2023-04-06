import express from "express";
import bodyParser from "body-parser";

import { Logger } from "probot";
import { Model } from "objection";

import { HTTPError } from "./types";
import { requireRole } from "./auth";
import { asyncHandleExceptions, stringEnumValues } from "./util";
import { User, UserRole } from "./db/models/user";
import { Assignment, ClassroomOrg } from "./db/models/classroom";
import { Submission } from "./db/models/submission";
import { Alert } from "./db/models/alert";

// TODO? Extend express.Request interface with .locals.user optional key

export interface APIRouteOptions {
  logger?: Logger;
}

type GetRecordsOptions = { orgName?: string; assignmentName?: string; userid?: number };

// TODO Refactor: base class for Submission | Assignment
// TODO Fix type annotations mess (narrow return type to promise of modelClass array, not Model array)
async function getRecords(
  modelClass: typeof Model,
  opts?: GetRecordsOptions, // Omit an option to fetch all records (regardless of that value)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchRelExpr: any = { assignment: true }
) {
  let query = modelClass.query();
  if (opts?.orgName || opts?.assignmentName) {
    // Include assignment.org anyway (even if opts.orgName is undefined)
    if (typeof fetchRelExpr.assignment === "object") {
      fetchRelExpr.assignment.org = true;
    } else {
      fetchRelExpr.assignment = { org: true };
    }
    if (opts?.orgName) query = query.where("assignment:org:name", opts.orgName);
    if (opts?.assignmentName) query = query.where("assignment:name", opts.assignmentName);
  }
  if (opts?.userid) query = query.where("userid", opts.userid);
  const rows = await query.withGraphJoined(fetchRelExpr, { joinOperation: "leftJoin" });
  // TODO? Flatten .code and/or .assignment sub-objs?
  return rows;
}

export class APIError extends HTTPError {}

// TODO! Current fn API might make it easy to accidentally reveal other/all users' records?
//   Random thoughts/notes: add (semi-)redundant config dict specifying required param opt values,
//     push role auth checks here (or even further, eg db backend? meh..), break this into
//     separate functions, ...other?
function getRecordsHandler(
  modelClass: typeof Model,
  getUserId?: (req: express.Request, res: express.Response) => number,
  fetchRelExpr: object = { assignment: true }
) {
  return asyncHandleExceptions(async (req, res) => {
    const opts: GetRecordsOptions = {
      userid: getUserId && getUserId(req, res),
      orgName: req.params.orgname,
      assignmentName: req.params.assname,
    };
    const data = await getRecords(modelClass, opts, fetchRelExpr);
    res.json(data);
  });
}

export function apiRoutes(options?: APIRouteOptions) {
  const log = options?.logger;

  const requireUser = requireRole(UserRole.MEMBER, UserRole.ADMIN);
  const requireAdmin = requireRole(UserRole.ADMIN);

  // Middleware to validate :userid parameter and fetch corresponding user record from database
  // TODO Seems express has API for param validation/parsing? RTFM when time, and use that instead..?
  const validateUserIdParam = asyncHandleExceptions(async (req, res, next) => {
    const userid = parseInt(req.params.userid);
    if (isNaN(userid)) {
      throw new APIError("Invalid userid URL path parameter: ${req.params.userid}");
    }
    const user = await User.query().findById(userid).withGraphFetched("orgs.assignments");
    if (user === undefined) {
      throw new APIError(`Invalid user id: ${userid}`);
    }
    log?.info(`Validated userid path param to ${userid}`);
    res.locals.user = user;
    next();
  });
  // Ditto, but for :orgname parameter // TODO Ditto (post-RTFM)
  // TODO!! Need to rewrite getRecord handler to incorporate this...
  // const validateOrgNameParam = asyncHandleExceptions(async (req, res, next) => {
  //   const orgname = req.params.orgname;
  //   const org = await ClassroomOrg.query().where("name", orgname).first();
  //   if (org === undefined) {
  //     throw new APIError(`Invalid org name: ${orgname}`);
  //   }
  //   res.locals.org = org;
  // });

  const apiRouter = express.Router();
  apiRouter.use(bodyParser.json());

  // ***********************************************************************

  const selfRouter = express.Router();
  apiRouter.use("/self", selfRouter);

  selfRouter.use(requireUser);
  selfRouter.get("/profile", (req, res) => res.json(req.user));
  // eslint-disable-next-line prettier/prettier
  const selfSubmissionsHandler = getRecordsHandler(
    Submission,
    (req, _res) => req.user!.id,
    { assignment: true, code: true } // XXX prettier parser seems to barf here without this comment..
  );
  selfRouter.get("/submissions", selfSubmissionsHandler);
  selfRouter.get("/org/:orgname/submissions", selfSubmissionsHandler);
  selfRouter.get("/org/:orgname/assignment/:assname/submissions", selfSubmissionsHandler);
  const selfAlertsHandler = getRecordsHandler(Alert, (req, _res) => req.user!.id);
  selfRouter.get("/alerts", selfAlertsHandler);
  selfRouter.get("/org/:orgname/alerts", selfAlertsHandler);
  selfRouter.get("/org/:orgname/assignment/:assname/alerts", selfAlertsHandler);
  // TODO? Refactor triplet handler registration (above) to util function (and use below as well)
  //  Or, does express API allow specifying multiple routes as eg array (RTFM, when time)?

  // ***********************************************************************

  apiRouter.post(
    "/user/create",
    requireAdmin,
    asyncHandleExceptions(async (req, res) => {
      if (req.body === undefined) {
        throw new APIError("Missing request body");
      }
      const users = req.body instanceof Array ? req.body : [req.body];
      const allowedFields = ["user", "username", "sisId", "role", "name"];
      // TODO All this validation shouldn't be necessary once we add JSON schemas to db models...
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const validateUser = (user: any) => {
        if (typeof user.id !== "number") {
          throw new APIError(`Missing or malformed id in ${user}`);
        }
        if (typeof user.username !== "string") {
          throw new APIError(`Missing or malformed username in ${user}`);
        }
        if (user.role && !stringEnumValues(UserRole).includes(user.role)) {
          throw new APIError(`Invalid role in ${user}`);
        }
        if (!Object.keys(user).every(k => allowedFields.includes(k))) { // XXX Yech..?
          throw new APIError(`Unexpected field in ${user}`);
        }
      };
      users.forEach(u => validateUser(u));
      const result = await User.query().insertAndFetch(users);
      res.json(result);
    })
  );

  const adminUserRouter = express.Router({ mergeParams: true });
  apiRouter.use("/user/:userid", adminUserRouter);

  adminUserRouter.use(requireAdmin);
  adminUserRouter.use(validateUserIdParam);
  adminUserRouter
    .route("/profile")
    .get((_req, res) => {
      log?.info(`Admin / get user profile:\n${JSON.stringify(res.locals.user)}`);
      res.json(res.locals.user);
    })
    .put(
      asyncHandleExceptions(async (req, res) => {
        // Validate request body parameters
        const allowedFields = ["name", "sisId", "role"];
        if (req.body === undefined) {
          throw new APIError("Missing request body");
        }
        if (!Object.keys(req.body).every(k => allowedFields.includes(k))) {
          throw new APIError("Unexpected field found in request body");
        }
        // Update database
        const updatedUser = await User.query().patchAndFetchById(res.locals.user.id, req.body);
        // TODO! Sort out error handling (undefined and/or exception from patchAndFetchById)
        res.json(updatedUser);
      })
    );
  const adminUserSubmissionsHandler = getRecordsHandler(
    Submission,
    (_req, res) => res.locals.user.id,
    { assignment: true, code: true }
  );
  adminUserRouter.get("/submissions", adminUserSubmissionsHandler);
  adminUserRouter.get("/org/:orgname/submissions", adminUserSubmissionsHandler);
  adminUserRouter.get("/org/:orgname/assignment/:assname/submissions", adminUserSubmissionsHandler);
  const adminUserAlertsHandler = getRecordsHandler(Alert, (_req, res) => res.locals.user.id);
  adminUserRouter.get("/alerts", adminUserAlertsHandler);
  adminUserRouter.get("/org/:orgname/alerts", adminUserAlertsHandler);
  adminUserRouter.get("/org/:orgname/assignment/:assname/alerts", adminUserAlertsHandler);

  // ***********************************************************************

  apiRouter.post(
    "/org/create",
    requireAdmin,
    asyncHandleExceptions(async (req, res) => {
      if (req.body === undefined) {
        throw new APIError("Missing request body");
      }
      const org = req.body;
      const allowedFields = ["id", "name", "description"];
      // TODO All this validation shouldn't be necessary once we add JSON schemas to db models...
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof org.id !== "number") {
        throw new APIError("Missing or malformed id field");
      }
      if (typeof org.name !== "string") {
        throw new APIError("Missing or malformed name field");
      }
      if (!Object.keys(org).every(k => allowedFields.includes(k))) { // XXX Yech..?
        throw new APIError("Unexpected field");
      }
      const result = ClassroomOrg.query().insertAndFetch(org);
      res.json(result);
    })
  );

  const adminOrgRouter = express.Router({ mergeParams: true });
  apiRouter.use("/org/:orgname", adminOrgRouter);

  adminOrgRouter.use(requireAdmin);
  adminOrgRouter.get(
    "/assignments",
    asyncHandleExceptions(async (req, res) => {
      log?.info(`Get assignments url: ${req.url} baseUrl: ${req.baseUrl}`);
      log?.info(`Get assignments req.params: ${JSON.stringify(req.params, undefined, 2)}`);
      const _query = Assignment.query().where("org", req.params.orgname);
      log?.info(`Get assignments query: ${_query}`);
      const data = await _query;
      res.json(data);
    })
  );
  const adminOrgSubmissionsHandler = getRecordsHandler(Submission, undefined, {
    assignment: true,
    code: true,
  });
  adminOrgRouter.get("/submissions", adminOrgSubmissionsHandler);
  adminOrgRouter.get("/assignment/:assname/submissions", adminOrgSubmissionsHandler);
  const adminOrgAlertsHandler = getRecordsHandler(Alert);
  adminOrgRouter.get("/alerts", adminOrgAlertsHandler);
  adminOrgRouter.get("/assignment/:assname/alerts", adminOrgAlertsHandler);

  return apiRouter;
}
