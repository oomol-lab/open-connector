import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agora";

const idSchema = s.string("An Agora Console project ID.", { minLength: 1 });
const projectNameSchema = s.string("The Agora Console project name.", {
  minLength: 1,
  maxLength: 255,
});

const projectSchema = s.object("A normalized Agora Console project.", {
  id: idSchema,
  name: s.nullable(s.string("The Agora Console project name.")),
  appId: s.nullable(s.string("The Agora App ID for the project.")),
  recordingServer: s.nullable(s.string("The recording server IP address when returned by Agora.")),
  status: s.nullable(s.integer("The Agora project status, where 1 is enabled and 0 is disabled.")),
  created: s.nullable(s.integer("The Unix timestamp in seconds when the project was created.")),
});

const certificateProjectSchema = s.object("A normalized Agora certificate operation response.", {
  project: projectSchema,
  certificate: s.nullable(s.string("The primary App Certificate returned by Agora.")),
});

const usageRecordSchema = s.object("A normalized Agora project usage record.", {
  date: s.anyOf("The usage record date returned by Agora.", [
    s.string("The usage date as an ISO timestamp or date string."),
    s.integer("The usage date as a Unix timestamp when returned by Agora."),
  ]),
  usage: s.looseObject({}, { description: "The usage values keyed by Agora metric name." }),
  raw: s.looseObject({}, { description: "The raw usage record returned by Agora." }),
});

const usageBusinessSchema = s.stringEnum("The Agora usage business type.", [
  "default",
  "transcodeDuration",
  "recording",
  "cloudRecording",
  "miniapp",
]);

const projectStatusSchema = s.integer("The Agora project status, where 1 enables and 0 disables.", {
  minimum: 0,
  maximum: 1,
});

const projectOutputSchema = s.object("The normalized Agora project response.", {
  project: projectSchema,
});

export const agoraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Agora Console projects for the connected account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Agora projects.", {}),
    outputSchema: s.object("The normalized Agora project list response.", {
      projects: s.array("Projects returned by Agora.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve one Agora Console project by project ID and name.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving one Agora Console project.", {
      projectId: idSchema,
      name: projectNameSchema,
    }),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create an Agora Console project.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating an Agora Console project.",
      {
        name: projectNameSchema,
        enableCertificate: s.boolean("Whether to enable the primary App Certificate."),
      },
      { optional: ["enableCertificate"] },
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project_status",
    description: "Enable or disable an Agora Console project.",
    requiredScopes: [],
    inputSchema: s.object("Input for updating an Agora project status.", {
      projectId: idSchema,
      status: projectStatusSchema,
    }),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "set_primary_certificate",
    description: "Enable or disable the primary App Certificate for an Agora Console project.",
    requiredScopes: [],
    inputSchema: s.object("Input for setting an Agora primary App Certificate state.", {
      projectId: idSchema,
      enable: s.boolean("Whether to enable the primary App Certificate."),
    }),
    outputSchema: certificateProjectSchema,
  }),
  defineProviderAction(service, {
    name: "reset_primary_certificate",
    description: "Reset the primary App Certificate for an Agora Console project.",
    requiredScopes: [],
    inputSchema: s.object("Input for resetting an Agora primary App Certificate.", {
      projectId: idSchema,
    }),
    outputSchema: certificateProjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_project_usage",
    description: "Retrieve usage data for one Agora Console project and business type.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving Agora project usage.", {
      projectId: idSchema,
      fromDate: s.date("The inclusive usage start date in YYYY-MM-DD format."),
      toDate: s.date("The inclusive usage end date in YYYY-MM-DD format."),
      business: usageBusinessSchema,
    }),
    outputSchema: s.object("The normalized Agora project usage response.", {
      meta: s.looseObject({}, { description: "Agora usage metadata keyed by metric name." }),
      usages: s.array("Usage records returned by Agora.", usageRecordSchema),
    }),
  }),
];

export type AgoraActionName = (typeof agoraActions)[number]["name"];
