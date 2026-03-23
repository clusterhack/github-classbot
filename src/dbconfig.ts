// XXX dotenv needs to be separately activated!

import { Model } from "objection";
import Knex from "knex";

/***********************************************************************
 * Database config
 */

const knex = Knex({
  client: "mysql",
  useNullAsDefault: true,
  connection: {
    host: "127.0.0.1",
    port: 3306,
    user: process.env.CLASSBOT_DB_USER,
    password: process.env.CLASSBOT_DB_PASSWORD,
    database: process.env.CLASSBOT_DB_DATABASE,
  },
});

Model.knex(knex);
