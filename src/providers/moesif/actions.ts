import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "moesif";

const organizationIdSchema = s.nonEmptyString(
  "The Moesif organization path segment. Use the default ~ value for the current organization.",
);
const takeSchema = s.positiveInteger("The maximum number of records to return.", {
  maximum: 100,
});
const beforeIdSchema = s.nonEmptyString("The cursor ID used to fetch records before that item.");
const appIdSchema = s.nonEmptyString("The Moesif app ID. Use the default ~ value for the current app.");
const workspaceIdSchema = s.nonEmptyString("The Moesif workspace ID.");
const workspaceAccessSchema = s.stringArray("The Moesif workspace access filters to request.", {
  itemDescription: "One Moesif workspace access value.",
  minItems: 1,
});

const appSchema = s.object("A normalized Moesif app.", {
  id: s.nullableString("The Moesif app ID."),
  name: s.string("The Moesif app name."),
  customAppId: s.nullableString("The custom app ID when configured."),
  searchApiBaseUrl: s.nullableString("The app search API base URL when returned."),
  portalApiBaseUrl: s.nullableString("The app portal API base URL when returned."),
  timeZone: s.nullableString("The app time zone when returned."),
  weekStartsOn: s.nullableInteger("The first day of the app week when returned."),
  secureProxy: s.nullableBoolean("Whether secure proxy is enabled for the app."),
  raw: s.unknownObject("The raw app object returned by Moesif."),
});

const workspaceSchema = s.object("A normalized Moesif workspace.", {
  id: s.nullableString("The Moesif workspace ID."),
  name: s.nullableString("The workspace name when returned."),
  appId: s.nullableString("The app ID associated with the workspace when returned."),
  organizationId: s.nullableString("The organization ID associated with the workspace."),
  type: s.nullableString("The Moesif workspace type when returned."),
  isDefault: s.nullableBoolean("Whether this is the default workspace when returned."),
  isTemplate: s.nullableBoolean("Whether this workspace is a template when returned."),
  viewCount: s.nullableInteger("The workspace view count when returned."),
  created: s.nullableString("The workspace creation timestamp when returned."),
  raw: s.unknownObject("The raw workspace object returned by Moesif."),
});

export type MoesifActionName = "list_apps" | "list_workspaces" | "get_workspace" | "list_workspace_templates";

export const moesifActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apps",
    description: "List apps in the selected Moesif organization.",
    requiredScopes: ["read:apps"],
    inputSchema: s.actionInput(
      {
        organizationId: organizationIdSchema,
        take: takeSchema,
        beforeId: beforeIdSchema,
      },
      [],
      "Input for listing Moesif apps.",
    ),
    outputSchema: s.actionOutput(
      {
        apps: s.array("The Moesif apps returned by the API.", appSchema),
      },
      "The response returned when listing Moesif apps.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Moesif workspaces for an app with access filters.",
    requiredScopes: ["read:workspaces"],
    inputSchema: s.actionInput(
      {
        organizationId: organizationIdSchema,
        appId: appIdSchema,
        take: takeSchema,
        beforeId: beforeIdSchema,
        access: workspaceAccessSchema,
      },
      ["access"],
      "Input for listing Moesif workspaces.",
    ),
    outputSchema: s.actionOutput(
      {
        workspaces: s.array("The Moesif workspaces returned by the API.", workspaceSchema),
      },
      "The response returned when listing Moesif workspaces.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get a Moesif workspace by ID.",
    requiredScopes: ["read:workspaces"],
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        organizationId: organizationIdSchema,
        appId: appIdSchema,
      },
      ["workspaceId"],
      "Input for getting a Moesif workspace.",
    ),
    outputSchema: s.actionOutput(
      {
        workspace: workspaceSchema,
      },
      "The response returned when getting a Moesif workspace.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_workspace_templates",
    description: "List Moesif workspace templates for an app.",
    requiredScopes: ["read:workspaces"],
    inputSchema: s.actionInput(
      {
        organizationId: organizationIdSchema,
        appId: appIdSchema,
      },
      [],
      "Input for listing Moesif workspace templates.",
    ),
    outputSchema: s.actionOutput(
      {
        templates: s.array("The Moesif workspace templates returned by the API.", workspaceSchema),
      },
      "The response returned when listing Moesif workspace templates.",
    ),
  }),
];
