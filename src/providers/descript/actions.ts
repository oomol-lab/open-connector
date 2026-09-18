import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "descript";

const idSchema = (description: string) => s.string(description, { format: "uuid" });
const rawSchema = s.looseObject("The complete response payload returned by Descript.");
const paginationSchema = s.looseObject("Pagination metadata returned by Descript.", {
  next_cursor: s.nullable(s.string("The cursor for the next page, or null at the end.")),
});
const jobSchema = s.looseObject("A Descript asynchronous job.", {
  job_id: idSchema("The job identifier."),
  job_type: s.string("The Descript job type."),
  job_state: s.string("The upstream job state."),
  result: s.looseObject("The type-specific job result."),
});
const submitOutputSchema = s.looseObject("A newly submitted Descript job.", {
  jobId: idSchema("The job identifier used to monitor completion."),
  projectId: idSchema("The project created or modified by the job."),
  projectUrl: s.url("The URL for opening the project in Descript."),
  raw: rawSchema,
});
export const descriptActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List projects accessible to the Drive associated with the Descript API token.",
    inputSchema: s.object(
      "Filters and pagination for listing Descript projects.",
      {
        name: s.string("A case-insensitive substring to match against project names."),
        folderPath: s.string("The exact folder path whose direct projects should be returned."),
        createdBy: s.string("A creator UUID or me for the authenticated user."),
        createdAfter: s.string("Only include projects created after this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        createdBefore: s.string("Only include projects created before this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        updatedAfter: s.string("Only include projects updated after this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        updatedBefore: s.string("Only include projects updated before this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        sort: s.stringEnum("The project field used for sorting.", [
          "name",
          "created_at",
          "updated_at",
          "last_viewed_at",
        ]),
        direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
        cursor: s.string("A pagination cursor from a previous response."),
        limit: s.integer("The maximum number of projects to return.", { minimum: 1, maximum: 100 }),
      },
      {
        optional: [
          "name",
          "folderPath",
          "createdBy",
          "createdAfter",
          "createdBefore",
          "updatedAfter",
          "updatedBefore",
          "sort",
          "direction",
          "cursor",
          "limit",
        ],
      },
    ),
    outputSchema: s.requiredObject("A page of Descript projects.", {
      projects: s.array("The projects in this page.", s.looseObject("A Descript project summary.")),
      pagination: paginationSchema,
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get a Descript project with its media, compositions, and published links.",
    inputSchema: s.requiredObject("The project to retrieve.", { projectId: idSchema("The project UUID.") }),
    outputSchema: s.requiredObject("A Descript project response.", {
      project: s.looseObject("The project and its contents."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List recent Descript jobs with optional project, type, time, and pagination filters.",
    inputSchema: s.object(
      "Filters and pagination for listing Descript jobs.",
      {
        projectId: idSchema("Only include jobs for this project UUID."),
        type: s.stringEnum("Only include this job type.", ["import/project_media", "agent"]),
        cursor: s.string("A pagination cursor from a previous response."),
        limit: s.integer("The maximum number of jobs to return.", { minimum: 1, maximum: 100 }),
        createdAfter: s.string("Only include jobs created after this ISO 8601 timestamp.", {
          format: "date-time",
        }),
        createdBefore: s.string("Only include jobs created before this ISO 8601 timestamp.", {
          format: "date-time",
        }),
      },
      { optional: ["projectId", "type", "cursor", "limit", "createdAfter", "createdBefore"] },
    ),
    outputSchema: s.requiredObject("A page of Descript jobs.", {
      jobs: s.array("The jobs in this page.", jobSchema),
      pagination: paginationSchema,
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get the current state and type-specific result of a Descript job.",
    inputSchema: s.requiredObject("The job to retrieve.", { jobId: idSchema("The job UUID.") }),
    outputSchema: s.requiredObject("The normalized state and raw Descript job.", {
      status: s.stringEnum("The normalized job status.", ["queued", "running", "succeeded", "failed", "cancelled"]),
      job: jobSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "cancel_job",
    operationType: "destructive",
    description: "Cancel a running Descript job.",
    inputSchema: s.requiredObject("The job to cancel.", { jobId: idSchema("The running job UUID.") }),
    outputSchema: s.requiredObject("Confirmation that Descript accepted the cancellation.", {
      cancelled: s.boolean("Whether the cancellation request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_agent_models",
    operationType: "read",
    description: "List the current Descript Underlord models and stable aliases.",
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The live Descript agent model catalog.", {
      availableModels: s.array("The currently available models.", s.looseObject("An available model and cost tier.")),
      aliases: s.array("Stable aliases and their current targets.", s.looseObject("A model alias.")),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "prompt_agent",
    operationType: "write",
    description: "Submit an asynchronous Underlord request to create or edit a Descript project.",
    followUpActions: ["descript.get_job"],
    inputSchema: s.object(
      "An Underlord instruction targeting an existing project or a new project name.",
      {
        projectId: idSchema("The existing project UUID to edit."),
        projectName: s.string("The name of a new project to create."),
        compositionId: s.string("A composition UUID, short ID, or Descript project URL to target."),
        model: s.string("A model ID or stable alias returned by list_agent_models."),
        prompt: s.nonEmptyString("The complete natural-language editing instruction."),
        teamAccess: s.stringEnum("The Drive member access for a newly created project.", [
          "edit",
          "comment",
          "view",
          "none",
        ]),
        callbackUrl: s.url("A webhook URL that Descript should call when the job stops."),
      },
      {
        optional: ["projectId", "projectName", "compositionId", "model", "teamAccess", "callbackUrl"],
      },
    ),
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "import_media",
    operationType: "write",
    description: "Import URL-hosted media into a new or existing Descript project asynchronously.",
    followUpActions: ["descript.get_job"],
    inputSchema: s.object(
      "A URL-based Descript media import request.",
      {
        projectId: idSchema("The existing project UUID to receive the media."),
        projectName: s.string("The name of a new project to create."),
        teamAccess: s.stringEnum("The Drive member access for a newly created project.", [
          "edit",
          "comment",
          "view",
          "none",
        ]),
        folderName: s.string("The nested folder path for a newly created project."),
        media: s.array(
          "The URL-hosted media files to import.",
          s.requiredObject("One media file exposed to Descript by URL.", {
            name: s.nonEmptyString("The display name or folder path used inside the project."),
            url: s.url("A public or pre-signed URL that supports HTTP Range requests."),
          }),
          { minItems: 1 },
        ),
        compositions: s.array(
          "Optional Descript composition definitions referencing media names.",
          s.looseObject("A Descript composition definition."),
        ),
        callbackUrl: s.url("A webhook URL that Descript should call when the job stops."),
      },
      {
        optional: ["projectId", "projectName", "teamAccess", "folderName", "compositions", "callbackUrl"],
      },
    ),
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "publish_project",
    operationType: "destructive",
    description: "Publish or republish a Descript composition and produce share and download URLs asynchronously.",
    followUpActions: ["descript.get_job"],
    inputSchema: s.object(
      "A Descript composition publish request.",
      {
        projectId: idSchema("The project UUID to publish."),
        compositionId: s.string("The composition UUID, short ID, or Descript project URL to publish."),
        mediaType: s.stringEnum("The output media type.", ["Video", "Audio"]),
        resolution: s.stringEnum("The video resolution.", ["480p", "720p", "1080p", "1440p", "4K"]),
        accessLevel: s.stringEnum("The desired share-page access level.", ["public", "unlisted", "drive", "private"]),
        callbackUrl: s.url("A webhook URL that Descript should call when the job stops."),
      },
      { optional: ["compositionId", "mediaType", "resolution", "accessLevel", "callbackUrl"] },
    ),
    outputSchema: submitOutputSchema,
  }),
];
