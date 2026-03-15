import type Knex from "knex";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: Knex.Config = {
  client: "mysql",
  connection: {
    database: process.env.CLASSBOT_DB_DATABASE,
    user: process.env.CLASSBOT_DB_USER,
    password: process.env.CLASSBOT_DB_PASSWORD,
  },
  migrations: {
    directory: __dirname + "/src/db/migrations",
    tableName: "knex_migrations",
  },
  seeds: {
    directory: __dirname + "/src/db/seeds",
  },
};

export default config;
