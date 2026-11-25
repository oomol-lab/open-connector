import type { ActionDefinition } from "../../core/types.ts";

import { s, readSchemaProperties } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const formToken = s.nonEmptyString("Form token from list_forms or get_form.");
const serialNumber = s.integer("Entry serial number within the form.");
const fields = s.stringArray("Return only these field API codes; serial_number is always included.", {
  itemDescription: "Field API code.",
});

const includeLabels = s.boolean("Wrap field values with their labels; system keys remain unchanged.");
const entry = s.record(
  "Field values keyed by API code or alias. Read get_form first. Attachment values accept uploaded IDs, existing same-form URLs, or official inline base64 objects up to 5 MB; arbitrary external URLs are not new uploads. Signature and formula fields cannot be written.",
  s.unknown("Field value in the format required by its field type."),
);

const paging = {
  limit: s.integer("Page size; defaults to 50, maximum 1000.", { minimum: 1, maximum: 1000 }),
  page: s.integer(
    "Page number from 1. (page - 1) * limit must not exceed 10000. Use only one of page, next and skip.",
    { minimum: 1 },
  ),
  skip: s.integer("Deprecated row offset; prefer page. Use only one of page, next and skip.", {
    minimum: 0,
    maximum: 10000,
  }),
};

const filters = s.array(
  "Filter conditions. Connector encodes the array as query JSON. Form filters use form_name, created_at, last_entry_created_at or entries_count; entry filters use field API codes, creator_id or serial_number.",
  s.object(
    "One filter condition; allowed operators depend on the field type.",
    {
      field: s.nonEmptyString("Field API code or supported resource attribute."),
      operator: s.stringEnum("Comparison operator supported by this field.", [
        "eq",
        "ne",
        "any_in",
        "none_in",
        "between",
        "not_between",
        "null",
        "not_null",
        "gte",
        "gt",
        "lte",
        "lt",
        "like",
        "not_like",
        "within_last",
      ]),
      value: s.unknown(
        "Comparison value; between uses [min,max], within_last uses {unit,n}, and null/not_null omit value.",
      ),
      scope_attr: s.stringEnum("Use date_time only for reservation date conditions.", ["date_time"]),
      group_index: s.integer(
        "Entry filters: positive groups combine conditions with AND, negative groups with OR; groups combine with OR. Omit for creator_id and serial_number.",
      ),
    },
    { optional: ["value", "scope_attr", "group_index"] },
  ),
);

const order = s.stringEnum("Sort direction; defaults to asc.", ["asc", "desc"]);
const includeTransactions = s.boolean("Include payment statistics for forms bound to a payment account.");
const entryData = s.looseObject("Entry fields keyed by API code or alias, with system metadata.", {
  serial_number: serialNumber,
  token: s.string("Entry token."),
});

const entryOutput = s.looseRequiredObject(
  "Single-entry response; unknown upstream fields are preserved.",
  {
    form: s.string("Form token."),
    form_name: s.string("Form name."),
    entry: entryData,
    url: s.url("URL for viewing the entry in Jinshuju; absent for quick payment forms."),
    ignored_fields: s.array(
      "Submitted values not saved because of field rules or address restrictions.",
      s.looseObject("Ignored field and reason.", {
        field: s.string("Field API code."),
        reason: s.string("Reason the value was not saved."),
        message: s.string("Explanation from Jinshuju."),
      }),
    ),
  },
  { optional: ["url", "ignored_fields"] },
);

const formSummary = s.looseObject("Form summary and upstream metadata.", {
  token: s.string("Form token."),
  name: s.string("Form name."),
  entries_count: s.integer("Number of form entries."),
  folder_token: s.nullableString("Folder token, or null when not in a folder."),
});

const formOutput = s.looseObject("Form structure and optional settings; upstream fields are preserved.", {
  ...readSchemaProperties(formSummary),
  kind: s.string("Resource kind: form, table or quickpay."),
  scene: s.string("Form scene."),
  url: s.url("Official form URL; do not derive it from the token."),
  description: s.nullableString("Form description, possibly HTML."),
  fields: s.array(
    "Ordered field definitions, each keyed by its API code.",
    s.looseObject("Field definition keyed by API code."),
  ),
  setting: s.looseObject("Form settings."),
});

const folderOutput = s.looseObject("Folder returned by Jinshuju.", {
  token: s.string("Folder token."),
  name: s.string("Folder name."),
  kind: s.nullableString("Folder kind; legacy form folders may return null."),
  created_at: s.dateTime("Creation time in UTC."),
});

const paginationExclusions = {
  not: {
    anyOf: [{ required: ["page", "next"] }, { required: ["page", "skip"] }, { required: ["next", "skip"] }],
  },
};

const input = (properties: Record<string, Record<string, unknown>>, required: string[] = []) =>
  s.actionInput(properties, required, "Jinshuju action input.");

const listOutput = (item: Record<string, unknown>, cursor: Record<string, unknown>) =>
  s.looseRequiredObject("One page of results. Pass next unchanged with the same query until it is null.", {
    total: s.integer("Total matching records."),
    count: s.integer("Number of records on this page."),
    data: s.array("Records on this page.", item),
    next: cursor,
  });

const entryPath = { form_token: formToken, serial_number: serialNumber };

export const jinshujuActions: ActionDefinition[] = [
  defineProviderAction("jinshuju", {
    name: "list_forms",
    operationType: "read",
    description:
      "Find Jinshuju forms by name, filters and sorting, with pagination. Personal tokens see owned and shared forms; enterprise tokens see the account's forms.",
    inputSchema: s.object(
      "Jinshuju action input.",
      {
        ...paging,
        next: s.string("Opaque cursor from the previous form page; may be row:<offset>."),
        q: s.anyOf("Case-insensitive name search; an array matches any supplied name.", [
          s.string("Name search text."),
          s.stringArray("Alternative name searches.", { itemDescription: "Name search text." }),
        ]),
        filters,
        sort: s.array(
          "Form sort rules, encoded as query JSON.",
          s.object(
            "Form sort rule.",
            {
              field: s.stringEnum("Form attribute to sort by.", [
                "created_at",
                "last_entry_created_at",
                "entries_count",
              ]),
              order,
            },
            { optional: ["order"] },
          ),
        ),
        include_transactions: includeTransactions,
      },
      { required: [], ...paginationExclusions },
    ),
    outputSchema: listOutput(formSummary, s.nullableString("Next form cursor, or null on the last page.")),
  }),
  defineProviderAction("jinshuju", {
    name: "get_form",
    operationType: "read",
    description: "Read a Jinshuju form's structure and field API codes before querying or writing entries.",
    inputSchema: input(
      {
        form_token: formToken,
        include_analytics: s.boolean("Include available analytics on analysable fields."),
        include_theme: s.boolean("Include form theme."),
        include_field_rules: s.boolean("Include field display rules."),
        include_redirect_rules: s.boolean("Include redirect rules."),
        include_extended_attributes: s.boolean("Include source-tracking links."),
        include_exam_setting: s.boolean("Include exam settings for exam forms."),
        include_transactions: includeTransactions,
      },
      ["form_token"],
    ),
    outputSchema: formOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "copy_form",
    operationType: "write",
    description: "Copy a Jinshuju form, optionally choosing its name, folder and notification rules.",
    inputSchema: input(
      {
        form_token: formToken,
        name: s.string("New form name; omitted uses the server default."),
        folder_token: s.string("Target folder token or ID; omitted leaves the copy outside folders."),
        with_notification_rules: s.boolean(
          "Copy notification rules; requires manage permission and the same account as the source creator.",
        ),
      },
      ["form_token"],
    ),
    outputSchema: formOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "list_folders",
    operationType: "read",
    description: "List manageable Jinshuju folders; an enterprise token returns the account owner's folders.",
    inputSchema: s.object(
      "Jinshuju action input.",
      {
        limit: s.integer("Page size; defaults to 50, maximum 100.", { minimum: 1, maximum: 100 }),
        page: paging.page,
        next: s.integer("Next folder row offset from the previous response.", { minimum: 0 }),
      },
      { required: [], ...paginationExclusions },
    ),
    outputSchema: listOutput(folderOutput, s.nullableInteger("Next row offset, or null on the last page.")),
  }),
  defineProviderAction("jinshuju", {
    name: "create_folder",
    operationType: "write",
    description: "Create a Jinshuju folder for forms or tables.",
    inputSchema: input(
      {
        name: s.nonEmptyString("Folder name."),
        kind: s.nullable(s.stringEnum("Folder kind; defaults to form.", ["form", "table"])),
      },
      ["name"],
    ),
    outputSchema: folderOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "move_form_to_folder",
    operationType: "write",
    description:
      "Move a Jinshuju form into a folder, or pass null to remove it from its folder for all collaborators. Supply original_folder_token on retries to avoid moving it out of a later folder.",
    inputSchema: input(
      {
        form_token: formToken,
        folder_token: s.nullableString("Target folder token; null moves the form out of folders."),
        original_folder_token: s.string("Source folder token; defaults to the current folder. Supply it on retries."),
      },
      ["form_token", "folder_token"],
    ),
    outputSchema: s.looseRequiredObject("Folder move result.", {
      form_token: formToken,
      folder_token: s.nullableString("Folder token after moving, or null."),
    }),
  }),
  defineProviderAction("jinshuju", {
    name: "list_entries",
    operationType: "read",
    description:
      "Query Jinshuju form entries with field selection, filters, sorting and pagination. Preserve the query when continuing with next.",
    inputSchema: s.object(
      "Jinshuju action input.",
      {
        form_token: formToken,
        ...paging,
        next: { description: "Entry cursor from the previous page; preserve its value.", type: ["integer", "string"] },
        fields,
        filters,
        include_labels: includeLabels,
        keyword: s.string(
          "Search all searchable fields; unsupported above 99999 entries without analytics unless creator_id restricts the submitter.",
          { maxLength: 200 },
        ),
        created_at: s.string(
          "Entries created at or after this Beijing time, e.g. 2024-01-01 08:00:00; ignored with filters or keyword.",
        ),
        sort: s.array(
          "Entry sort rules, encoded as query JSON.",
          s.object(
            "Entry sort rule.",
            { api_code: s.string("Sortable field API code."), order },
            { optional: ["order"] },
          ),
        ),
      },
      { required: ["form_token"], ...paginationExclusions },
    ),
    outputSchema: listOutput(entryData, s.nullableInteger("Next entry cursor, or null on the last page.")),
  }),
  defineProviderAction("jinshuju", {
    name: "get_entry",
    operationType: "read",
    description: "Read one Jinshuju entry by its form token and serial number.",
    inputSchema: input({ ...entryPath, fields, include_labels: includeLabels }, ["form_token", "serial_number"]),
    outputSchema: entryOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "create_entry",
    operationType: "write",
    description:
      "Submit one Jinshuju entry. Field validation and display rules apply; inspect ignored_fields for values not saved.",
    inputSchema: input({ form_token: formToken, entry }, ["form_token", "entry"]),
    outputSchema: entryOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "batch_create_entries",
    operationType: "write",
    description:
      "Create up to 200 Jinshuju entries. A partial success returns created_count and per-row errors; all rows failing produces an error with those details. Batch creation does not run single-create callbacks.",
    inputSchema: input(
      {
        form_token: formToken,
        entries: s.array("Entries to create, in result-index order.", entry, {
          minItems: 1,
          maxItems: 200,
        }),
      },
      ["form_token", "entries"],
    ),
    outputSchema: s.looseRequiredObject("Batch creation results, including partial failures.", {
      created_count: s.integer("Number of entries created."),
      errors: s.array(
        "Failed rows; do not retry successful rows.",
        s.looseRequiredObject("One failed row.", {
          index: s.integer("Zero-based index in the submitted array."),
          reason: s.string("Failure reason."),
        }),
      ),
      ignored_fields: s.array(
        "Values ignored on successfully created rows.",
        s.looseObject("Ignored field with its input row index.", {
          index: s.integer("Zero-based index in the submitted array."),
          field: s.string("Field API code."),
          reason: s.string("Reason the value was not saved."),
          message: s.string("Explanation from Jinshuju."),
        }),
      ),
    }),
  }),
  defineProviderAction("jinshuju", {
    name: "update_entry",
    operationType: "write",
    description:
      "Partially update an entry using PATCH. Omitted fields keep their values. An attachment field replaces the whole set; include existing URLs or IDs to retain those files.",
    inputSchema: input({ ...entryPath, entry }, ["form_token", "serial_number", "entry"]),
    outputSchema: entryOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "replace_entry",
    operationType: "write",
    description:
      "Replace an entry using PUT. Writable fields omitted from entry are cleared. Use update_entry for a partial update.",
    inputSchema: input({ ...entryPath, entry }, ["form_token", "serial_number", "entry"]),
    outputSchema: entryOutput,
  }),
  defineProviderAction("jinshuju", {
    name: "delete_entry",
    operationType: "destructive",
    description: "Delete one Jinshuju form entry by serial number.",
    inputSchema: input(entryPath, ["form_token", "serial_number"]),
    outputSchema: s.looseRequiredObject("Deleted entry reference.", {
      serial_number: serialNumber,
    }),
  }),
  defineProviderAction("jinshuju", {
    name: "get_current_user",
    operationType: "read",
    description: "Read the user behind the token; an enterprise token returns the account owner.",
    inputSchema: input({}),
    outputSchema: s.looseObject("Current user profile.", {
      id: s.string("User ID."),
      name: s.nullableString("Display name."),
      email: s.nullableString("Bound email, or null."),
      mobile: s.nullableString("Bound mobile number, or null."),
      role: s.string("Role in the account."),
      billing_account_id: s.string("Account ID."),
      created_at: s.dateTime("Creation time in UTC."),
    }),
  }),
];
