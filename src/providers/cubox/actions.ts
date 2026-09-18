import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cubox";

export const cuboxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "save_url",
    operationType: "write",
    description: "Save a web page to Cubox for queued parsing and snapshot processing.",
    inputSchema: s.object(
      "The web page and optional metadata to save to Cubox.",
      {
        url: s.url("The web page URL to save."),
        title: s.nonEmptyString("Optional title for the saved page."),
        description: s.nonEmptyString("Optional description for the saved page."),
        tags: s.stringArray("Optional Cubox tags to apply to the saved page.", {
          itemDescription: "A Cubox tag.",
        }),
        folder: s.nonEmptyString("Optional Cubox folder name for the saved page."),
      },
      { optional: ["title", "description", "tags", "folder"] },
    ),
    outputSchema: s.actionOutput(
      {
        queued: s.boolean("Whether Cubox accepted the page for queued parsing and snapshot processing."),
      },
      "The Cubox save result.",
    ),
  }),
];
