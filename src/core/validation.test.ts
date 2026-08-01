import { describe, expect, it } from "vitest";
import { provider as quickchartProvider } from "../providers/quickchart/definition.ts";
import { validateActionInput } from "./validation.ts";

describe("validateActionInput", () => {
  it("validates catalog action input without runtime code generation", () => {
    const action = quickchartProvider.actions.find((action) => action.id === "quickchart.build_qr_url");
    expect(action).toBeDefined();

    const result = validateActionInput(action!, {});

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "required",
          error: 'Instance does not have required property "text".',
        }),
      ]),
    );
  });

  it("reports every invalid property instead of stopping at the first", () => {
    const action = {
      id: "example.echo",
      service: "example",
      name: "echo",
      description: "Example action.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "string" },
          second: { type: "number" },
          third: { type: "boolean" },
        },
        required: ["first", "second", "third"],
      },
      outputSchema: { type: "object" },
    } as never;

    const result = validateActionInput(action, { first: 1, second: "two", third: "three" });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.instanceLocation)).toEqual(
      expect.arrayContaining(["#/first", "#/second", "#/third"]),
    );
  });
});
