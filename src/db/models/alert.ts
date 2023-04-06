import { Model, Pojo } from "objection";

import { pojoParseJSONField } from "../../util";
import { User } from "./user";
import { Assignment } from "./classroom";

export class Alert extends Model {
  id!: number; // autoinc
  timestamp!: Date;

  cleared?: boolean;

  userid?: number;
  assignment_id?: number;

  repo?: string; // Plain name (*without* owner; that should be retrieved via assignment->org)
  issue?: number;
  sha?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any; // json

  // TODO? See comment for CodeSubmission model class...
  $parseDatabaseJson(json: Pojo) {
    return pojoParseJSONField(super.$parseDatabaseJson(json), "details");
  }

  static get tableName() {
    return "alerts";
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: "alerts.userid",
          to: "users.id",
        },
      },
      assignment: {
        relation: Model.BelongsToOneRelation,
        modelClass: Assignment,
        join: {
          from: "alerts.assignment_id",
          to: "assignments.id",
        },
      },
    };
  }
}
