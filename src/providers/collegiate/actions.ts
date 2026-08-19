import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "collegiate";

const looseEntrySchema = s.looseObject(
  "A Merriam-Webster Collegiate Dictionary entry modeled from the official JSON documentation. Entries include upstream rich JSON fields and may include derived audio_url, image_url, and page_url helpers.",
);

export const collegiateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_word",
    description:
      "Look up a word in the Merriam-Webster Collegiate Dictionary and return matching entries or spelling suggestions.",
    inputSchema: s.object("The input payload for a Merriam-Webster Collegiate Dictionary lookup.", {
      term: s.nonEmptyString("The headword or stem query to send to the Merriam-Webster Collegiate Dictionary API."),
    }),
    outputSchema: s.object("A Merriam-Webster lookup response containing JSON-only entries and spelling suggestions.", {
      query: s.string("The original lookup term."),
      entries: s.array("The Merriam-Webster entry objects returned for the lookup term.", looseEntrySchema),
      suggestions: s.stringArray("The spelling suggestions returned for the lookup term."),
    }),
  }),
];
