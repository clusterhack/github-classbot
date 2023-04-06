import { Model } from "objection";

export class ClassroomOrg extends Model {
  id!: number; // Github org id
  name!: string; // Github org name

  description?: string;

  static get tableName() {
    return "classroom_orgs";
  }

  static get relationMappings() {
    return {
      assignments: {
        relation: Model.HasManyRelation,
        modelClass: Assignment,
        join: {
          from: "classroom_orgs.id",
          to: "assignments.orgId",
        },
      },
    };
  }
}

export class Assignment extends Model {
  id!: number; // autoinc

  orgId!: number;
  name!: string;

  due?: Date;

  static get tableName() {
    return "assignments";
  }

  static get relationMappings() {
    return {
      org: {
        relation: Model.BelongsToOneRelation,
        modelClass: ClassroomOrg,
        join: {
          from: "assignments.orgId",
          to: "classroom_orgs.id",
        },
      },
    };
  }
}

// TODO RTFM if there's a better way to deal with eager graph fetching...
export interface AssignmentWithGraph extends Assignment {
  org?: ClassroomOrg;
}
