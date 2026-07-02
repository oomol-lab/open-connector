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
});
