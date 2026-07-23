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
