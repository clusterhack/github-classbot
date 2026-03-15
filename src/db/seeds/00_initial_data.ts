import { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  const classroom_org =
    process.env.NODE_ENV !== "development"
      ? {
          id: 123033888,
          name: "pybait",
          description: "Foundations of Programming",
          installation_id: 33975252,
        }
      : {
          id: 267786813,
          name: "pybait-test",
          description: "Classbot Test",
          installation_id: 116437236,
        };
  await knex("classroom_orgs").insert(classroom_org);

  const admin_user = {
    id: 4348443,
    username: "spapadim",
    sisId: "sp1059",
    role: "admin",
    name: "Spiros Papadimitriou",
  };
  await knex("users").insert(admin_user);

  await knex("memberships").insert({
    userid: admin_user.id,
    orgId: classroom_org.id,
  });

  if (process.env.NODE_ENV === "development") {
    await knex("assignments").insert({
      orgId: classroom_org.id,
      name: "Homework 1",
      starter_repo: "hw1_template",
      repo_slug: "hw1",
      // due: null,
    });
  }
}
