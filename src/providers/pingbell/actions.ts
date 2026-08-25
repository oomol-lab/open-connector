import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const sourceId = s.anyOf("The source ID returned by PingBell.", [
  s.nonEmptyString("A source ID represented as a string."),
  s.integer("A source ID represented as an integer."),
]);

export const pingbellActions: ActionDefinition[] = [
  defineProviderAction("pingbell", {
    name: "list_sources",
    description: "List the sources available to the connected PingBell account.",
    inputSchema: s.object("Input for listing PingBell sources.", {}),
    outputSchema: s.object("The available PingBell sources.", {
      sources: s.array(
        "The available sources.",
        s.object("One PingBell source.", {
          id: s.string("The source ID normalized as a string."),
          name: s.string("The source name."),
        }),
      ),
    }),
  }),
  defineProviderAction("pingbell", {
    name: "ring_source",
    description: "Ring a PingBell source so its counter and subscribed devices update.",
    inputSchema: s.object(
      "Input for sending a PingBell notification.",
      {
        sourceId,
        amount: s.number("Optional revenue amount."),
        currency: s.nonEmptyString("Optional currency code."),
        transactionId: s.nonEmptyString("Optional transaction ID for deduplication."),
      },
      { optional: ["amount", "currency", "transactionId"] },
    ),
    outputSchema: s.object("The PingBell notification result.", {
      status: s.string("The status text returned by PingBell."),
    }),
  }),
];
