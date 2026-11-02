import { Validator } from "@cfworker/json-schema";
import { describe, expect, it } from "vitest";
import { neonAiGatewayActions } from "../neon_ai_gateway/actions.ts";
import { typesafeAiActions } from "./actions.ts";

describe.each([
  { service: "typesafe_ai", actions: typesafeAiActions, model: "jev-latest" },
  { service: "neon_ai_gateway", actions: neonAiGatewayActions, model: "typesafeai-jev-1-14-0" },
])("$service evaluation questions", ({ actions, model }) => {
  const action = actions.find((action) => action.name === "evaluate")!;
  const validator = new Validator(action.inputSchema);

  it.each([
    { type: "choice", criteria: { billing: "Billing", support: "Support" } },
    { type: "score", criteria: ["Low", "High"] },
  ])("requires type and criteria for $type while allowing omitted instructions", (question) => {
    const validate = (value: unknown) =>
      validator.validate({ model, state: "A billing issue", questions: { category: value } }).valid;

    expect(validate(question)).toBe(true);
    expect(validate({ ...question, instructions: "Classify this issue" })).toBe(true);
    expect(validate({ type: question.type })).toBe(false);
    expect(validate({ criteria: question.criteria })).toBe(false);
    expect(validate({})).toBe(false);
  });
});
