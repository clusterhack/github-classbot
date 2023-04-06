import { Knex } from "knex";

import { stringEnumValues } from "../../util";
import { UserRole } from "../models/user";
import { CodeSubmissionScoredBy, CodeSubmissionStatus } from "../models/submission";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable("classroom_orgs", table => {
      table.integer("id").primary(); // Github org id
      table.string("name", 64).notNullable().unique(); // Github org name
      table.string("description", 64);
    })
    .createTable("assignments", table => {
      table.increments("id").primary();
      table.integer("orgId").notNullable().references("classroom_orgs.id");
      table.string("name", 64).notNullable();
      table.unique(["orgId", "name"]);
      table.datetime("due");
    })
    .createTable("users", table => {
      table.integer("id").primary();
      table.string("username", 32).notNullable().unique();
      table.string("sisId", 32).unique();
      table.enu("role", stringEnumValues(UserRole)); // TODO! Get values from UserRole enum !!
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
    .createTable("submissions", table => {
      table.increments("id").primary();
      table.datetime("timestamp").notNullable();
      table.integer("userid").notNullable().references("users.id");
      table.integer("assignment_id").unsigned().notNullable().references("assignments.id");
      table.integer("score");
      table.integer("max_score");
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
    });
}

export async function down(knex: Knex): Promise<void> {
  // TODO? Check if this order works (or fails due to FK constraints)
  await knex.schema
    .dropTableIfExists("code_submissions")
    .dropTableIfExists("submissions")
    .dropTableIfExists("alerts")
    .dropTableIfExists("sessions")
    .dropTableIfExists("memberships")
    .dropTableIfExists("users")
    .dropTableIfExists("assignments")
    .dropTableIfExists("classroom_orgs");
}
