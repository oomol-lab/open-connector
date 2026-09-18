import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "airmeet";
const airmeetIdInput = s.requiredObject("The Airmeet event to inspect.", {
  airmeetId: s.nonWhitespaceString("The Airmeet event identifier."),
});
const item = (description: string) => s.looseRequiredObject(description, {});

export const airmeetActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_airmeets",
    operationType: "read",
    description: "List Airmeet events accessible to the connected community API key.",
    inputSchema: s.object(
      "Pagination options for listing Airmeet events.",
      {
        before: s.string("The cursor for fetching the previous page."),
        after: s.string("The cursor for fetching the next page."),
        size: s.integer("The number of Airmeet events to return, from 1 through 500.", { minimum: 1, maximum: 500 }),
      },
      { optional: ["before", "after", "size"] },
    ),
    outputSchema: s.requiredObject("The accessible Airmeet events and pagination cursors.", {
      data: s.array("The Airmeet events returned by the API.", item("An Airmeet event.")),
      cursors: s.looseRequiredObject("The pagination cursors returned by Airmeet.", {}),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    operationType: "read",
    description: "List sessions configured for an Airmeet event.",
    inputSchema: airmeetIdInput,
    outputSchema: s.requiredObject("The sessions configured for the Airmeet event.", {
      sessions: s.array("The Airmeet event sessions.", item("An Airmeet session.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_booths",
    operationType: "read",
    description: "List booths configured for an Airmeet event.",
    inputSchema: airmeetIdInput,
    outputSchema: s.requiredObject("The booths configured for the Airmeet event.", {
      booths: s.array("The Airmeet event booths.", item("An Airmeet booth.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tracks",
    operationType: "read",
    description: "List tracks configured for an Airmeet event.",
    inputSchema: airmeetIdInput,
    outputSchema: s.requiredObject("The tracks configured for the Airmeet event.", {
      tracks: s.array("The Airmeet event tracks.", item("An Airmeet track.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_custom_registration_fields",
    operationType: "read",
    description: "List custom registration fields configured for an Airmeet event.",
    inputSchema: airmeetIdInput,
    outputSchema: s.requiredObject("The custom registration fields configured for the Airmeet event.", {
      customFields: s.array(
        "The Airmeet event custom registration fields.",
        item("An Airmeet custom registration field."),
      ),
    }),
  }),
];
