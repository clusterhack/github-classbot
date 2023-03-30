import express from "express";
import { Pojo } from "objection";

/*************************************************************************
 * General-purpose
 */

// export type NumericEnum<K extends string, V extends number> = Record<K, V> & Record<V, K>;
export type StringEnum<K extends string, V extends string> = Readonly<Record<K, V>>;

// Returns either value itself (if it belongs to enum), or undefined (otherwise)
export function asStringEnum<K extends string, V extends string>(
  value: string | undefined,
  strEnum: StringEnum<K, V>
): V | undefined {
  return Object.values(strEnum).includes(value) ? (value as V) : undefined;
}

export function stringEnumValues<K extends string, V extends string>(
  strEnum: StringEnum<K, V>
): readonly V[] {
  return Object.values(strEnum);
}

// Attempts to guess truthiness of an environment variable value
export function isEnvTruthy(value?: string): boolean {
  return value?.toLowerCase() === "true" || Boolean(parseInt(value as string));
}

// Same as express.RequestHandler but returning Promise<void> rather than void
export type AsyncRequestHandler = {
  (...args: Parameters<express.RequestHandler>): Promise<void>;
};
export function asyncHandleExceptions(fn: AsyncRequestHandler): AsyncRequestHandler {
  return async (req, res, next) =>
    Promise.resolve()
      .then(async () => fn(req, res, next))
      .catch(next);
}

// Aux function to make $parseDatabaseJson implementations more concise.
// If json[key] is a string, then replace it with result of parsing it as JSON.
// Parse errors are silently ignored (leaving the value unchanged, i.e., original string).
export function pojoParseJSONField(pojo: Pojo, key: string): Pojo {
  if (typeof pojo[key] === "string") {
    try {
      pojo[key] = JSON.parse(pojo[key]);
    } catch (_err) {
      // Silently ignore parse errors...
    }
  }
  return pojo;
}

/*************************************************************************
 * Classbot-specific
 */

interface AssignmentRepoParts {
  assignment?: string; // Assignment name (used as repo name prefix by Classroom)
  username?: string; // Github username (used as repo name suffix by Classroom)
}

// Extract assignment and username from Github Classroom name.
export function parseAssignmentRepo(repo: string, username?: string) {
  if (username === undefined) {
    // XXX Assumes that the assignment name does *not* contain any dashes.
    //   This is probably the best we can do if username is not given/known.
    return repo.match(/^(?<assignment>[^-]*)-(?<username>.*)$/)?.groups as AssignmentRepoParts;
  } else {
    // We can eliminate assumption about assignment name here. Also, we do *not* assume
    // that repo name ends with `-${username}`, so we return username through regex match...
    return repo.match(new RegExp(`^(?<assignment>.*)-(?<username>${username}$)`))
      ?.groups as AssignmentRepoParts;
  }
}
