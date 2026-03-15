import { Knex } from "knex";

import { stringEnumValues } from "../../util.js";
import { UserRole } from "../models/user.js";
import { CodeSubmissionScoredBy, CodeSubmissionStatus } from "../models/submission.js";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable("classroom_orgs", table => {
      table.integer("id").primary(); // Github org id
      table.string("name", 64).notNullable().unique(); // Github org name
      table.string("description", 64);
      table.integer("installation_id");
    })
    .createTable("assignments", table => {
      table.increments("id").primary();
      table.integer("orgId").notNullable().references("classroom_orgs.id");
      table.string("name", 64).notNullable();
      table.unique(["orgId", "name"]);
      table.string("starter_repo", 64).notNullable();
      table.string("repo_slug", 64).notNullable();
      table.datetime("due");
    })
    .createTable("users", table => {
      table.integer("id").primary();
      table.string("username", 32).notNullable().unique();
      table.string("sisId", 32).unique();
      table.enu("role", stringEnumValues(UserRole));
      table.string("name", 128);
    })
    .createTable("memberships", table => {
      table.integer("userid").notNullable().references("users.id");
      table.integer("orgId").notNullable().references("classroom_orgs.id");

      table.primary(["userid", "orgId"]);
    })
    .createTable("sessions", table => {
      table.string("id", 255).primary();
      table.json("cookie");
      table.integer("userid").references("users.id");
      table.string("username", 32).references("users.username");
      table.datetime("expires").notNullable();
    })
    .createTable("accepted_assignments", table => {
      table.integer("userid").notNullable().references("users.id");
      table.integer("assignment_id").unsigned().notNullable().references("assignments.id");
      table.string("repo", 64).notNullable();
      table.datetime("date"); // TODO? Add default now
      table.primary(["userid", "assignment_id"]);
    })
    .createTable("submissions", table => {
      table.increments("id").primary();
      table.datetime("timestamp").notNullable();
      table.integer("userid").notNullable().references("users.id");
      table.integer("assignment_id").unsigned().notNullable().references("assignments.id");
      table.integer("score");
      table.integer("max_score");
      // TODO XXX When assignment acceptance is migrated from Classroom to us,
      //   add FK constraint below; see also db/models/submission:Submission
      // table
      //   .foreign(["userid", "assignment_id"])
      //   .references(["userid", "assignment_id"])
      //   .inTable("accepted_assignments");

      table.index("timestamp");
      // table.check("?? >= 0", ["score"], "score_non_negative");
      // table.check("?? >= 0", ["max_score"], "max_score_non_negative");
    })
    .createTable("code_submissions", table => {
      table.integer("id").unsigned().primary().references("submissions.id");
      table.string("repo", 64).notNullable();
      table.string("head_sha", 40).notNullable().unique();
      table.enu("scored_by", stringEnumValues(CodeSubmissionScoredBy));
      table.bigInteger("check_run_id");
      table.enu("status", stringEnumValues(CodeSubmissionStatus));
      table.float("execution_time");
      table.json("autograde");
    })
    .createTable("alerts", table => {
      table.increments("id").primary();
      table.datetime("timestamp").notNullable();
      table.boolean("cleared").notNullable().defaultTo(false);
      table.integer("userid").references("users.id");
      table.integer("assignment_id").unsigned().references("assignments.id");
      table.string("repo", 64).notNullable();
      table.integer("issue");
      table.string("sha", 40).notNullable().unique();
      table.json("details");

      table.index("timestamp");
    });
}

export async function down(knex: Knex): Promise<void> {
  // TODO? Check if this order works (or fails due to FK constraints)
  await knex.schema
    .dropTableIfExists("alerts")
    .dropTableIfExists("code_submissions")
    .dropTableIfExists("submissions")
    .dropTableIfExists("accepted_assignments")
    .dropTableIfExists("sessions")
    .dropTableIfExists("memberships")
    .dropTableIfExists("users")
    .dropTableIfExists("assignments")
    .dropTableIfExists("classroom_orgs");
}
