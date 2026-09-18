import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "meituan";

export const meituanActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_travel",
    operationType: "read",
    description:
      "Query Meituan Travel for flights, trains, hotels, attractions, itineraries, local transportation, and other travel information using natural language. Requests may take up to two minutes, so use a caller timeout longer than 120 seconds.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString(
          "The user's travel question or request, including useful details such as dates, origin, destination, budget, and number of travelers.",
        ),
        city: s.nonEmptyString(
          "The user's current city or the city used as context for the travel query. Defaults to Beijing when omitted.",
        ),
        originQuery: s.nonEmptyString(
          "The complete original user request used for Meituan attribution and analytics. Defaults to query when omitted.",
        ),
      },
      ["query"],
      "The input payload for a Meituan Travel natural-language query.",
    ),
    outputSchema: s.actionOutput(
      {
        content: s.nonEmptyString(
          "The Meituan Travel result as Markdown text, which may include recommendations, prices, images, and booking links.",
        ),
      },
      "The normalized result returned by Meituan Travel.",
    ),
  }),
];
