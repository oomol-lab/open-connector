import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ortto";

const orttoFieldValueSchema = s.unknown(
  "A value for an Ortto field ID. Ortto field values may be strings, numbers, booleans, nulls, arrays, or nested objects depending on the field type.",
);
const orttoFieldsSchema = s.record(
  "Ortto field ID/value pairs, such as str::email or str:cm:custom-field.",
  orttoFieldValueSchema,
);
const orttoLooseFilterSchema = s.looseObject(
  "An Ortto filter object copied from the Ortto app or built according to the Ortto person/get filter documentation.",
);
const orttoLocationSchema = s.looseObject(
  "Ortto location data for a person, such as source_ip or address/custom location fields.",
);
const orttoPersonMergeRecordSchema = s.looseRequiredObject(
  "A person record to create or update in Ortto.",
  {
    fields: orttoFieldsSchema,
    location: orttoLocationSchema,
    tags: s.stringArray("Tags to apply to this person.", {
      itemDescription: "A tag name.",
    }),
    unset_tags: s.stringArray("Tags to remove from this person.", {
      itemDescription: "A tag name.",
    }),
    clear_fields: s.record(
      "Person fields whose existing values should be cleared when supported by the selected merge strategy.",
      s.boolean("Whether to clear this field."),
    ),
  },
  { optional: ["location", "tags", "unset_tags", "clear_fields"] },
);
const orttoRawPayloadSchema = s.looseObject("The raw Ortto API response payload.");
const orttoContactSchema = s.looseObject(
  "An Ortto contact object as returned by the API, including id, fields, and any associated account data.",
);
const orttoPeopleListOutputSchema = s.actionOutput(
  {
    contacts: s.array("Contacts returned by Ortto.", orttoContactSchema),
    meta: s.nullable(s.looseObject("Ortto metadata for the request, including totals when returned.")),
    offset: s.nullableInteger("The offset used by Ortto for this response."),
    next_offset: s.nullableInteger("The offset for the next page when returned by Ortto."),
    cursor_id: s.nullableString("The cursor ID for fetching the next page when returned."),
    has_more: s.nullableBoolean("Whether Ortto reported another page of contacts."),
    raw: orttoRawPayloadSchema,
  },
  "The normalized Ortto people retrieval result.",
);
const orttoMergePeopleOutputSchema = s.actionOutput(
  {
    accepted: s.boolean("Whether Ortto accepted the merge request."),
    contacts: s.array("Contacts returned by Ortto when the response includes contact records.", orttoContactSchema),
    raw: orttoRawPayloadSchema,
  },
  "The normalized Ortto merge people result.",
);

export type OrttoActionName = "list_people" | "get_people_by_ids" | "merge_people";

export const orttoActions: ProviderActionDefinition<OrttoActionName>[] = [
  defineProviderAction(service, {
    name: "list_people",
    description:
      "Retrieve people from Ortto's customer data platform with optional fields, filters, pagination, and sorting.",
    inputSchema: s.actionInput(
      {
        limit: s.integer("The number of people to return. Ortto allows 1 to 500.", {
          minimum: 1,
          maximum: 500,
        }),
        offset: s.nonNegativeInteger("The offset for offset-based pagination."),
        cursor_id: s.nonEmptyString("The cursor ID returned by the previous Ortto response."),
        fields: s.stringArray("Ortto person field IDs to return for each contact.", {
          maxItems: 150,
          itemDescription: "An Ortto person field ID.",
        }),
        q: s.nonEmptyString("A text search query for matching people."),
        type: s.stringEnum("The Ortto person collection to query.", ["", "archived"]),
        sort_order: s.stringEnum("Sort direction for the selected sort_by_field_id.", ["asc", "desc"]),
        sort_by_field_id: s.nonEmptyString("The Ortto person field ID to sort by."),
        filter: orttoLooseFilterSchema,
      },
      [],
      "Input parameters for retrieving people from Ortto.",
    ),
    outputSchema: orttoPeopleListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_people_by_ids",
    description: "Retrieve Ortto contacts by their contact IDs and return the requested fields.",
    inputSchema: s.actionInput(
      {
        contact_ids: s.stringArray("Ortto contact IDs to retrieve.", {
          minItems: 1,
          itemDescription: "An Ortto contact ID.",
        }),
        fields: s.stringArray("Ortto person field IDs to return for each contact.", {
          maxItems: 150,
          itemDescription: "An Ortto person field ID.",
        }),
      },
      ["contact_ids"],
      "Input parameters for retrieving Ortto people by contact IDs.",
    ),
    outputSchema: orttoPeopleListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "merge_people",
    description:
      "Create or update one or more Ortto people using Ortto's person/merge endpoint and merge strategy options.",
    inputSchema: s.actionInput(
      {
        people: s.array(
          "People to create or update. Ortto allows 1 to 100 people per request.",
          orttoPersonMergeRecordSchema,
          { minItems: 1, maxItems: 100 },
        ),
        async: s.boolean("Whether Ortto should queue the merge asynchronously."),
        merge_by: s.stringArray("Ortto person field IDs used to identify existing people.", {
          minItems: 1,
          maxItems: 3,
          itemDescription: "An Ortto person field ID.",
        }),
        merge_strategy: s.anyOf("Ortto merge strategy: 1 append only, 2 overwrite existing, or 3 ignore existing.", [
          s.literal(1, { description: "Append only." }),
          s.literal(2, { description: "Overwrite existing." }),
          s.literal(3, { description: "Ignore existing." }),
        ]),
        find_strategy: s.anyOf("Ortto find strategy: 0 any, 1 next only if previous empty, or 2 all.", [
          s.literal(0, { description: "Any merge key match." }),
          s.literal(1, { description: "Next key only if the previous key is empty." }),
          s.literal(2, { description: "All merge keys must match." }),
        ]),
        skip_non_existing: s.boolean("Whether to update only existing contacts and skip creating new contacts."),
        merge_by_alt_fields: s.looseObject("Optional alternate field mapping for Ortto merge_by identifiers."),
        suppression_list_field_id: s.nonEmptyString(
          "Ortto field ID used to compare new contacts against the email suppression list.",
        ),
      },
      ["people"],
      "Input parameters for creating or updating people in Ortto.",
    ),
    outputSchema: orttoMergePeopleOutputSchema,
  }),
];
