import { Validator } from "@cfworker/json-schema";
import { describe, expect, it } from "vitest";
import { piloterrActions } from "./actions.ts";

describe.each(["linkedin_company", "crunchbase_company"])("Piloterr %s input", (name) => {
  const action = piloterrActions.find((action) => action.name === name)!;
  const validator = new Validator(action.inputSchema);

  it.each([
    { input: { query: "openai" }, valid: true },
    { input: { domain: "openai.com" }, valid: true },
    { input: { query: "openai", domain: "openai.com" }, valid: false },
    { input: {}, valid: false },
  ])("validates $input as $valid", ({ input, valid }) => {
    expect(validator.validate(input).valid).toBe(valid);
  });
});
