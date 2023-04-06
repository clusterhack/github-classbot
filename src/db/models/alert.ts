import { Model } from "objection";

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

  static get tableName() {
    return "alerts";
  }

  // TODO? Remove when we get around to adding jsonSchema prop?
  static get jsonAttributes() {
    return ["details"];
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
