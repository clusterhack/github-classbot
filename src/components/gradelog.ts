import fetch from "node-fetch";
import JSZip from "jszip";
import { Probot, Context } from "probot";
// import { ref } from "objection";

import { Assignment, AssignmentWithGraph } from "../db/models/classroom";
import {
  Submission,
  CodeSubmission,
  CodeSubmissionScoredBy,
  CodeSubmissionStatus,
} from "../db/models/submission";

import { isComponentEnabled } from "../config";
import { ClassbotConfig, ClassbotComponentConfig } from "../types";
import { asStringEnum, parseAssignmentRepo } from "../util";

export interface GradeLogConfig extends ClassbotComponentConfig {
  job_name: string;
  artifact_name: string;
}

// For some reason, JSON responses/payloads for Actions include check_run_url only
// XXX This makes assumptions about check_run_url that *may* not be guaranteed by the GitHub API
// TODO?? Re-attempt to check docs (when/if time); however, public endpoint is unlikely to change..
function parseCheckRunId(check_run_url: string): number | undefined {
  const id_str = check_run_url.match(/check-runs\/(?<id_str>\d+)$/)?.groups?.id_str;
  const id = parseInt(id_str || "");
  return isNaN(id) ? undefined : id;
}

export default async function (
  app: Probot,
  context: Context<"workflow_job">,
  config: ClassbotConfig,
  repoInfo?: { owner: string; repo: string }
): Promise<void> {
  if (!isComponentEnabled(config.gradelog)) {
    return;
  }

  const { owner, repo } = repoInfo || context.repo();
  const log = app.log.child({ name: "gradelog", repo: `${owner}/${repo}` });

  if (context.payload.workflow_job.name !== config.gradelog.job_name) {
    log.info(
      `Workflow job name ${context.payload.workflow_job.name} does not match ${config.gradelog.job_name}; skipping`
    );
    return;
  }

  // Figure out author of job's head_sha
  const commitResp = await context.octokit.repos.getCommit({
    owner,
    repo,
    ref: context.payload.workflow_job.head_sha,
  });
  if (!commitResp.data.author) {
    log.error("Cannot determine author of job's head_sha; giving up!");
    return;
  }

  // Fetch assignment from database
  log.info(`parseAssignmentRepo(${repo}, ${commitResp.data.author.login}) -> ${JSON.stringify(parseAssignmentRepo(repo, commitResp.data.author.login), undefined, 2)}`)
  const assignmentName = parseAssignmentRepo(repo, commitResp.data.author.login)?.assignment;
  const assignmentOrgId = context.payload.repository.owner.id;
  if (!assignmentName) {
    log.error(`Cannot parse repo ${repo} (for author ${commitResp.data.author.login}; giving up!`);
    return;
  }
  const assignmentRows = await Assignment.query()
    // .where({
    //   orgId: assignmentOrgId,
    //   name: assignmentName,
    // })
    .where("orgId", assignmentOrgId)
    .where("assignments.name", assignmentName)
    .withGraphJoined({ org: true });
  if (assignmentRows.length === 0) {
    log.error(
      `No { orgId: ${assignmentOrgId}, name: ${assignmentName} } assignment in database; giving up!`
    );
    return;
  }
  const assignment = assignmentRows[0] as AssignmentWithGraph; // TODO? Also check .length === 1 (paranoia: DBMS should not allow)

  if (assignment.org?.name !== owner) {
    log.warn(`Repo owner ${owner} does not match assignment org name ${assignment.org?.name}!`);
  }

  // Get autograde result JSON (from job artifacts)
  // First, find artifact id
  const artifactName = config.gradelog.artifact_name;
  const artifactResp = await context.octokit.actions.listArtifactsForRepo({
    repo,
    owner,
    name: artifactName,
  });
  if (artifactResp.data.total_count === 0) {
    log?.error("No artifacts found!");
    return;
  }
  let artifact = artifactResp.data.artifacts[0];
  if (artifactResp.data.total_count > 1) {
    log?.warn(
      `Found ${artifactResp.data.total_count} matching artifacts?! Will try to match head_sha`
    );
    artifact = artifactResp.data.artifacts.filter(
      a => a.workflow_run?.head_sha === context.payload.workflow_job.head_sha
    )[0];
    if (artifact === undefined) {
      log?.warn("Could not match head_sha, will use latest artifact");
      artifact = artifactResp.data.artifacts.sort(
        (a1, a2) => Date.parse(a2.created_at!) - Date.parse(a1.created_at!) // XXX Not really typesafe...
      )[0];
    }
  }
  log?.info(`Found artifact ${artifact.name} with id ${artifact.id}`);

  // Next, download the actual artifact
  const dlResp = await context.octokit.actions.downloadArtifact({
    owner,
    repo,
    artifact_id: artifact.id,
    archive_format: "zip",
  });
  log.info(`Download artifact response:\n${JSON.stringify(dlResp, undefined, 2)}`);
  const fetchResp = await fetch(dlResp.url);
  if (!fetchResp.status) {
    log.error(`Fetch of artifact id ${artifact.id} failed with HTTP ${fetchResp.status}`);
    return;
  }
  const zip = JSZip();
  await zip.loadAsync(await fetchResp.buffer()); // TODO!! Byte size limit!
  const filenames = Object.keys(zip.files).filter(fn => fn.endsWith(".json"));
  if (filenames.length === 0) {
    log.error("No JSON files in artifact; giving up!");
    return;
  }
  if (filenames.length > 1) {
    log.warn(`Zipfile with more than one JSON files; will try ${filenames[0]}`);
  }
  const json = await zip.file(filenames[0])!.async("string");
  const autograde = JSON.parse(json);
  log.info(`Retrieved autograde.json (re-serialized):\n${JSON.stringify(autograde, undefined, 2)}`);

  const completed_at = context.payload.workflow_job.completed_at;
  const timestamp = completed_at !== null ? new Date(completed_at) : new Date();

  const jobStatus = asStringEnum(
    context.payload.workflow_job.conclusion || undefined,
    CodeSubmissionStatus
  );

  // Insert database records
  // TODO? Is insertGraph more appropriate here (vs a transaction)?
  await Submission.transaction(async trx => {
    const sub = await Submission.query(trx).insertAndFetch({
      timestamp: timestamp,
      userid: commitResp.data.author!.id, // XXX Why the heck doesn't ts infer not-null on .author?
      assignment_id: assignment.id,
      score: autograde?.score,
      max_score: autograde?.max_score,
    });
    await CodeSubmission.query(trx).insert({
      id: sub.id,
      repo: repo,
      head_sha: context.payload.workflow_job.head_sha,
      scored_by: CodeSubmissionScoredBy.ACTION,
      check_run_id: parseCheckRunId(context.payload.workflow_job.check_run_url),
      status: jobStatus,
      execution_time: autograde?.execution_time,
      autograde: autograde,
    });
  });
  log.info("Successfully inserted grade record!");
}
