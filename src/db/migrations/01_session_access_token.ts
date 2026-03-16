import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("sessions").del(); // Delete all current sessions
  await knex.schema.alterTable("sessions", table => {
    table.text("access_token").after("username");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("sessions", table => {
    table.dropColumn("access_token");
  });
}
