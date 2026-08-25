import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "airbrake";

const requiredString = (description: string): JsonSchema => s.nonEmptyString(description);
const optionalString = (description: string): JsonSchema => s.nonEmptyString(description);
const idSchema = (name: string): JsonSchema => s.positiveInteger(`The Airbrake ${name} integer identifier.`);

const paginationInputSchema = {
  page: s.positiveInteger("The one-based Airbrake page number to fetch."),
  limit: s.positiveInteger("The maximum number of records to return."),
};

const paginationOutputSchema = {
  count: s.nullable(s.integer("The total number of records reported by Airbrake.")),
  page: s.nullable(s.integer("The page number reported by Airbrake.")),
};

const rawObjectSchema = (description: string): JsonSchema => s.looseObject(description);

const projectSchema = s.object("A normalized Airbrake project.", {
  id: s.nullable(s.integer("The Airbrake project identifier.")),
  name: s.nullable(s.string("The Airbrake project name.")),
  raw: rawObjectSchema("The raw Airbrake project object."),
});

const deploySchema = s.object("A normalized Airbrake deploy.", {
  id: s.nullable(s.integer("The Airbrake deploy identifier.")),
  environment: s.nullable(s.string("The deploy environment when returned by Airbrake.")),
  username: s.nullable(s.string("The deploy username when returned by Airbrake.")),
  revision: s.nullable(s.string("The deploy revision when returned by Airbrake.")),
  version: s.nullable(s.string("The deploy version when returned by Airbrake.")),
  raw: rawObjectSchema("The raw Airbrake deploy object."),
});

const groupSchema = s.object("A normalized Airbrake error group.", {
  id: s.nullable(s.integer("The Airbrake group identifier.")),
  errorClass: s.nullable(s.string("The error class returned by Airbrake.")),
  errorMessage: s.nullable(s.string("The error message returned by Airbrake.")),
  noticeCount: s.nullable(s.integer("The number of notices in the group.")),
  lastNoticeAt: s.nullable(s.string("The last notice timestamp returned by Airbrake.")),
  raw: rawObjectSchema("The raw Airbrake group object."),
});

const noticeSchema = s.object("A normalized Airbrake notice.", {
  id: s.nullable(s.string("The Airbrake notice identifier.")),
  message: s.nullable(s.string("The notice message returned by Airbrake.")),
  createdAt: s.nullable(s.string("The notice creation timestamp returned by Airbrake.")),
  raw: rawObjectSchema("The raw Airbrake notice object."),
});

const statusOutputSchema = s.actionOutput(
  {
    status: s.nullable(s.string("The Airbrake notice processing status.")),
    groupId: s.nullable(s.integer("The Airbrake group identifier when the notice was grouped.")),
    message: s.nullable(s.string("The Airbrake notice status message when present.")),
    raw: rawObjectSchema("The raw Airbrake notice status object."),
  },
  "The Airbrake notice status response.",
);

const projectIdInputSchema = s.actionInput(
  {
    projectId: idSchema("project"),
  },
  ["projectId"],
  "Input parameters for an Airbrake project.",
);

const projectDeployIdInputSchema = s.actionInput(
  {
    projectId: idSchema("project"),
    deployId: idSchema("deploy"),
  },
  ["projectId", "deployId"],
  "Input parameters for an Airbrake deploy.",
);

const groupIdInputSchema = s.actionInput(
  {
    projectId: idSchema("project"),
    groupId: idSchema("group"),
  },
  ["projectId", "groupId"],
  "Input parameters for an Airbrake group.",
);

const noticeStatusInputSchema = s.actionInput(
  {
    projectId: idSchema("project"),
    noticeUuid: requiredString("The Airbrake notice UUID returned by notice creation."),
  },
  ["projectId", "noticeUuid"],
  "Input parameters for an Airbrake notice status.",
);

export const airbrakeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Airbrake projects visible to the User API key.",
    inputSchema: s.actionInput(
      {
        ...paginationInputSchema,
      },
      [],
      "Input parameters for listing Airbrake projects.",
    ),
    outputSchema: s.actionOutput(
      {
        projects: s.array("The projects returned by Airbrake.", projectSchema),
        ...paginationOutputSchema,
        raw: rawObjectSchema("The raw Airbrake projects response."),
      },
      "The Airbrake projects list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get details for one Airbrake project.",
    inputSchema: projectIdInputSchema,
    outputSchema: s.actionOutput(
      {
        project: projectSchema,
        raw: rawObjectSchema("The raw Airbrake project response."),
      },
      "The Airbrake project response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_deploys",
    description: "List deploys for one Airbrake project.",
    inputSchema: s.actionInput(
      {
        projectId: idSchema("project"),
        ...paginationInputSchema,
      },
      ["projectId"],
      "Input parameters for listing Airbrake deploys.",
    ),
    outputSchema: s.actionOutput(
      {
        deploys: s.array("The deploys returned by Airbrake.", deploySchema),
        ...paginationOutputSchema,
        raw: rawObjectSchema("The raw Airbrake deploys response."),
      },
      "The Airbrake deploys list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_deploy",
    description: "Get details for one Airbrake deploy.",
    inputSchema: projectDeployIdInputSchema,
    outputSchema: s.actionOutput(
      {
        deploy: deploySchema,
        raw: rawObjectSchema("The raw Airbrake deploy response."),
      },
      "The Airbrake deploy response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List error groups for one Airbrake project with optional filters.",
    inputSchema: s.actionInput(
      {
        projectId: idSchema("project"),
        page: paginationInputSchema.page,
        limit: paginationInputSchema.limit,
        deployId: idSchema("deploy"),
        archived: s.boolean("Whether to return archived Airbrake groups."),
        muted: s.boolean("Whether to return muted Airbrake groups."),
        startTime: optionalString("Return groups created after this Airbrake start_time value."),
        endTime: optionalString("Return groups created before this Airbrake end_time value."),
        order: s.stringEnum("The Airbrake group sort order.", ["last_notice", "notice_count", "weight", "created"]),
      },
      ["projectId"],
      "Input parameters for listing Airbrake groups.",
    ),
    outputSchema: s.actionOutput(
      {
        groups: s.array("The groups returned by Airbrake.", groupSchema),
        ...paginationOutputSchema,
        raw: rawObjectSchema("The raw Airbrake groups response."),
      },
      "The Airbrake groups list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get details for one Airbrake error group.",
    inputSchema: groupIdInputSchema,
    outputSchema: s.actionOutput(
      {
        group: groupSchema,
        raw: rawObjectSchema("The raw Airbrake group response."),
      },
      "The Airbrake group response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_notices",
    description: "List notices for one Airbrake error group.",
    inputSchema: s.actionInput(
      {
        projectId: idSchema("project"),
        groupId: idSchema("group"),
        page: paginationInputSchema.page,
        limit: paginationInputSchema.limit,
        version: optionalString("Filter notices by Airbrake app version."),
      },
      ["projectId", "groupId"],
      "Input parameters for listing Airbrake notices.",
    ),
    outputSchema: s.actionOutput(
      {
        notices: s.array("The notices returned by Airbrake.", noticeSchema),
        ...paginationOutputSchema,
        raw: rawObjectSchema("The raw Airbrake notices response."),
      },
      "The Airbrake notices list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_notice_status",
    description: "Get Airbrake processing status for a notice UUID.",
    inputSchema: noticeStatusInputSchema,
    outputSchema: statusOutputSchema,
  }),
];
