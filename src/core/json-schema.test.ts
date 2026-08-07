import { describe, expect, it } from "vitest";
import { jsonSchema } from "./json-schema.ts";

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
