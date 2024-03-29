import path from "node:path";
import deepmerge from "deepmerge";
import { Context } from "probot";
import { ClassbotConfig, ClassbotComponentConfig, ClassbotConfigError } from "./types";

import defaultConfig from "./config_default";
import { parseAssignmentRepo } from "./util";

console.log(defaultConfig);

function configOverrideApply(
  config: ClassbotConfig,
  overrides: Partial<ClassbotConfig>
): ClassbotConfig {
  // TODO! Properly merge file manifests (array + multiline string case, and also dedup)
  //   and authors_allow/commiters_allow arrays (dedup)
  const result = deepmerge<ClassbotConfig>(config, overrides);
  // TODO Can we iterate over "keys of type ClassbotComponentConfig" with a TS expression??
  if (config.watchdog === undefined) delete result.watchdog;
  if (config.autograde === undefined) delete result.autograde;
  if (config.gradelog === undefined) delete result.gradelog;
  if (config.badges === undefined) delete result.badges;
  if (config.workflows === undefined) delete result.workflows;
  return result;
}

// Get app configuration and ensure it's valid
// TODO Prohibit reading from user repos
export async function getConfig(context: Context): Promise<ClassbotConfig> {
  // Start with built-in default config
  let config = defaultConfig;
  // Get global config
  const globalConfig = await context.config<Partial<ClassbotConfig>>("classbot.yml");
  if (globalConfig !== null) {
    config = configOverrideApply(config, globalConfig);
  }

  // Try to read assignment-specific config
  const { repo } = context.repo();
  const { assignment } = parseAssignmentRepo(repo);
  const assignmentConfig = assignment
    ? await context.config<Partial<ClassbotConfig>>(`classbot-${assignment}.yml`)
    : null;
  if (assignmentConfig !== null) {
    config = configOverrideApply(config, assignmentConfig);
  }

  // Validate config
  if (config.watchdog !== undefined) {
    if (config.watchdog.issue === undefined) {
      throw new ClassbotConfigError("Watchdog config must include issue");
    }
    if (!config.watchdog.issue.template) {
      throw new ClassbotConfigError("Missing (or blank) watchdog issue template");
    }
  }
  if (config.badges !== undefined) {
    if (config.badges.path.includes(path.sep)) {
      throw new ClassbotConfigError("Badge path cannot be nested");
    }
  }
  //console.log(`Actual config:\n${JSON.stringify(config, null, 2)}`);
  return config;
}

export function isComponentEnabled(
  component?: ClassbotComponentConfig
): component is ClassbotComponentConfig {
  return component !== undefined && component.disabled !== true;
}
