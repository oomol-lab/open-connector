import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { buildExampleInput } from "./action-example.ts";

const action: ActionDefinition = {
  id: "github.delete_repository",
  service: "github",
  name: "delete_repository",
  description: "Delete a repository.",
  operationType: "destructive",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object", properties: { repo: { type: "string" } }, required: ["repo"] },
  outputSchema: { type: "object" },
};

describe("buildExampleInput", () => {
  function expectValidExample(label: string, inputSchema: JsonSchema): void {
    const example = buildExampleInput(inputSchema);
    const result = validateActionInput({ ...action, inputSchema }, example);
    expect(result.valid, `${label}: ${JSON.stringify(example)}`).toBe(true);
  }

  it("preserves defaults that satisfy the schema", () => {
    expect(
      buildExampleInput({
        type: "object",
        properties: { keyword: { type: "string", default: "search", minLength: 1 } },
        required: ["keyword"],
      }),
    ).toEqual({ keyword: "search" });
  });

  it("seeds requirements declared inside allOf", () => {
    expectValidExample("allOf member requirement", {
      type: "object",
      required: ["id"],
      allOf: [
        {
          oneOf: [
            { required: ["sheetId"], not: { required: ["sheetName"] } },
            { required: ["sheetName"], not: { required: ["sheetId"] } },
          ],
        },
      ],
    });
  });

  it("preserves tuple, numeric-bound, and discriminator constraints", () => {
    expectValidExample("combined integer bounds", {
      type: "object",
      properties: { value: { type: "integer", minimum: 0, exclusiveMinimum: 2, maximum: 3 } },
      required: ["value"],
    });

    expectValidExample("tuple filled to minItems", {
      type: "object",
      properties: {
        pair: { type: "array", prefixItems: [{ type: "string" }], items: { type: "string" }, minItems: 2 },
      },
      required: ["pair"],
    });

    expectValidExample("discriminated oneOf branch", {
      type: "object",
      required: ["kind"],
      properties: { kind: { const: "folder" } },
      oneOf: [
        { required: ["fileId"], properties: { kind: { const: "file" }, fileId: { type: "string" } } },
        { required: ["folderId"], properties: { kind: { const: "folder" }, folderId: { type: "string" } } },
      ],
    });
  });

  it("generates an example that satisfies merged allOf, format bounds, and item bounds", () => {
    expectValidExample("allOf member property constraint", {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
      allOf: [{ properties: { name: { type: "string", minLength: 1 } } }],
    });

    expectValidExample("formatted string length bounds", {
      type: "object",
      properties: { email: { type: "string", format: "email", minLength: 17, maxLength: 17 } },
      required: ["email"],
    });

    expectValidExample("formatted uri minimum length", {
      type: "object",
      properties: { callback: { type: "string", format: "uri", minLength: 24 } },
      required: ["callback"],
    });

    expectValidExample("unique numeric items with a minimum", {
      type: "object",
      properties: {
        scores: { type: "array", items: { type: "integer", minimum: 10 }, minItems: 2, uniqueItems: true },
      },
      required: ["scores"],
    });

    expectValidExample("hostname with a long minimum", {
      type: "object",
      properties: { host: { type: "string", format: "hostname", minLength: 80 } },
      required: ["host"],
    });

    expectValidExample("unique string items with a minimum length", {
      type: "object",
      properties: { tags: { type: "array", items: { type: "string", minLength: 2 }, minItems: 2, uniqueItems: true } },
      required: ["tags"],
    });
  });

  it("satisfies sibling anyOf and oneOf requirements", () => {
    expectValidExample("both combinators", {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        html: { type: "string", minLength: 1 },
        prompt: { type: "string", minLength: 1 },
        responseFormat: { type: "object" },
      },
      oneOf: [{ required: ["url"] }, { required: ["html"] }],
      anyOf: [{ required: ["prompt"] }, { required: ["responseFormat"] }],
    });
  });

  it("selects a required-property branch without seeding forbidden optional fields", () => {
    expectValidExample("optional default branch", {
      type: "object",
      properties: { chainId: { type: "integer" }, network: { type: "string" } },
      oneOf: [
        { not: { anyOf: [{ required: ["chainId"] }, { required: ["network"] }] } },
        { required: ["chainId"], not: { required: ["network"] } },
        { required: ["network"], not: { required: ["chainId"] } },
      ],
    });
  });

  it("keeps the first anyOf object candidate when later branches require fields", () => {
    const text = { type: "object", properties: { text: { type: "string" } }, additionalProperties: false };
    expectValidExample("array with an optional-field object variant", {
      type: "object",
      properties: {
        content: {
          type: "array",
          minItems: 1,
          contains: text,
          items: { anyOf: [text, { type: "object", properties: { image: { type: "string" } }, required: ["image"] }] },
        },
      },
      required: ["content"],
    });
  });

  it("preserves nested union constraints when selecting a branch", () => {
    expectValidExample("nested anyOf", {
      type: "object",
      properties: {
        to: {
          anyOf: [
            { anyOf: [{ type: "string", minLength: 1 }, { type: "number" }] },
            { type: "array", items: { type: "string" }, minItems: 1 },
          ],
        },
      },
      required: ["to"],
    });
  });

  it("preserves object requirements inside a selected branch", () => {
    expectValidExample("nested object combinators", {
      type: "object",
      properties: {
        message: {
          type: "object",
          properties: { html: { type: "string" }, text: { type: "string" }, template: { type: "string" } },
          oneOf: [{ anyOf: [{ required: ["html"] }, { required: ["text"] }] }, { required: ["template"] }],
        },
      },
      required: ["message"],
    });
  });

  it("distinguishes nested oneOf object branches without required properties", () => {
    expectValidExample("nested oneOf shapes", {
      type: "object",
      properties: {
        permission: {
          oneOf: [
            { type: "object", properties: { mode: { const: "all" } }, additionalProperties: false },
            { type: "object", properties: { mode: { const: "none" } }, additionalProperties: false },
          ],
        },
      },
      required: ["permission"],
    });
  });

  it.each([true, undefined])(
    "fills open maps with minProperties when additionalProperties is %s",
    (additionalProperties) => {
      expectValidExample("open map", {
        type: "object",
        properties: { filters: { type: "object", additionalProperties, minProperties: 1 } },
        required: ["filters"],
      });
    },
  );

  it("applies absent-property conditions and nested object refinements", () => {
    expectValidExample("conditional nested field", {
      type: "object",
      properties: {
        mode: { enum: ["text", "image"] },
        subject: {
          type: "object",
          properties: { name: { type: "string" }, date: { type: "string", format: "date" } },
          required: ["name"],
        },
      },
      required: ["subject"],
      allOf: [
        {
          if: { properties: { mode: { const: "text" } } },
          then: { properties: { subject: { required: ["date"], properties: { name: { minLength: 2 } } } } },
        },
      ],
    });
  });

  it("applies else refinements to array items and numeric enums", () => {
    expectValidExample("conditional array and enum", {
      type: "object",
      properties: {
        mode: { type: "string" },
        month: { type: "integer", enum: [-1, 1, 2] },
        changes: {
          type: "array",
          minItems: 1,
          items: { type: "object", properties: { uri: { type: "string", minLength: 1 } } },
        },
      },
      required: ["month", "changes"],
      allOf: [
        {
          if: { required: ["mode"], properties: { mode: { const: "lunar" } } },
          else: { properties: { month: { minimum: 1 }, changes: { items: { required: ["uri"] } } } },
        },
      ],
    });
  });

  it("seeds a conditional required field using its parent type and branch bounds", () => {
    expectValidExample("conditional required field", {
      type: "object",
      properties: { message: { type: "string", maxLength: 100 } },
      if: { properties: { mode: { const: "text" } } },
      then: { required: ["message"], properties: { message: { minLength: 2 } } },
    });
  });

  it("uses propertyNames when filling a required map", () => {
    expectValidExample("currency map", {
      type: "object",
      minProperties: 1,
      propertyNames: { type: "string", pattern: "^[A-Z]{3}$" },
      additionalProperties: { type: "number", minimum: 1 },
    });
  });

  it("selects a nonempty oneOf shape when an empty object matches both branches", () => {
    expectValidExample("empty and optional-field shapes", {
      oneOf: [
        { type: "object", properties: {}, additionalProperties: false },
        { type: "object", properties: { latitude: { type: "number" } }, additionalProperties: false },
      ],
    });
  });
});
