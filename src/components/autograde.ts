import { Probot, Context } from "probot";
import { isComponentEnabled } from "../config";
import { ClassbotConfig, ClassbotComponentConfig } from "../types";

export interface AutogradeConfig extends ClassbotComponentConfig {
  skeleton: {
    repo: string;
    branch?: string;
  };
}

export default async function (
  app: Probot,
  context: Context<"check_suite">,
  config: ClassbotConfig,
  repoInfo?: { owner: string; repo: string }
): Promise<void> {
  const { owner, repo } = repoInfo || context.repo();

  if (!isComponentEnabled(config.autograde)) {
    return;
  }

  const log = app.log.child({ name: "autograde" });

  if (context.payload.check_suite.head_branch !== config.submission.branch) {
    log.info(`Skipping check run on branch: ${context.payload.check_suite.head_branch}`);
    return;
  }

  // Start autograder unit tests
  // TODO This is just a fake check run
  const run = await context.octokit.checks.create({
    owner,
    repo,
    name: "Autograding (fake)",
    head_sha: context.payload.check_suite.head_sha,
    status: "completed",
    conclusion: "success",
    output: {
      title: "Autograding (fake)",
      summary: "Points 70/100",
      text: "Points 70/100",
    },
  });
  log.info(`Submitted check run: ${run.data.html_url}`);
}
