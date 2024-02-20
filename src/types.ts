import { AutogradeConfig } from "./components/autograde";
import { BadgesConfig } from "./components/badges";
import { GradeLogConfig } from "./components/gradelog";
import { WatchdogConfig } from "./components/watchdog";
import { WorkflowsConfig } from "./components/workflows";

export class ClassbotError extends Error {}

export class HTTPError extends Error {
  status: number;

  constructor(message?: string, status?: number) {
    super(message);
    this.status = status || 400; // HTTP 400 Bad request
  }
}

// TODO Just move these to config.ts and delete types.ts (or: perhaps keep manifest stuff separate)

export class ClassbotConfigError extends ClassbotError {}

export type FilePatterns = string | readonly string[];
export type FileManifest = FilePatterns | Readonly<{ [branch: string]: FilePatterns }>; // branch "*" is used as a fall-back default, if present

export interface ClassbotComponentConfig {
  // All components should allow disabling via simple flag (e.g., to disable without deleting section)
  disabled?: boolean;
}

export interface ClassbotConfig {
  // General settings
  classroom: {
    // Usernames of classroom staff (instructor, TA(s), etc)
    staff: string[];
  };
  submission: {
    // Branch on which submissions are expected
    branch: string;
    // Glob patterns for allowlist of files that can be touched by submission commits
    manifest: FileManifest;
    // Allowlists of additional usernames that can be authors or commiters of submission commits
    // The repo owner and external collaborator(s) are always allowed
    // (typically, that's classroom org and student, respectively)
    // Staff must be allowed explicitly  // TODO? Always add them as well?
    authors_allow?: string[];
    commiters_allow?: string[];
  };

  // Bot components (see comments in config component type defs for info)
  // A component can be disabled either by ommiting it's config section,
  // or by setting it's disabled flag to true
  watchdog?: WatchdogConfig;
  autograde?: AutogradeConfig;
  badges?: BadgesConfig;
  gradelog?: GradeLogConfig;
  workflows?: WorkflowsConfig;
}

export function normalizeFileManifest(manifest: FileManifest, branch?: string): readonly string[] {
  if (branch === undefined) {
    branch = "*"; // Use default manifest, if branch is not specified
  }

  // If manifest is specialized per-branch, then pick the appropriate one
  let patterns: FilePatterns | undefined;
  if (typeof manifest === "object" && !(manifest instanceof Array)) {
    // Try branch-specific manifest
    patterns = manifest[branch];
    // If not found, try default manifest
    if (patterns === undefined) {
      patterns = manifest["*"]; // Could still be undefined
    }
  } else {
    // Not branch-specialized
    patterns = manifest;
  }

  // Convert multiline patterns to array
  if (typeof patterns === "string") {
    patterns = patterns.split("\n");
    // Filter out blank lines and comments lines
    patterns = patterns.flatMap(p => {
      p = p.replace(/#.*$/, "").trim(); // First remove comments
      return p !== "" ? [p] : []; // Then drop empty lines
    });
  }

  // Return empty array, not undefined
  return patterns || [];
}
