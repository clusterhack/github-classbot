import { Model, Pojo } from "objection";

import { pojoParseJSONField } from "../../util";
import { User } from "./user";
import { Assignment } from "./classroom";

// Base model for all assignment submissions
// (currently we only have code submissions via push, but.. who knows?)
export class Submission extends Model {
  id!: number; // autoinc
  timestamp!: Date;

  userid!: number;
  assignment_id!: number;

  score?: number;
  max_score?: number;

  static get tableName() {
    return "submissions";
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: "submissions.userid",
          to: "users.id",
        },
      },
      assignment: {
        relation: Model.BelongsToOneRelation,
        modelClass: Assignment,
        join: {
          from: "submissions.assignment_id",
          to: "assignments.id",
        },
      },
      // -------------------------------------------------------
      // The remaining relations (below) may or may not be present
      code: {
        relation: Model.HasOneRelation,
        modelClass: CodeSubmission,
        join: {
          from: "submissions.id",
          to: "code_submissions.id",
        },
      },
    };
  }
}

export enum CodeSubmissionScoredBy {
  ACTION = "action", // In-repo GitHub classroom autograde action
  BOT = "bot", // Out-of-repo Classbot autograde component
}

export enum CodeSubmissionStatus {
  // Mirrors GitHub check_run.completion values, excluding:
  // action_required, cancelled, skipped, stale
  FAILURE = "failure",
  NEUTRAL = "neutral",
  SUCCESS = "success",
  TIMED_OUT = "timed_out",
  // TODO? Add SKIPPED = "skipped",
}

// Extra fields (1-1 rel to AssignmentSubmission) for code submissions (via push into repo)
// TODO? Do not export this model class?
//   Retrieval should be via Submission.code rel mapping, but if we don't export what about
//   insertions? can we use objection graph? RTFM when/if time...
export class CodeSubmission extends Model {
  id!: number; // 1-1 rel (i.e., PK and FK)

  repo!: string; // Plain repo name (*without* owner; should get owner via -> assignment -> org)
  head_sha!: string;

  scored_by?: CodeSubmissionScoredBy;
  check_run_id?: number;
  status?: CodeSubmissionStatus;
  execution_time?: number; // in seconds (wall-clock for test run)

  // Autograding test runner result output; won't be querying any of this, so just "dump" JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autograde?: any; // json

  // TODO? Is there a better way to do this (i.e., let Objection and/or Knex know
  //   that field should be parsed (since MySQL JSON is just alias for LONGTEXT..)?
  $parseDatabaseJson(json: Pojo) {
    return pojoParseJSONField(super.$parseDatabaseJson(json), "autograde");
  }

  static get tableName() {
    return "code_submissions";
  }

  static get relationMappings() {
    return {
      submission: {
        relation: Model.BelongsToOneRelation, // 1-1, actually
        modelClass: Submission,
        join: {
          from: "code_submissions.id",
          to: "submissions.id",
        },
      },
    };
  }
}
