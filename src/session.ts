import { EventEmitter } from "node:events";
import session, { CookieOptions, SessionOptions, SessionData, Store } from "express-session";
import { Logger } from "probot";

import { UserSession, UserSessionData } from "./db/models/user";

export interface SessionMiddlewareOptions {
  logger?: Logger;
  path?: string;
  proxy?: SessionOptions["proxy"];
  httpOnly?: CookieOptions["httpOnly"];
  sameSite?: CookieOptions["sameSite"];
  secure?: CookieOptions["secure"];
}

// Extend SessionData interface with UserSession model
declare module "express-session" {
  interface SessionData {
    data: UserSessionData;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionStoreCallback = (err?: any, session?: SessionData | null) => void;
const noop: SessionStoreCallback = () => {};

// XXX Can't figure out how to import EventEmitterOptions directly, so..
//   (based on https://stackoverflow.com/a/50677584)
type OptionsArgType<T> = T extends [options?: infer U] ? U : never;
export type SessionStoreOptions = OptionsArgType<ConstructorParameters<typeof EventEmitter>> & {
  logger?: Logger;
};

class SessionStore extends Store {
  private log?: Logger;

  constructor(options?: SessionStoreOptions) {
    super(options);
    this.log = options?.logger;
  }

  async get(sid: string, callback: SessionStoreCallback): Promise<void> {
    const cb = callback || noop;
    try {
      const rec = await UserSession.query().findById(sid);
      if (rec === undefined || rec.expires <= new Date()) {
        this.log?.info(`SessionStore.get: ${sid} not found`);
        cb(null, null);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, expires, cookie, ...data } = rec;
      const session: SessionData = {
        data,
        cookie: typeof cookie === "string" ? JSON.parse(cookie) : cookie,
      };
      cb(null, session);
    } catch (err) {
      cb(err);
    }
  }
  async set(sid: string, session: SessionData, callback?: SessionStoreCallback): Promise<void> {
    const cb = callback || noop;
    const maxAge = session.cookie.maxAge || 24 * 3600 * 1000;
    const expires = new Date(Date.now() + maxAge); // Used for expiration condition
    try {
      await UserSession.query()
        .insert({
          id: sid,
          expires,
          cookie: JSON.stringify(session.cookie),
          ...session.data,
        })
        .onConflict()
        .merge();
      this.log?.info(`SessionStore.set: ${sid} upserted`);
      cb();
    } catch (err) {
      this.log?.error(`SessionStore.set: error upserting ${sid}: ${err}`);
      cb(err);
    }
  }
  async destroy(sid: string, callback?: SessionStoreCallback): Promise<void> {
    const cb = callback || noop;
    try {
      // TODO Verify expected behavior in this case (no error on non-existend sid)..
      const nrows = await UserSession.query().deleteById(sid);
      this.log?.info(`SessionStore.destroy: deleted ${nrows} for session ${sid}`);
      cb();
    } catch (err) {
      this.log?.error(`SessionStore.destroy: error deleting ${sid}: ${err}`);
      cb(err);
    }
  }

  // TODO Implement touch() method
}

export async function sessionGarbageCollect(): Promise<number> {
  // Return number of deleted rows
  return await UserSession.query().delete().where("expires", "<", new Date());
}

export function sessionMiddleware(options?: SessionMiddlewareOptions) {
  if (!process.env.COOKIE_SECRET) {
    throw new Error("Cookie secret not in environment!");
  }

  const log = options?.logger;

  if (options?.sameSite === "none" && options?.secure !== true) {
    throw new Error("Cookie sameSite: 'none' also requires secure: true");
  }
  if (options?.secure === true && options?.proxy !== true) {
    log?.warn("Cookie secure: true without proxy: true; could cause issues behind reverse proxy");
  }

  return session({
    secret: process.env.COOKIE_SECRET,
    name: "CLASSBOT",
    store: new SessionStore({ logger: log }),
    saveUninitialized: false,
    resave: true, // TODO Set false after implementing store touch() method
    proxy: options?.proxy,
    cookie: {
      path: options?.path || "/classbot",
      httpOnly: options?.httpOnly !== undefined ? options.httpOnly : true,
      sameSite: options?.sameSite,
      secure: options?.secure,
      maxAge: parseInt(process.env.COOKIE_TTL_DAYS || "1") * 24 * 3600 * 1000,
    },
  });
}
