import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wufoo";
const formIdentifierSchema = s.nonEmptyString("The permanent form hash or the form title slug used by Wufoo.", {
  maxLength: 255,
});
const pageSchema = s.integer("The one-based Wufoo result page number.", { minimum: 1 });
const formLimitSchema = s.integer("The maximum number of forms to return.", { minimum: 1, maximum: 1000 });
const entryPageStartSchema = s.integer("The zero-based entry offset.", { minimum: 0 });
const entryPageSizeSchema = s.integer("The maximum number of entries to return.", { minimum: 1, maximum: 100 });
const looseResourceSchema = s.looseObject("A Wufoo resource whose fields depend on the account and form definition.");
const filterSchema = s.object("A Wufoo entry filter.", {
  fieldId: s.nonEmptyString("The Wufoo field ID to filter, such as EntryId or Field105."),
  operator: s.stringEnum("The documented Wufoo comparison operator.", [
    "Contains",
    "Does_not_contain",
    "Begins_with",
    "Ends_with",
    "Is_less_than",
    "Is_greater_than",
    "Is_on",
    "Is_before",
    "Is_after",
    "Is_not_equal_to",
    "Is_equal_to",
    "Is_not_NULL",
  ]),
  value: s.string("The value compared with the selected field."),
});
const filtersSchema = s.array("Entry filters applied in their listed order.", filterSchema, {
  minItems: 1,
  maxItems: 20,
});

export const wufooActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List Wufoo forms available to the connected API key.",
    inputSchema: s.object(
      "Pagination and optional daily-count controls for listing forms.",
      {
        page: pageSchema,
        limit: formLimitSchema,
        includeTodayCount: s.boolean("Whether each form should include its number of entries received today."),
      },
      { optional: ["page", "limit", "includeTodayCount"] },
    ),
    outputSchema: s.object("The Wufoo form list response.", {
      forms: s.array("Forms returned by Wufoo.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Retrieve one Wufoo form by its permanent hash or title slug.",
    inputSchema: s.object(
      "The form identifier and optional daily-count control.",
      {
        formIdentifier: formIdentifierSchema,
        includeTodayCount: s.boolean("Whether the form should include its number of entries received today."),
      },
      { optional: ["includeTodayCount"] },
    ),
    outputSchema: s.object("The Wufoo form response.", { form: looseResourceSchema }),
  }),
  defineProviderAction(service, {
    name: "list_form_fields",
    description: "List the field definitions for a Wufoo form.",
    inputSchema: s.object(
      "The form identifier and field metadata controls.",
      {
        formIdentifier: formIdentifierSchema,
        includeSystemFields: s.boolean("Whether Wufoo should include additional system metadata fields."),
      },
      { optional: ["includeSystemFields"] },
    ),
    outputSchema: s.object("The Wufoo field definition response.", {
      fields: s.array("Field definitions returned by Wufoo.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_entries",
    description: "List, filter, sort, and page entries for a Wufoo form.",
    inputSchema: s.object(
      "The form identifier and documented Wufoo entry query controls.",
      {
        formIdentifier: formIdentifierSchema,
        includeSystemFields: s.boolean("Whether Wufoo should include system metadata such as IP and payment status."),
        pageStart: entryPageStartSchema,
        pageSize: entryPageSizeSchema,
        sortFieldId: s.nonEmptyString("The Wufoo field ID used to sort entries."),
        sortDirection: s.stringEnum("The direction used to sort entries.", ["ASC", "DESC"]),
        match: s.stringEnum("How multiple entry filters are grouped.", ["AND", "OR"]),
        filters: filtersSchema,
      },
      {
        optional: ["includeSystemFields", "pageStart", "pageSize", "sortFieldId", "sortDirection", "match", "filters"],
      },
    ),
    outputSchema: s.object("The Wufoo entry list response.", {
      entries: s.array("Entries returned by Wufoo.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "count_entries",
    description: "Count entries for a Wufoo form, optionally using entry filters.",
    inputSchema: s.object(
      "The form identifier and optional Wufoo entry filters.",
      {
        formIdentifier: formIdentifierSchema,
        match: s.stringEnum("How multiple entry filters are grouped.", ["AND", "OR"]),
        filters: filtersSchema,
      },
      { optional: ["match", "filters"] },
    ),
    outputSchema: s.object("The normalized Wufoo entry count.", {
      count: s.integer("The number of entries matching the request.", { minimum: 0 }),
    }),
  }),
  defineProviderAction(service, {
    name: "submit_entry",
    description: "Submit JSON field values as a new entry for a Wufoo form.",
    inputSchema: s.object("The target form and its dynamic Wufoo field values.", {
      formIdentifier: formIdentifierSchema,
      fields: s.record(
        "Values keyed by Wufoo field IDs such as Field1 or Field105.",
        s.string("The string value submitted for a Wufoo field."),
      ),
    }),
    outputSchema: s.object("The Wufoo entry submission result.", {
      success: s.boolean("Whether Wufoo accepted the entry."),
      entryId: s.nullable(s.integer("The new entry ID when submission succeeds.")),
      entryLink: s.nullable(s.string("The Wufoo API link for the new entry when available.")),
      redirectUrl: s.nullable(s.string("The form redirect URL when configured.")),
      errorText: s.nullable(s.string("The general submission error when validation fails.")),
      fieldErrors: s.array(
        "Field-specific validation errors returned by Wufoo.",
        s.object("A field validation error returned by Wufoo.", {
          fieldId: s.string("The Wufoo field ID that failed validation."),
          message: s.string("The validation message returned by Wufoo."),
        }),
      ),
    }),
  }),
];
