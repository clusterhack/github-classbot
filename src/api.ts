import qs from "qs";
import express from "express";
import bodyParser from "body-parser";

import { Logger } from "probot";
import { Model } from "objection";
import LinkHeader from "http-link-header";

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

// Extend Express Locals interface with our response locals
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: User;
      org?: ClassroomOrg;
      pagination?: PaginationParams;
    }
  }
}

interface PaginationParams {
  offset: number;
  per_page: number;
  link_header: LinkHeader;
}

function paginationMiddleware(default_per_page = 20, max_per_page = 60) {
  const handler: express.RequestHandler = (req, res, next) => {
    const per_page = Math.min(
      parseInt(req.query.per_page as string) || default_per_page,
      max_per_page
    );
    const offset = parseInt(req.query.offset as string) || 0;

    // Remove offset and per_page params that may be present
    const { offset: _offset, per_page: _per_page, ...query_rest } = req.query;
    const link_header = new LinkHeader();
    const link_url = `${req.protocol}://${req.hostname}${req.baseUrl}${req.path}`; // without query params
    const link_query = {
      ...query_rest,
      ...(per_page !== default_per_page && { per_page: per_page }),
    };
    link_header.set({ rel: "first", uri: `${link_url}?${qs.stringify(link_query)}` });
    link_header.set({
      rel: "next",
      uri: `${link_url}?${qs.stringify({ ...link_query, offset: offset + per_page })}`,
    });
    // XXX? Do we *really* need rel=prev link ...
    if (offset !== 0) {
      const prev_offset = offset - per_page;
      const prev_query = {
        ...link_query,
        ...(prev_offset > 0
          ? { offset: prev_offset }
          : prev_offset !== 0 && { per_page: per_page + prev_offset }),
      };
      link_header.set({ rel: "prev", uri: `${link_url}?${qs.stringify(prev_query)}` });
    }

    res.locals.pagination = { per_page, offset, link_header };
    res.header("Link", link_header.toString());
    next();
  };
  return handler;
}

type GetRecordsQuery = {
  userid: number | null; // XXX Do *not* allow undefined...
  orgName?: string | null;
  assignmentName?: string | null;
};

// TODO Refactor: base class for Submission | Assignment
// TODO Fix type annotations mess (narrow return type to promise of modelClass array, not Model array)
async function getRecords(
  modelClass: typeof Model,
  where: GetRecordsQuery, // Omit a field to fetch all records (regardless of that field's value)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchRelExpr: any = { assignment: true },
  sortColumn = "id",
  pagination?: Readonly<Omit<PaginationParams, "link_header">>
) {
  if (where === undefined) {
    // Yes, paranoia, but better safe...
    throw new APIError("Missing opts in getRecords()?!", 500);
  }
  if (where.userid === undefined) {
    // For safety reasons (again paranoia), don't allow undefined userid;
    //   use null instead to include all users
    throw new APIError("Missing opts.userid parameter in getRecords()!", 500);
  }
  let query = modelClass.query();
  if (where.userid !== null) query = query.where("userid", where.userid);
  if (where.orgName || where.assignmentName) {
    // Include assignment.org anyway (even if opts.orgName is undefined)
    if (typeof fetchRelExpr.assignment === "object") {
      fetchRelExpr.assignment.org = true;
    } else {
      fetchRelExpr.assignment = { org: true };
    }
    if (where.orgName) query = query.where("assignment:org:name", where.orgName);
    if (where.assignmentName) query = query.where("assignment:name", where.assignmentName);
  }
  if (pagination) query = query.offset(pagination.offset).limit(pagination.per_page);
  const rows = await query
    .orderBy(sortColumn, "desc")
    .withGraphJoined(fetchRelExpr, { joinOperation: "leftJoin" });
  // TODO? Flatten .code and/or .assignment sub-objs?
  return rows;
}

export class APIError extends HTTPError {}

type RecordsParamFn<T> = (req: express.Request, res: express.Response) => T;
type RecordsHandlerOptions = {
  getUserId: RecordsParamFn<number> | null;
  fetchRelExpr?: object;
  sortColumn?: string;
  bareResponse?: boolean;
};

// TODO Current fn API might make it easy to accidentally reveal other/all users' records?
//   Random thoughts/notes: instead of null, use a special ANY_USER const or similar?
function getRecordsHandler(modelClass: typeof Model, opts: RecordsHandlerOptions) {
  // Default option values (if unspecified)
  const fetchRelExpr = opts.fetchRelExpr || { assingment: true };
  const sortColumn = opts.sortColumn || "id";

  return asyncHandleExceptions(async (req, res) => {
    const where: GetRecordsQuery = {
      userid: opts.getUserId && opts.getUserId(req, res),
      orgName: req.params.orgname,
      assignmentName: req.params.assname,
    };
    const data = await getRecords(
      modelClass,
      where,
      fetchRelExpr,
      sortColumn,
      res.locals.pagination
    );
    if (res.locals.pagination && !opts.bareResponse) {
      res.json({
        per_page: res.locals.pagination.per_page,
        offset: res.locals.pagination.offset,
        data: data,
      });
    } else {
      res.json(data);
    }
  });
}

export function apiRoutes(options?: APIRouteOptions) {
  const log = options?.logger;

  // TODO Refactor duplication below (any recordhandler is always together with the pagination handler..)
  const paginationQueryHandler = paginationMiddleware();

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
  const selfSubmissionsHandlers: express.RequestHandler[] = [
    paginationQueryHandler,
    getRecordsHandler(Submission, {
      getUserId: (req, _res) => req.user!.id,
      fetchRelExpr: { assignment: true, code: true },
    }),
  ];
  selfRouter.get("/submissions", selfSubmissionsHandlers);
  selfRouter.get("/org/:orgname/submissions", selfSubmissionsHandlers);
  selfRouter.get("/org/:orgname/assignment/:assname/submissions", selfSubmissionsHandlers);
  const selfAlertsHandlers: express.RequestHandler[] = [
    paginationQueryHandler,
    getRecordsHandler(Alert, {
      getUserId: (req, _res) => req.user!.id,
    }),
  ];
  selfRouter.get("/alerts", selfAlertsHandlers);
  selfRouter.get("/org/:orgname/alerts", selfAlertsHandlers);
  selfRouter.get("/org/:orgname/assignment/:assname/alerts", selfAlertsHandlers);
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
        if (!Object.keys(user).every(k => allowedFields.includes(k))) {
          // XXX Yech..?
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
        const updatedUser = await User.query().patchAndFetchById(res.locals.user!.id, req.body);
        // TODO! Sort out error handling (undefined and/or exception from patchAndFetchById)
        res.json(updatedUser);
      })
    );
  const adminUserSubmissionsHandlers: express.RequestHandler[] = [
    paginationQueryHandler,
    getRecordsHandler(Submission, {
      getUserId: (_req, res) => res.locals.user!.id,
      fetchRelExpr: { assignment: true, code: true },
    }),
  ];
  adminUserRouter.get("/submissions", adminUserSubmissionsHandlers);
  adminUserRouter.get("/org/:orgname/submissions", adminUserSubmissionsHandlers);
  adminUserRouter.get(
    "/org/:orgname/assignment/:assname/submissions",
    adminUserSubmissionsHandlers
  );
  const adminUserAlertsHandlers: express.RequestHandler[] = [
    paginationQueryHandler,
    getRecordsHandler(Alert, {
      getUserId: (_req, res) => res.locals.user!.id,
    }),
  ];
  adminUserRouter.get("/alerts", adminUserAlertsHandlers);
  adminUserRouter.get("/org/:orgname/alerts", adminUserAlertsHandlers);
  adminUserRouter.get("/org/:orgname/assignment/:assname/alerts", adminUserAlertsHandlers);

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
      if (!Object.keys(org).every(k => allowedFields.includes(k))) {
        // XXX Yech..?
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
  const adminOrgSubmissionsHandlers: express.RequestHandler[] = [
    paginationQueryHandler,
    getRecordsHandler(Submission, {
      getUserId: null,
      fetchRelExpr: { assignment: true, code: true },
    }),
  ];
  adminOrgRouter.get("/submissions", adminOrgSubmissionsHandlers);
  adminOrgRouter.get("/assignment/:assname/submissions", adminOrgSubmissionsHandlers);
  const adminOrgAlertsHandlers: express.RequestHandler[] = [
    paginationQueryHandler,
    getRecordsHandler(Alert, { getUserId: null }),
  ];
  adminOrgRouter.get("/alerts", adminOrgAlertsHandlers);
  adminOrgRouter.get("/assignment/:assname/alerts", adminOrgAlertsHandlers);

  return apiRouter;
}
