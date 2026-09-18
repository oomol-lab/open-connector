import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "streak";

const rawPayload = s.unknown("Raw Streak response payload.");
const rawEntity = s.looseObject("Raw Streak entity fields returned by the API.");

export const streakActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Read the Streak user associated with the authenticated API key.",
    inputSchema: s.object("No input is required to read the current Streak user.", {}),
    outputSchema: s.object("Current Streak user response.", {
      user: rawEntity,
      raw: rawPayload,
    }),
  }),
  defineProviderAction(service, {
    name: "list_pipelines",
    operationType: "read",
    description: "List Streak pipelines visible to the authenticated API key.",
    followUpActions: ["streak.get_pipeline"],
    inputSchema: s.object(
      "Request parameters for listing Streak pipelines.",
      {
        sortBy: s.stringEnum("Sort Streak pipelines by the documented timestamp field.", [
          "creationTimestamp",
          "lastUpdatedTimestamp",
        ]),
      },
      { optional: ["sortBy"] },
    ),
    outputSchema: s.object("Streak pipeline list response.", {
      pipelines: s.array("Streak pipelines returned by the API.", rawEntity),
      raw: rawPayload,
    }),
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    operationType: "read",
    description: "Read one Streak pipeline by key.",
    inputSchema: s.object("Request parameters for reading one Streak pipeline.", {
      pipelineKey: s.nonEmptyString("The Streak pipeline key."),
    }),
    outputSchema: s.object("Single Streak pipeline response.", {
      pipeline: rawEntity,
      raw: rawPayload,
    }),
  }),
  defineProviderAction(service, {
    name: "get_box",
    operationType: "read",
    description: "Read one Streak box by key.",
    inputSchema: s.object("Request parameters for reading one Streak box.", {
      boxKey: s.nonEmptyString("The Streak box key."),
    }),
    outputSchema: s.object("Single Streak box response.", {
      box: rawEntity,
      raw: rawPayload,
    }),
  }),
];
