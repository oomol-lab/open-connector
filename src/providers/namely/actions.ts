import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "namely";

const nonEmptyStringSchema = (description: string) => s.string({ description, minLength: 1 });
const namelyObjectSchema = s.looseObject("A Namely API object.");
const nullableNamelyObjectSchema = s.nullable(namelyObjectSchema);
const rawSchema = s.looseObject("The raw Namely API response object.");

const listPaginationFields = {
  page: s.integer("The Namely page number to request.", { minimum: 1 }),
  perPage: s.integer("The maximum number of Namely records to return per page.", {
    minimum: 1,
    maximum: 50,
  }),
};

export const namelyActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_profiles",
    description: "List Namely employee profiles visible to the personal access token.",
    inputSchema: s.object("The input payload for listing Namely profiles.", listPaginationFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: s.object(
      "The response returned when listing Namely profiles.",
      {
        profiles: s.array("The Namely profiles returned by the API.", namelyObjectSchema),
        meta: nullableNamelyObjectSchema,
        links: nullableNamelyObjectSchema,
        linked: nullableNamelyObjectSchema,
        raw: rawSchema,
      },
      { required: ["profiles", "meta", "links", "linked", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    description: "Get one Namely employee profile by profile ID.",
    inputSchema: s.object(
      "The input payload for getting a Namely profile.",
      {
        profileId: nonEmptyStringSchema("The Namely profile ID."),
      },
      { required: ["profileId"] },
    ),
    outputSchema: s.object(
      "The response returned when getting a Namely profile.",
      {
        profile: namelyObjectSchema,
        linked: nullableNamelyObjectSchema,
        raw: rawSchema,
      },
      { required: ["profile", "linked", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_current_profile",
    description: "Get the Namely profile associated with the personal access token.",
    inputSchema: s.object("The input payload for getting the current Namely profile.", {}),
    outputSchema: s.object(
      "The current Namely profile response.",
      {
        profile: namelyObjectSchema,
        linked: nullableNamelyObjectSchema,
        raw: rawSchema,
      },
      { required: ["profile", "linked", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_profile_fields",
    description: "List Namely profile fields configured for the company.",
    inputSchema: s.object("The input payload for listing Namely profile fields.", {}),
    outputSchema: s.object(
      "The response returned when listing Namely profile fields.",
      {
        profileFields: s.array("The Namely profile fields returned by the API.", namelyObjectSchema),
        meta: nullableNamelyObjectSchema,
        links: nullableNamelyObjectSchema,
        linked: nullableNamelyObjectSchema,
        raw: rawSchema,
      },
      { required: ["profileFields", "meta", "links", "linked", "raw"] },
    ),
  }),
];
