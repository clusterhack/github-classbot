import session, { SessionData, Store } from "express-session";

import { UserSession, UserSessionData } from "./db/models/user";

// Extend SessionData interface with UserSession model
declare module "express-session" {
  interface SessionData {
    data: UserSessionData;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionStoreCallback = (err?: any, session?: SessionData | null) => void;
const noop: SessionStoreCallback = () => {};

class SessionStore extends Store {
  async get(sid: string, callback: SessionStoreCallback): Promise<void> {
    const cb = callback || noop;
    try {
      const rec = await UserSession.query().findById(sid);
      if (rec === undefined || rec.expires <= new Date()) {
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
      cb();
    } catch (err) {
      cb(err);
    }
  }
  async destroy(sid: string, callback?: SessionStoreCallback): Promise<void> {
    const cb = callback || noop;
    try {
      // TODO Verify expected behavior in this case (no error on non-existend sid)..
      await UserSession.query().deleteById(sid);
      cb();
    } catch (err) {
      cb(err);
    }
  }
}

export async function sessionGarbageCollect(): Promise<number> {
  // Return number of deleted rows
  return await UserSession.query().delete().where("expires", "<", new Date());
}

export function sessionMiddleware() {
  if (!process.env.COOKIE_SECRET) {
    throw new Error("Cookie secret not in environment!");
  }

  return session({
    secret: process.env.COOKIE_SECRET,
    store: new SessionStore(),
    saveUninitialized: false,
    resave: true, // TODO Set false after implementing store touch() method
    cookie: {
      path: "/classbot",
      httpOnly: true,
      sameSite: true,
      // secure: true,
      maxAge: parseInt(process.env.COOKIE_TTL_DAYS || "1") * 24 * 3600 * 1000,
    },
  });
}
