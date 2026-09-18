import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "metatextai";

const roleSchema = s.stringEnum("Message role accepted by MetatextAI evaluation.", [
  "system",
  "user",
  "assistant",
  "tool",
]);
const policyTargetSchema = s.stringEnum("Policy target checked by MetatextAI guardrails.", ["input", "output"]);
const policySchema = s.looseObject("A MetatextAI policy object returned by the guard API.", {
  id: s.string("The MetatextAI policy identifier."),
  name: s.string("The policy display name."),
  type: s.string("The MetatextAI policy type."),
});
const messageSchema = s.requiredObject("A chat message submitted to MetatextAI evaluation.", {
  role: roleSchema,
  content: s.string("The chat message content."),
});
const policyRuleSchema = s.looseObject(
  "Policy rule payload accepted by MetatextAI. Keep nested fields flexible because rule shape varies by policy type.",
);
const evaluateResponseSchema = s.looseObject("The raw MetatextAI evaluate response payload.");
const scanResponseSchema = s.looseObject("The raw MetatextAI red-team scan response payload.");

export const metatextaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_policies",
    operationType: "read",
    description: "List all guardrail policies configured for the connected MetatextAI application.",
    requiredScopes: [],
    inputSchema: s.object({}, { description: "This action does not require any input parameters." }),
    outputSchema: s.requiredObject("The policies returned by MetatextAI for the current application.", {
      policies: s.array("Policies configured for the application.", policySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_policy",
    operationType: "write",
    description: "Create one guardrail policy for the connected MetatextAI application.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating one MetatextAI policy.",
      {
        name: s.nonEmptyString("Policy name shown in MetatextAI."),
        type: s.nonEmptyString("Policy type identifier accepted by MetatextAI."),
        target: s.array("Application message targets checked by this policy.", policyTargetSchema, {
          minItems: 1,
        }),
        rule: policyRuleSchema,
      },
      { optional: ["target", "rule"] },
    ),
    outputSchema: s.requiredObject("The created MetatextAI policy.", {
      policy: policySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "evaluate",
    operationType: "read",
    description: "Evaluate one chat transcript against the connected MetatextAI application's configured guardrails.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for running a MetatextAI guardrails evaluation.",
      {
        messages: s.array("Messages checked by MetatextAI.", messageSchema, { minItems: 1 }),
        policyIds: s.array("Optional policy identifiers to evaluate explicitly.", s.string("Policy ID.")),
        failFast: s.boolean("Whether MetatextAI should stop at the first violation."),
        correctionEnabled: s.boolean("Whether MetatextAI should return a corrected output when a violation is found."),
        overrideResponse: s.string("Optional fixed response string returned instead of the blocked model output."),
      },
      {
        required: ["messages"],
        optional: ["policyIds", "failFast", "correctionEnabled", "overrideResponse"],
      },
    ),
    outputSchema: s.requiredObject("The MetatextAI evaluation result payload.", {
      result: evaluateResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "run_test_scan",
    operationType: "write",
    description: "Run a MetatextAI red-team test scan for the connected application with the selected probes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for triggering a MetatextAI red-team scan.",
      {
        probes: s.array("Probe identifiers to run in the red-team scan.", s.string("Probe name."), {
          minItems: 1,
        }),
      },
      { optional: ["probes"] },
    ),
    outputSchema: s.requiredObject("The red-team scan response returned by MetatextAI.", {
      result: scanResponseSchema,
    }),
  }),
];
