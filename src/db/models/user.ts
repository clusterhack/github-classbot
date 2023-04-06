import { Model } from "objection";
import { ClassroomOrg } from "./classroom";

export enum UserRole {
  ADMIN = "admin",
  MEMBER = "member",
}

export class User extends Model {
  id!: number;
  username!: string;
  sisId?: string;
  role?: UserRole = UserRole.MEMBER;
  name?: string;

  static get tableName() {
    return "users";
  }

  static get relationMappings() {
    return {
      orgs: {
        relation: Model.ManyToManyRelation,
        modelClass: ClassroomOrg,
        join: {
          from: "users.id",
          through: {
            // persons_movies is the join table.
            from: "memberships.userid",
            to: "memberships.orgId",
          },
          to: "classroom_orgs.id",
        },
      },
    };
  }
}

export interface UserSessionData {
  // Basic GitHub user info (so we don't have to query DB as often)
  userid?: number;
  username?: string;
}

// Based on https://stackoverflow.com/a/65787814
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserSession extends UserSessionData {}

export class UserSession extends Model implements UserSession {
  id!: string; // cookie id
  expires!: Date; // cookie expiration (calculated at insertion/update)
  // Cookie (just need to reconstruct as-was for middleware)
  cookie!: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  static get tableName() {
    return "sessions";
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: "sessions.userid",
          to: "users.id",
        },
      },
    };
  }
}
