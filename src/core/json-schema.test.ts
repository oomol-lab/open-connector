import { describe, expect, it } from "vitest";
import { describeSchemaType, jsonSchema, readSchemaProperties, readSchemaRequired } from "./json-schema.ts";

describe("jsonSchema.looseObject", () => {
  it("keeps properties whose names overlap schema option names", () => {
    expect(
      jsonSchema.looseObject(
        "A provider payload.",
        {
          default: jsonSchema.boolean("Whether this is the default item."),
          description: jsonSchema.string("The provider description."),
          format: jsonSchema.string("The provider format."),
        },
        { default: {} },
      ),
    ).toEqual({
      type: "object",
      properties: {
        default: { type: "boolean", description: "Whether this is the default item." },
        description: { type: "string", description: "The provider description." },
        format: { type: "string", description: "The provider format." },
      },
      additionalProperties: true,
      description: "A provider payload.",
      default: {},
    });
  });
});

describe("jsonSchema.nonEmptyString", () => {
  it("preserves additional string constraints", () => {
    expect(
      jsonSchema.nonEmptyString("A constrained identifier.", {
        maxLength: 16,
        pattern: "^[a-z]+$",
      }),
    ).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 16,
      pattern: "^[a-z]+$",
      description: "A constrained identifier.",
    });
  });
});

describe("jsonSchema.nonWhitespaceString", () => {
  it("rejects empty and whitespace-only strings", () => {
    expect(jsonSchema.nonWhitespaceString("A meaningful value.", { maxLength: 64 })).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "\\S",
      description: "A meaningful value.",
    });
  });
});

describe("jsonSchema.array", () => {
  it("preserves array uniqueness constraints", () => {
    expect(
      jsonSchema.stringArray("Unique identifiers.", {
        maxItems: 100,
        uniqueItems: true,
        itemDescription: "An identifier.",
      }),
    ).toEqual({
      type: "array",
      items: { type: "string", minLength: 1, description: "An identifier." },
      maxItems: 100,
      uniqueItems: true,
      description: "Unique identifiers.",
    });
  });
});

describe("jsonSchema.looseRequiredObject", () => {
  it("requires every property except explicitly optional properties", () => {
    expect(
      jsonSchema.looseRequiredObject(
        "A provider resource.",
        {
          id: jsonSchema.string("The resource identifier."),
          label: jsonSchema.string("The optional label."),
        },
        { optional: ["label"] },
      ),
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string", description: "The resource identifier." },
        label: { type: "string", description: "The optional label." },
      },
      required: ["id"],
      additionalProperties: true,
      description: "A provider resource.",
    });

    expect(
      jsonSchema.looseRequiredObject("A fully required resource.", {
        id: jsonSchema.string("The resource identifier."),
      }),
    ).toMatchObject({ required: ["id"] });
  });
});

describe("jsonSchema.optional", () => {
  it("does not make later uses of the base schema optional", () => {
    const base = jsonSchema.string("A shared identifier.");
    const optional = jsonSchema.optional(base);

    expect(jsonSchema.requiredObject("Optional use.", { id: optional })).not.toHaveProperty("required");
    expect(jsonSchema.requiredObject("Required use.", { id: base })).toHaveProperty("required", ["id"]);
  });

  it("preserves optional markers through description and default wrappers", () => {
    const optional = jsonSchema.optional(jsonSchema.string("A shared identifier."));
    const described = jsonSchema.describe(optional, "A renamed identifier.");
    const defaulted = jsonSchema.withDefault(described, "default-id");

    expect(jsonSchema.requiredObject("Wrapped optional use.", { id: defaulted })).not.toHaveProperty("required");
  });
});

describe("jsonSchema.requireAnyProperty", () => {
  it("requires at least one of the named object properties", () => {
    const schema = jsonSchema.object(
      "A partial update.",
      {
        name: jsonSchema.string("A new name."),
        color: jsonSchema.string("A new color."),
      },
      { optional: ["name", "color"] },
    );

    expect(jsonSchema.requireAnyProperty(schema, ["name", "color"])).toMatchObject({
      anyOf: [{ required: ["name"] }, { required: ["color"] }],
    });
    expect(schema).not.toHaveProperty("anyOf");
  });
});

describe("readSchemaProperties", () => {
  it("returns the properties map of an object schema", () => {
    expect(readSchemaProperties({ type: "object", properties: { id: { type: "string" } } })).toEqual({
      id: { type: "string" },
    });
  });

  it("treats a missing, non-object, or array-valued properties as empty", () => {
    expect(readSchemaProperties({ type: "object" })).toEqual({});
    expect(readSchemaProperties({ type: "object", properties: "id" })).toEqual({});
    expect(readSchemaProperties({ type: "object", properties: null })).toEqual({});
    // An array is an object at runtime; exposing its indexes as parameter names would be wrong.
    expect(readSchemaProperties({ type: "object", properties: [{ type: "string" }] })).toEqual({});
  });
});

describe("readSchemaRequired", () => {
  it("keeps only the string entries of required", () => {
    expect(readSchemaRequired({ required: ["id", 1, null, "name"] })).toEqual(["id", "name"]);
  });

  it("treats a missing or non-array required as empty", () => {
    expect(readSchemaRequired({})).toEqual([]);
    expect(readSchemaRequired({ required: "id" })).toEqual([]);
  });
});

describe("describeSchemaType", () => {
  it("renders const, enum, anyOf, and plain types", () => {
    expect(describeSchemaType({ const: "fixed" })).toBe('"fixed"');
    expect(describeSchemaType({ const: null, type: "null" })).toBe("null");
    expect(describeSchemaType({ enum: ["a", 1] })).toBe('"a" | 1');
    expect(describeSchemaType({ anyOf: [{ type: "string" }, { enum: ["x"] }] })).toBe('string | "x"');
    expect(describeSchemaType({ type: "integer" })).toBe("integer");
  });

  it("falls back to unknown without a describable shape", () => {
    expect(describeSchemaType(undefined)).toBe("unknown");
    expect(describeSchemaType({})).toBe("unknown");
    expect(describeSchemaType({ type: ["string", "null"] })).toBe("unknown");
  });
});
