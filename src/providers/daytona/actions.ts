import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "daytona";

const sandboxSchema = s.looseObject("A Daytona sandbox.", {
  id: s.string("The sandbox ID."),
  name: s.string("The sandbox name."),
  state: s.string("The current sandbox state."),
  desiredState: s.string("The desired sandbox state."),
  snapshot: s.string("The snapshot used by the sandbox."),
  target: s.string("The Daytona target region for the sandbox."),
  cpu: s.number("The allocated CPU cores."),
  memory: s.number("The allocated memory in GiB."),
  disk: s.number("The allocated disk space in GiB."),
  labels: s.record("Labels attached to the sandbox.", s.string("A label value.")),
  createdAt: s.string("The sandbox creation timestamp."),
  updatedAt: s.string("The sandbox update timestamp."),
});

const sandboxIdInputSchema = s.object("A Daytona sandbox lookup.", {
  sandboxIdOrName: s.nonEmptyString("The ID or name of the sandbox."),
});

const sandboxOutputSchema = s.object("A Daytona sandbox result.", {
  sandbox: sandboxSchema,
});

export const daytonaActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sandboxes",
    description: "List Daytona sandboxes with cursor pagination and common filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing Daytona sandboxes.",
      {
        cursor: s.string("The cursor returned by the previous page."),
        limit: s.integer("The maximum number of sandboxes to return.", {
          minimum: 1,
          maximum: 200,
        }),
        id: s.string("An ID prefix to filter by, matched case-insensitively."),
        name: s.string("A name prefix to filter by, matched case-insensitively."),
        states: s.stringArray("Sandbox states to include.", { minItems: 1 }),
        includeErroredDeleted: s.boolean("Whether to include errored sandboxes whose desired state is deleted."),
      },
      { optional: ["cursor", "limit", "id", "name", "states", "includeErroredDeleted"] },
    ),
    outputSchema: s.object("A page of Daytona sandboxes.", {
      sandboxes: s.array("Sandboxes in the current page.", sandboxSchema),
      nextCursor: s.nullable(s.string("The cursor for the next page, or null when no page remains.")),
    }),
    followUpActions: ["daytona.list_sandboxes"],
  }),
  defineProviderAction(service, {
    name: "get_sandbox",
    description: "Get one Daytona sandbox by ID or name.",
    requiredScopes: [],
    inputSchema: sandboxIdInputSchema,
    outputSchema: sandboxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_sandbox",
    description: "Create a Daytona sandbox from a snapshot with optional resource and lifecycle settings.",
    requiredScopes: [],
    inputSchema: s.object(
      "Settings for creating a Daytona sandbox.",
      {
        name: s.string("The sandbox name. Daytona uses the generated ID when omitted."),
        snapshot: s.string("The ID or name of the snapshot to use."),
        target: s.string("The target region where Daytona should create the sandbox."),
        cpu: s.integer("The number of CPU cores to allocate.", { minimum: 1 }),
        memory: s.integer("The memory to allocate in GiB.", { minimum: 1 }),
        disk: s.integer("The disk space to allocate in GiB.", { minimum: 1 }),
        env: s.record("Environment variables for the sandbox.", s.string("An environment variable value.")),
        labels: s.record("Labels for the sandbox.", s.string("A label value.")),
        autoStopInterval: s.integer(
          "Minutes of inactivity before Daytona stops the sandbox; zero disables auto-stop.",
          { minimum: 0 },
        ),
        autoArchiveInterval: s.integer("Minutes before Daytona archives a stopped sandbox.", {
          minimum: 0,
        }),
        autoDeleteInterval: s.integer("Minutes before Daytona deletes a stopped sandbox; zero deletes immediately.", {
          minimum: 0,
        }),
        ttlMinutes: s.integer("Maximum wall-clock lifetime in minutes; zero disables the TTL.", {
          minimum: 0,
        }),
      },
      {
        optional: [
          "name",
          "snapshot",
          "target",
          "cpu",
          "memory",
          "disk",
          "env",
          "labels",
          "autoStopInterval",
          "autoArchiveInterval",
          "autoDeleteInterval",
          "ttlMinutes",
        ],
      },
    ),
    outputSchema: sandboxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_sandbox",
    description: "Start, restore, or resume a Daytona sandbox according to its current state.",
    requiredScopes: [],
    inputSchema: sandboxIdInputSchema,
    outputSchema: sandboxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "stop_sandbox",
    description: "Stop a Daytona sandbox, optionally forcing an immediate stop.",
    requiredScopes: [],
    inputSchema: s.object(
      "Settings for stopping a Daytona sandbox.",
      {
        sandboxIdOrName: s.nonEmptyString("The ID or name of the sandbox."),
        force: s.boolean("Whether to force the sandbox to stop with SIGKILL instead of SIGTERM."),
      },
      { optional: ["force"] },
    ),
    outputSchema: sandboxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_sandbox",
    description: "Delete a Daytona sandbox by ID or name.",
    requiredScopes: [],
    inputSchema: sandboxIdInputSchema,
    outputSchema: sandboxOutputSchema,
  }),
];
