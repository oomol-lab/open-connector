import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "breeze";

const breezeSubdomainSchema = s.nonEmptyString("Breeze church subdomain without the .breezechms.com suffix.");

const breezeFilterJsonSchema = s.record(
  "Breeze filter_json object keyed by official Breeze profile field or filter names.",
  s.anyOf("One Breeze filter_json value.", [
    s.nonEmptyString("Single Breeze filter value."),
    s.array("Multiple Breeze filter values.", s.nonEmptyString("One Breeze filter value."), { minItems: 1 }),
  ]),
);

const breezePersonSummarySchema = s.looseRequiredObject("One Breeze person record.", {
  id: s.nonEmptyString("Breeze person identifier."),
});

const breezeProfileFieldSchema = s.looseRequiredObject("One Breeze profile field record.", {
  field_id: s.nonEmptyString("Breeze profile field identifier."),
  name: s.nonEmptyString("Breeze profile field display name."),
});

const breezeProfileSectionSchema = s.looseRequiredObject("One Breeze profile section record.", {
  id: s.nonEmptyString("Breeze profile section identifier."),
  fields: s.array("Profile fields within the section.", breezeProfileFieldSchema),
});

const breezeTagSchema = s.looseRequiredObject("One Breeze tag record.", {
  id: s.nonEmptyString("Breeze tag identifier."),
  name: s.nonEmptyString("Breeze tag name."),
});

const breezeFolderSchema = s.looseRequiredObject("One Breeze tag folder record.", {
  id: s.nonEmptyString("Breeze tag folder identifier."),
  name: s.nonEmptyString("Breeze tag folder name."),
});

export const breezeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_people",
    operationType: "read",
    description: "List people from Breeze with optional details, pagination, and filter_json criteria.",
    inputSchema: s.actionInput(
      {
        subdomain: breezeSubdomainSchema,
        details: s.boolean("Whether to request the full Breeze person details payload."),
        limit: s.integer("Maximum number of Breeze people to return. Use 0 to request all records.", { minimum: 0 }),
        offset: s.integer("Number of Breeze people to skip before returning results.", { minimum: 0 }),
        filter_json: breezeFilterJsonSchema,
      },
      [],
      "Input parameters for listing Breeze people.",
    ),
    outputSchema: s.actionOutput(
      {
        people: s.array("Breeze people returned by the request.", breezePersonSummarySchema),
      },
      "People list returned by Breeze.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_person",
    operationType: "read",
    description: "Get one Breeze person by Breeze person ID.",
    inputSchema: s.actionInput(
      {
        subdomain: breezeSubdomainSchema,
        person_id: s.positiveInteger("Breeze person identifier to read."),
        details: s.boolean("Whether to request the full Breeze person details payload."),
      },
      ["person_id"],
      "Input parameters for reading one Breeze person.",
    ),
    outputSchema: s.actionOutput(
      {
        person: s.looseRequiredObject("The Breeze person record.", {
          id: s.nonEmptyString("Breeze person identifier."),
        }),
      },
      "One Breeze person returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_profile_fields",
    operationType: "read",
    description: "List Breeze profile sections and fields used to construct Breeze people filters.",
    inputSchema: s.actionInput(
      {
        subdomain: breezeSubdomainSchema,
      },
      [],
      "Input parameters for listing Breeze profile fields.",
    ),
    outputSchema: s.actionOutput(
      {
        sections: s.array("Breeze profile sections.", breezeProfileSectionSchema),
      },
      "Breeze profile sections returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List Breeze tags, optionally narrowed to one Breeze tag folder.",
    inputSchema: s.actionInput(
      {
        subdomain: breezeSubdomainSchema,
        folder_id: s.positiveInteger("Breeze tag folder identifier used to filter tags."),
      },
      [],
      "Input parameters for listing Breeze tags.",
    ),
    outputSchema: s.actionOutput(
      {
        tags: s.array("Breeze tags.", breezeTagSchema),
      },
      "Breeze tags returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tag_folders",
    operationType: "read",
    description: "List Breeze tag folders.",
    inputSchema: s.actionInput(
      {
        subdomain: breezeSubdomainSchema,
      },
      [],
      "Input parameters for listing Breeze tag folders.",
    ),
    outputSchema: s.actionOutput(
      {
        folders: s.array("Breeze tag folders.", breezeFolderSchema),
      },
      "Breeze tag folders returned by the request.",
    ),
  }),
];
