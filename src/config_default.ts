import { ClassbotConfig } from "./types";

const defaultConfig: ClassbotConfig = {
  classroom: {
    staff: [],
  },
  submission: {
    branch: "main",
    manifest: {
      main: ["!/.github", "!/test", "**/*"],
      status: ["/badges"],
    },
    authors_allow: ["github-classroom[bot]", "clusterhack-classbot[bot]"],
    commiters_allow: ["web-flow", "clusterhack-classbot[bot]"],
  },
  watchdog: {
    issue: {
      label: "classbot",
      title: "Potential problems in commit(s)",
      template: "{{{description}}}",
    },
  },
  gradelog: {
    job_name: "Autograding",
    artifact_name: "autograde",
  },
  badges: {
    branch: "status",
    path: "badges",
  },
  workflows: {
    source_path: ".github/classroom/autograde-action.yml",
    destination_path: ".github/workflows/classroom.yml",
    pusher_filter: "^github-classroom\\[bot\\]$",
    message_filter: "^(Setting up GitHub Classroom|add deadline$)",
  },
};

export default defaultConfig;
