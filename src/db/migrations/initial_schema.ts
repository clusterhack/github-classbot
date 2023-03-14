import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .createTable("users", table => {
      table.integer("id").primary();
      table.string("username", 32).notNullable().unique();
      table.string("sisId", 32).unique();
      table.enu("role", ["admin", "member"]); // TODO! Get values from UserRole enum !!
      table.string("name", 128);
    })
    .createTable("sessions", table => {
      table.string("id", 255).primary();
      table.json("cookie");
      table.integer("userid").references("users.id");
      table.string("username", 32).references("users.username");
      table.datetime("expires").notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users").dropTableIfExists("sessions");
}
