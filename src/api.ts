import express from "express";
import bodyParser from "body-parser";

import { Logger } from "probot";
import { Model } from "objection";

import { HTTPError } from "./types";
import { requireRole } from "./auth";
import { asyncHandleExceptions } from "./util";
import { User, UserRole } from "./db/models/user";
import { Assignment, Submission } from "./db/models/assignment";
import { Alert } from "./db/models/alert";

// TODO? Extend express.Request interface with .locals.user optional key

export interface APIRouteOptions {
  logger?: Logger;
}

type GetRecordsOptions = { org?: string; assignmentName?: string; userid?: number };

// TODO Refactor: base class for Submission | Assignment
// TODO Fix type annotations mess (narrow return type to promise of modelClass array, not Model array)
async function getRecords(
  modelClass: typeof Model,
  opts?: GetRecordsOptions, // Omit an option to fetch all records (regardless of that value)
  fetchRelations = ["assignment"]
) {
  let query = modelClass.query();
  if (opts?.org || opts?.assignmentName) {
    if (!fetchRelations.includes("assignment")) {
      fetchRelations.push("assignment");
    }
    if (opts?.org) query = query.where("assignment:org", opts.org);
    if (opts?.assignmentName) query = query.where("assignment:name", opts.assignmentName);
  }
  if (opts?.userid) query = query.where("userid", opts.userid);
  const graphRelExpr = fetchRelations.reduce(
    (expr, rel) => Object.assign(expr, { [rel]: true }),
    {}
  );
  const rows = await query.withGraphJoined(graphRelExpr, { joinOperation: "leftJoin" });
  // TODO? Flatten .code and/or .assignment sub-objs?
  return rows;
}

// TODO Common HTTPError subclass for all error classes (AuthError, APIError, etc)
export class APIError extends HTTPError {}

// TODO! Current fn API might make it easy to accidentally reveal other/all users' records?
//   Random thoughts/notes: add (semi-)redundant config dict specifying required param opt values,
//     push role auth checks here (or even further, eg db backend? meh..), break this into
//     separate functions, ...other?
function getRecordsHandler(
  modelClass: typeof Model,
  getUserId?: (req: express.Request, res: express.Response) => number,
  fetchRelations = ["assignment"]
) {
  return asyncHandleExceptions(async (req, res) => {
    const opts = {
      userid: getUserId && getUserId(req, res),
      org: req.params.orgname,
      assignmentName: req.params.assname,
    };
    const data = await getRecords(modelClass, opts, fetchRelations);
    res.json(data);
  });
}

export function apiRoutes(options?: APIRouteOptions) {
  const log = options?.logger;

  const requireUser = requireRole(UserRole.MEMBER, UserRole.ADMIN);
  const requireAdmin = requireRole(UserRole.ADMIN);

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
    ["assignment", "code"] // XXX prettier parser seems to barf here..
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

  // Middleware to validate :userid parameter and fetch corresponding user record from database
  // TODO Seems express has API for param validation/parsing? RTFM when time, and use that instead..?
  const validateUserIdParam = asyncHandleExceptions(async (req, res, next) => {
    const userid = parseInt(req.params.userid);
    if (isNaN(userid)) {
      throw new APIError("Invalid userid URL path parameter: ${req.params.userid}");
    }
    const user = await User.query().findById(userid);
    if (user === undefined) {
      throw new APIError(`Invalid user id: ${userid}`);
    }
    log?.info(`Validated userid path param to ${userid}`);
    res.locals.user = user;
    next();
  });

  // ***********************************************************************

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
    ["assignment", "code"]
  );
  adminUserRouter.get("/submissions", adminUserSubmissionsHandler);
  adminUserRouter.get("/org/:orgname/submissions", adminUserSubmissionsHandler);
  adminUserRouter.get("/org/:orgname/assignment/:assname/submissions", adminUserSubmissionsHandler);
  const adminUserAlertsHandler = getRecordsHandler(Alert, (_req, res) => res.locals.user.id);
  adminUserRouter.get("/alerts", adminUserAlertsHandler);
  adminUserRouter.get("/org/:orgname/alerts", adminUserAlertsHandler);
  adminUserRouter.get("/org/:orgname/assignment/:assname/alerts", adminUserAlertsHandler);

  // ***********************************************************************

  const orgRouter = express.Router({ mergeParams: true }); // All except one routes require admin role
  apiRouter.use("/org/:orgname", orgRouter);

  orgRouter.get(
    "/assignments",
    requireUser, // auth role check
    asyncHandleExceptions(async (req, res) => {
      log?.info(`Get assignments url: ${req.url} baseUrl: ${req.baseUrl}`);
      log?.info(`Get assignments req.params: ${JSON.stringify(req.params, undefined, 2)}`);
      const _query = Assignment.query().where("org", req.params.orgname);
      log?.info(`Get assignments query: ${_query}`);
      const data = await _query;
      res.json(data);
    })
  );

  const adminOrgRouter = express.Router({ mergeParams: true }); // All orgRouter sub-routes that require admin role
  orgRouter.use(adminOrgRouter);

  adminOrgRouter.use(requireAdmin);
  const adminOrgSubmissionsHandler = getRecordsHandler(Submission, undefined, [
    "assignment",
    "code",
  ]);
  adminOrgRouter.get("/submissions", adminOrgSubmissionsHandler);
  adminOrgRouter.get("/assignment/:assname/submissions", adminOrgSubmissionsHandler);
  const adminOrgAlertsHandler = getRecordsHandler(Alert);
  adminOrgRouter.get("/alerts", adminOrgAlertsHandler);
  adminOrgRouter.get("/assignment/:assname/alerts", adminOrgAlertsHandler);

  return apiRouter;
}
