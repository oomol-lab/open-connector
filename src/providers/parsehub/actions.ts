import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "parsehub";

const runSchema = s.looseRequiredObject(
  "Summary of the most recent ParseHub run attached to a project.",
  {
    token: s.nullable(s.string("Unique token of the run when returned by ParseHub.")),
    status: s.nullable(s.string("Run status returned by ParseHub.")),
    data: s.nullable(s.string("URL to the JSON data of the run when available.")),
    dateCreated: s.nullable(s.string("Timestamp when the run was created.")),
    dateUpdated: s.nullable(s.string("Timestamp when the run was last updated.")),
    raw: s.looseObject("Raw last_run payload returned by ParseHub."),
  },
  {
    optional: ["token", "status", "data", "dateCreated", "dateUpdated", "raw"],
  },
);

const templateSchema = s.looseRequiredObject(
  "ParseHub template summary attached to a project.",
  {
    name: s.string("Template name."),
    templateToken: s.string("Unique template token."),
    raw: s.looseObject("Raw template payload returned by ParseHub."),
  },
  {
    optional: ["raw"],
  },
);

const projectListSchema = s.looseRequiredObject(
  "ParseHub project summary.",
  {
    token: s.string("Unique project token."),
    name: s.string("Project name."),
    lastRun: s.nullable(runSchema),
    templates: s.array("Templates defined in the project.", templateSchema),
    raw: s.looseObject("Raw project payload returned by ParseHub."),
  },
  {
    optional: ["lastRun", "templates", "raw"],
  },
);

const projectDetailSchema = s.looseRequiredObject(
  "ParseHub project detail payload.",
  {
    token: s.string("Unique project token."),
    name: s.nullable(s.string("Project name when ParseHub returns it.")),
    title: s.nullable(s.string("Project title returned by ParseHub.")),
    lastRunToken: s.nullable(s.string("Token of the most recent run when available.")),
    lastReadyRunToken: s.nullable(s.string("Token of the most recent ready run when available.")),
    optionsJson: s.nullable(s.string("Stringified project options when available.")),
    mainTemplate: s.nullable(s.string("Main template name when available.")),
    mainSite: s.nullable(s.string("Main site URL when available.")),
    raw: s.looseObject("Raw project payload returned by ParseHub."),
  },
  {
    optional: ["name", "title", "lastRunToken", "lastReadyRunToken", "optionsJson", "mainTemplate", "mainSite", "raw"],
  },
);

export const parsehubActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List ParseHub projects accessible to the API key with optional offset pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing ParseHub projects.",
      {
        limit: s.integer("Maximum number of projects to return.", { minimum: 1, maximum: 100 }),
        offset: s.nonNegativeInteger("Zero-based project offset for pagination."),
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("ParseHub project list response.", {
      projects: s.array("Projects accessible to the API key.", projectListSchema),
      totalProjects: s.nonNegativeInteger("Total number of projects in the account."),
      limit: s.nullable(s.nonNegativeInteger("Limit value echoed by ParseHub when available.")),
      offset: s.nullable(s.nonNegativeInteger("Offset value echoed by ParseHub when available.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one ParseHub project by project token from the API key's accessible project list.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting one ParseHub project.", {
      projectToken: s.nonEmptyString("Project token to retrieve."),
    }),
    outputSchema: s.object("Single ParseHub project response.", {
      project: projectDetailSchema,
    }),
  }),
];
