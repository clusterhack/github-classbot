import type Knex from "knex";

const config: Knex.Config = {
  client: "mysql",
  connection: {
    database: process.env.CLASSBOT_DB_DATABASE,
    user: process.env.CLASSBOT_DB_USER,
    password: process.env.CLASSBOT_DB_PASSWORD,
  },
  migrations: {
    directory: "./src/db/migrations",
    tableName: "knex_migrations",
  },
  seeds: {
    directory: "./src/db/seeds",
  },
};

export default config;
