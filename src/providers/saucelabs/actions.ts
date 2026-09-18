import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "saucelabs";

const jobSchema = s.looseObject("A Sauce Labs virtual-device job.", {
  id: s.string("The Sauce Labs job identifier."),
  name: s.nullable(s.string("The job name.")),
  status: s.nullable(s.string("The current job status.")),
  passed: s.nullable(s.boolean("Whether the job passed.")),
  build: s.nullable(s.string("The build name associated with the job.")),
  browser: s.nullable(s.string("The browser used by the job.")),
  os: s.nullable(s.string("The operating system used by the job.")),
  start_time: s.nullable(s.integer("The Unix timestamp when the job started.")),
  end_time: s.nullable(s.integer("The Unix timestamp when the job ended.")),
});

const buildJobSchema = s.looseObject("A job summary returned within a Sauce Labs build.", {
  id: s.string("The Sauce Labs job identifier."),
  state: s.looseObject("Boolean job states reported by the Sauce Labs Builds API."),
});

const buildSchema = s.looseObject("A Sauce Labs build summary.", {
  id: s.string("The Sauce Labs build identifier."),
  name: s.nullable(s.string("The build name.")),
  status: s.nullable(s.string("The aggregate build status.")),
  jobs: s.looseObject("Job counts grouped by Sauce Labs build state."),
  start_time: s.nullable(s.integer("The Unix timestamp of the earliest job in the build.")),
  end_time: s.nullable(s.integer("The Unix timestamp of the latest job in the build.")),
});

const buildSourceSchema = s.stringEnum("The Sauce Labs device source for the build.", ["vdc", "rdc"]);

export const saucelabsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List recent Sauce Labs virtual-device jobs for the connected username.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for recent Sauce Labs jobs.",
      {
        limit: s.integer("The maximum number of jobs to return.", { minimum: 1 }),
        skip: s.integer("The number of matching jobs to skip.", { minimum: 0 }),
        from: s.integer("Return jobs started on or after this Unix timestamp."),
        to: s.integer("Return jobs started on or before this Unix timestamp."),
      },
      { optional: ["limit", "skip", "from", "to"] },
    ),
    outputSchema: s.object("The normalized Sauce Labs job list.", {
      jobs: s.array("The matching Sauce Labs jobs.", jobSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get details for one Sauce Labs virtual-device job.",
    requiredScopes: [],
    inputSchema: s.object("The Sauce Labs job to retrieve.", {
      job_id: s.nonEmptyString("The Sauce Labs job identifier."),
    }),
    outputSchema: s.object("The requested Sauce Labs job.", { job: jobSchema }),
  }),
  defineProviderAction(service, {
    name: "update_job",
    operationType: "write",
    description: "Update the name, tags, visibility, or pass status of a Sauce Labs virtual-device job.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Sauce Labs job metadata to update.",
      {
        job_id: s.nonEmptyString("The Sauce Labs job identifier."),
        name: s.nonEmptyString("The replacement job name."),
        tags: s.array("The complete replacement set of job tags.", s.string("One job tag.")),
        public: s.stringEnum("The replacement job visibility.", [
          "public",
          "public restricted",
          "share",
          "team",
          "private",
        ]),
        passed: s.boolean("Whether the job should be marked as passed."),
      },
      { optional: ["name", "tags", "public", "passed"] },
    ),
    outputSchema: s.object("The updated Sauce Labs job.", { job: jobSchema }),
  }),
  defineProviderAction(service, {
    name: "list_job_assets",
    operationType: "read",
    description: "List the asset file names available for a Sauce Labs virtual-device job.",
    requiredScopes: [],
    inputSchema: s.object("The Sauce Labs job whose assets should be listed.", {
      job_id: s.nonEmptyString("The Sauce Labs job identifier."),
    }),
    outputSchema: s.object("The Sauce Labs job asset manifest.", {
      assets: s.record(
        "Asset aliases and file names returned by Sauce Labs.",
        s.unknown("An asset file name or nested screenshot list."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_builds",
    operationType: "read",
    description: "List Sauce Labs builds for virtual or real devices with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for Sauce Labs builds.",
      {
        build_source: buildSourceSchema,
        status: s.array(
          "The build statuses to include.",
          s.stringEnum("One Sauce Labs build status.", ["running", "error", "failed", "complete", "success"]),
        ),
        start: s.integer("Return builds whose earliest job ran on or after this Unix timestamp."),
        end: s.integer("Return builds whose latest job ran on or before this Unix timestamp."),
        limit: s.integer("The maximum number of builds to return.", { minimum: 1 }),
        offset: s.integer("The number of matching builds to skip.", { minimum: 0 }),
        name: s.nonEmptyString("Return builds with this name."),
        sort: s.stringEnum("The build name sort direction.", ["asc", "desc"]),
      },
      { optional: ["status", "start", "end", "limit", "offset", "name", "sort"] },
    ),
    outputSchema: s.object(
      "The normalized Sauce Labs build list.",
      {
        builds: s.array("The matching Sauce Labs builds.", buildSchema),
        meta: s.looseObject("Pagination metadata returned by Sauce Labs.", {}),
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_build",
    operationType: "read",
    description: "Get details for one Sauce Labs build.",
    requiredScopes: [],
    inputSchema: s.object("The Sauce Labs build to retrieve.", {
      build_source: buildSourceSchema,
      build_id: s.nonEmptyString("The Sauce Labs build identifier."),
    }),
    outputSchema: s.object("The requested Sauce Labs build.", { build: buildSchema }),
  }),
  defineProviderAction(service, {
    name: "list_build_jobs",
    operationType: "read",
    description: "List jobs associated with one Sauce Labs build.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Sauce Labs build and job state filters to query.",
      {
        build_source: buildSourceSchema,
        build_id: s.nonEmptyString("The Sauce Labs build identifier."),
        modified_since: s.integer("Return jobs modified after this Unix timestamp."),
        completed: s.boolean("Filter by whether jobs ran uninterrupted to completion."),
        errored: s.boolean("Filter by whether jobs are in the errored state."),
        failed: s.boolean("Filter by whether jobs are in the failed state."),
        finished: s.boolean("Filter by whether jobs are no longer running."),
        new: s.boolean("Filter by whether jobs are in the new state."),
        passed: s.boolean("Filter by whether jobs are in the passed state."),
        public: s.boolean("Filter by whether jobs ran on public devices."),
        queued: s.boolean("Filter by whether jobs are in the queued state."),
        running: s.boolean("Filter by whether jobs are in the running state."),
        faulty: s.boolean("Filter by whether jobs are errored or failed."),
      },
      {
        optional: [
          "modified_since",
          "completed",
          "errored",
          "failed",
          "finished",
          "new",
          "passed",
          "public",
          "queued",
          "running",
          "faulty",
        ],
      },
    ),
    outputSchema: s.object("The normalized jobs in a Sauce Labs build.", {
      jobs: s.array("The jobs associated with the build.", buildJobSchema),
    }),
  }),
];
