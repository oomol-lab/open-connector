import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pod_ai";

const metadataSchema = s.record(
  "Additional metadata forwarded to the Pod AI agent for the outbound call.",
  s.unknown("A metadata value passed to the Pod AI API."),
);

const callResponseSchema = s.looseObject("The outbound call object returned by the Pod AI API.");

export const podAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_outbound_call",
    description: "Create an outbound phone call with a Pod AI voice agent.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating a Pod AI outbound call.",
      {
        target_phone_number: s.nonEmptyString("The destination phone number to call, formatted as E.164."),
        from_phone_number: s.nonEmptyString("The Pod AI phone number to call from, formatted as E.164."),
        agent_id: s.nonEmptyString("The Pod AI agent identifier that should make the call."),
        metadata: metadataSchema,
      },
      { optional: ["metadata"] },
    ),
    outputSchema: s.requiredObject("The output payload for creating a Pod AI outbound call.", {
      call: callResponseSchema,
    }),
  }),
];
