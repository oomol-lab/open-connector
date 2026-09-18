import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { extendObject, typeUnion } from "./schemas.ts";
import {
  additionalFiltersInputField,
  correspondentSchema,
  customFieldDataTypeValues,
  customFieldSchema,
  deletedOutputSchema,
  documentTypeSchema,
  fullPermsInputField,
  idArrayField,
  idField,
  integerEnum,
  matchingAlgorithmDescription,
  matchingInputFields,
  ownerInputField,
  pageInputFields,
  paginatedOutputSchema,
  resultOutputSchema,
  savedViewSchema,
  setPermissionsInputSchema,
  storagePathSchema,
  tagSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const idFilterInputFields = {
  id: idField("Return only the object with this id."),
  id__in: idArrayField("Return only objects whose id is in this list.", "An object id."),
};

function charFilterInputFields(field: string, label: string): Record<string, JsonSchema> {
  return {
    [`${field}__icontains`]: s.string(`Case-insensitive substring match on the ${label}.`),
    [`${field}__iexact`]: s.string(`Case-insensitive exact match on the ${label}.`),
    [`${field}__istartswith`]: s.string(`Case-insensitive prefix match on the ${label}.`),
    [`${field}__iendswith`]: s.string(`Case-insensitive suffix match on the ${label}.`),
  };
}

const nameFilterInputFields = {
  ...idFilterInputFields,
  ...charFilterInputFields("name", "name"),
};

function orderingInputField(fields: readonly string[]): JsonSchema {
  return s.nonEmptyString(
    `Field to order by, prefixed with - for descending order, for example -${fields[0]}. Accepted fields: ${fields.join(", ")}.`,
  );
}

function listInputSchema(
  description: string,
  orderingFields: readonly string[],
  filters: Record<string, JsonSchema>,
  options: { fullPerms?: boolean } = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    ...filters,
    ...(options.fullPerms === false ? {} : { full_perms: fullPermsInputField }),
    page: pageInputFields.page,
    page_size: pageInputFields.page_size,
    ordering: orderingInputField(orderingFields),
    additional_filters: additionalFiltersInputField,
  };
  return s.object(description, properties, { optional: Object.keys(properties) });
}

function getInputSchema(description: string, idDescription: string, options: { fullPerms?: boolean } = {}): JsonSchema {
  return s.object(
    description,
    {
      id: idField(idDescription),
      ...(options.fullPerms === false ? {} : { full_perms: fullPermsInputField }),
    },
    { optional: ["full_perms"] },
  );
}

function deleteInputSchema(description: string, idDescription: string): JsonSchema {
  return s.object(description, { id: idField(idDescription) });
}

function createInputSchema(
  description: string,
  fields: Record<string, JsonSchema>,
  required: readonly string[],
): JsonSchema {
  return s.object(description, fields, {
    optional: Object.keys(fields).filter((key) => !required.includes(key)),
  });
}

function updateInputSchema(description: string, idDescription: string, fields: Record<string, JsonSchema>): JsonSchema {
  return s.object(description, { id: idField(idDescription), ...fields }, { optional: Object.keys(fields) });
}

const ownedObjectInputFields = {
  owner: s.describe(
    ownerInputField,
    "Id of the user that owns the object, or null to make it unowned. On create it defaults to the connected user. Only the current owner or a superuser may change it.",
  ),
  set_permissions: setPermissionsInputSchema,
};

const matchingWriteInputFields = {
  match: matchingInputFields.match,
  matching_algorithm: s.describe(
    matchingInputFields.matching_algorithm,
    `${matchingAlgorithmDescription} Defaults to 1 (any word); 6 relies on the trained classifier and ignores match; 4 requires match to be a valid regular expression.`,
  ),
  is_insensitive: matchingInputFields.is_insensitive,
};

function nameInputField(label: string): JsonSchema {
  return s.nonEmptyString(
    `The ${label} name, at most 128 characters. Must be unique per owner; Paperless-ngx rejects duplicates with "Object violates owner / name unique constraint".`,
  );
}

const tagOrderingFields = ["name", "color", "matching_algorithm", "match", "document_count"];

const tagInputFields = {
  name: nameInputField("tag"),
  color: s.string(
    "Hex color for the tag such as #a6cee3 (a # followed by six hex digits). Defaults to #a6cee3; the contrasting text_color is derived automatically.",
    { pattern: "^#[0-9a-fA-F]{6}$" },
  ),
  ...matchingWriteInputFields,
  is_inbox_tag: s.boolean("Whether newly consumed documents automatically receive this tag. Defaults to false."),
  parent: s.nullable(
    idField(
      "Id of the parent tag for hierarchical tags, or null for a root tag. A tag cannot be its own ancestor and nesting is limited to 5 levels. Moving a tag under a new parent also adds the new ancestor tags to documents that carry it.",
    ),
  ),
  ...ownedObjectInputFields,
};

const tagListOutputSchema = paginatedOutputSchema("A page of tags.", tagSchema, {
  display_count: s.integer(
    "Number of tags shown when nested children are expanded, including the matched tags' descendants; equal to count when no matched tag has children.",
  ),
});

const tagActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description:
      "List tags visible to the connected user with their document counts and nested children. Supports id and case-insensitive name filters, the is_root flag for top-level tags only, ordering and pagination. Requires the view_tag permission.",
    requiredScopes: [],
    inputSchema: listInputSchema("Tag list filters.", tagOrderingFields, {
      ...nameFilterInputFields,
      is_root: s.boolean(
        "When true, return only root tags without a parent; when false, only nested tags. Omit for all tags.",
      ),
    }),
    outputSchema: tagListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tag",
    operationType: "read",
    description:
      "Get one tag by id, including its document count, parent and nested children. Requires the view_tag permission on the tag.",
    requiredScopes: [],
    inputSchema: getInputSchema("The tag to read.", "Id of the tag."),
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "create_tag",
    operationType: "write",
    description:
      "Create a tag with an optional color, matching rule, inbox flag and parent tag. The owner defaults to the connected user. Requires the add_tag permission.",
    requiredScopes: [],
    inputSchema: createInputSchema("The tag to create.", tagInputFields, ["name"]),
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "update_tag",
    operationType: "write",
    description:
      "Partially update a tag; only the provided fields are changed and null clears nullable fields such as parent. Requires the change_tag permission on the tag; changing owner or set_permissions additionally requires being the owner or a superuser.",
    requiredScopes: [],
    inputSchema: updateInputSchema("The tag fields to update.", "Id of the tag to update.", tagInputFields),
    outputSchema: tagSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    operationType: "destructive",
    description:
      "Delete a tag. Documents keep their other tags; child tags are re-parented by the tree model. Requires the delete_tag permission on the tag.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The tag to delete.", "Id of the tag to delete."),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted tag."),
  }),
];

const correspondentOrderingFields = ["name", "matching_algorithm", "match", "document_count", "last_correspondence"];

const correspondentInputFields = {
  name: nameInputField("correspondent"),
  ...matchingWriteInputFields,
  ...ownedObjectInputFields,
};

const correspondentActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_correspondents",
    operationType: "read",
    description:
      "List correspondents visible to the connected user with their document counts. Supports id and case-insensitive name filters, ordering and pagination; set last_correspondence to true to include the date of the newest document per correspondent. Requires the view_correspondent permission.",
    requiredScopes: [],
    inputSchema: listInputSchema("Correspondent list filters.", correspondentOrderingFields, {
      ...nameFilterInputFields,
      last_correspondence: s.boolean(
        "When true, annotate each correspondent with last_correspondence, the creation date of its newest visible document. Defaults to false; the field is then absent from list results.",
      ),
    }),
    outputSchema: paginatedOutputSchema("A page of correspondents.", correspondentSchema),
  }),
  defineProviderAction(service, {
    name: "get_correspondent",
    operationType: "read",
    description:
      "Get one correspondent by id, including its document count and last_correspondence date. Requires the view_correspondent permission on the correspondent.",
    requiredScopes: [],
    inputSchema: getInputSchema("The correspondent to read.", "Id of the correspondent."),
    outputSchema: correspondentSchema,
  }),
  defineProviderAction(service, {
    name: "create_correspondent",
    operationType: "write",
    description:
      "Create a correspondent with an optional matching rule. The owner defaults to the connected user. Requires the add_correspondent permission.",
    requiredScopes: [],
    inputSchema: createInputSchema("The correspondent to create.", correspondentInputFields, ["name"]),
    outputSchema: correspondentSchema,
  }),
  defineProviderAction(service, {
    name: "update_correspondent",
    operationType: "write",
    description:
      "Partially update a correspondent; only the provided fields are changed. Requires the change_correspondent permission on the correspondent; changing owner or set_permissions additionally requires being the owner or a superuser.",
    requiredScopes: [],
    inputSchema: updateInputSchema(
      "The correspondent fields to update.",
      "Id of the correspondent to update.",
      correspondentInputFields,
    ),
    outputSchema: correspondentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_correspondent",
    operationType: "destructive",
    description:
      "Delete a correspondent. Documents that used it keep no correspondent. Requires the delete_correspondent permission on the correspondent.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The correspondent to delete.", "Id of the correspondent to delete."),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted correspondent."),
  }),
];

const documentTypeOrderingFields = ["name", "matching_algorithm", "match", "document_count"];

const documentTypeInputFields = {
  name: nameInputField("document type"),
  ...matchingWriteInputFields,
  ...ownedObjectInputFields,
};

const documentTypeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_document_types",
    operationType: "read",
    description:
      "List document types visible to the connected user with their document counts. Supports id and case-insensitive name filters, ordering and pagination. Requires the view_documenttype permission.",
    requiredScopes: [],
    inputSchema: listInputSchema("Document type list filters.", documentTypeOrderingFields, nameFilterInputFields),
    outputSchema: paginatedOutputSchema("A page of document types.", documentTypeSchema),
  }),
  defineProviderAction(service, {
    name: "get_document_type",
    operationType: "read",
    description:
      "Get one document type by id, including its document count. Requires the view_documenttype permission on the document type.",
    requiredScopes: [],
    inputSchema: getInputSchema("The document type to read.", "Id of the document type."),
    outputSchema: documentTypeSchema,
  }),
  defineProviderAction(service, {
    name: "create_document_type",
    operationType: "write",
    description:
      "Create a document type with an optional matching rule. The owner defaults to the connected user. Requires the add_documenttype permission.",
    requiredScopes: [],
    inputSchema: createInputSchema("The document type to create.", documentTypeInputFields, ["name"]),
    outputSchema: documentTypeSchema,
  }),
  defineProviderAction(service, {
    name: "update_document_type",
    operationType: "write",
    description:
      "Partially update a document type; only the provided fields are changed. Requires the change_documenttype permission on the document type; changing owner or set_permissions additionally requires being the owner or a superuser.",
    requiredScopes: [],
    inputSchema: updateInputSchema(
      "The document type fields to update.",
      "Id of the document type to update.",
      documentTypeInputFields,
    ),
    outputSchema: documentTypeSchema,
  }),
  defineProviderAction(service, {
    name: "delete_document_type",
    operationType: "destructive",
    description:
      "Delete a document type. Documents that used it keep no document type. Requires the delete_documenttype permission on the document type.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The document type to delete.", "Id of the document type to delete."),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted document type."),
  }),
];

const storagePathOrderingFields = ["name", "path", "matching_algorithm", "match", "document_count"];

const storagePathTemplateDescription =
  "Filename template rendered with Jinja placeholders such as {{ created_year }}/{{ correspondent }}/{{ title }}; legacy {created_year} format strings are converted automatically. Paperless-ngx validates the template by rendering it against sample values and rejects unknown variables.";

const storagePathInputFields = {
  name: nameInputField("storage path"),
  path: s.nonEmptyString(
    `${storagePathTemplateDescription} Changing it moves every document using the path in the background.`,
  ),
  ...matchingWriteInputFields,
  ...ownedObjectInputFields,
};

const storagePathActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_storage_paths",
    operationType: "read",
    description:
      "List storage paths visible to the connected user with their document counts. Supports id and case-insensitive name and path filters, ordering and pagination. Requires the view_storagepath permission.",
    requiredScopes: [],
    inputSchema: listInputSchema("Storage path list filters.", storagePathOrderingFields, {
      ...nameFilterInputFields,
      ...charFilterInputFields("path", "path template"),
    }),
    outputSchema: paginatedOutputSchema("A page of storage paths.", storagePathSchema),
  }),
  defineProviderAction(service, {
    name: "get_storage_path",
    operationType: "read",
    description:
      "Get one storage path by id, including its document count. Requires the view_storagepath permission on the storage path.",
    requiredScopes: [],
    inputSchema: getInputSchema("The storage path to read.", "Id of the storage path."),
    outputSchema: storagePathSchema,
  }),
  defineProviderAction(service, {
    name: "create_storage_path",
    operationType: "write",
    description:
      "Create a storage path from a filename template and an optional matching rule. Use test_storage_path first to preview how the template renders. The owner defaults to the connected user. Requires the add_storagepath permission.",
    requiredScopes: [],
    inputSchema: createInputSchema("The storage path to create.", storagePathInputFields, ["name", "path"]),
    outputSchema: storagePathSchema,
  }),
  defineProviderAction(service, {
    name: "update_storage_path",
    operationType: "write",
    description:
      "Partially update a storage path; only the provided fields are changed. Changing path schedules a background task that renames and moves every document using the storage path. Requires the change_storagepath permission on the storage path; changing owner or set_permissions additionally requires being the owner or a superuser.",
    requiredScopes: [],
    inputSchema: updateInputSchema(
      "The storage path fields to update.",
      "Id of the storage path to update.",
      storagePathInputFields,
    ),
    outputSchema: storagePathSchema,
  }),
  defineProviderAction(service, {
    name: "delete_storage_path",
    operationType: "destructive",
    description:
      "Delete a storage path. Documents that used it fall back to the default filename format and are moved in the background. Requires the delete_storagepath permission on the storage path.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The storage path to delete.", "Id of the storage path to delete."),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted storage path."),
  }),
  defineProviderAction(service, {
    name: "test_storage_path",
    operationType: "read",
    description:
      "Render a storage path template against an existing document to preview the resulting file path, including the document's file extension, without saving anything. Only requires that the document is visible to the connected user; invalid templates are rejected with a validation error.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The template and sample document.", {
      path: s.nonEmptyString(storagePathTemplateDescription),
      document: idField("Id of a document visible to the connected user to render the template with."),
    }),
    outputSchema: s.requiredObject("The rendered path.", {
      result: s.nullableString(
        "The file path the template produces for the document, relative to the media directory and including the file extension, or null when the template renders to nothing.",
      ),
    }),
  }),
];

const customFieldOrderingFields = ["name", "id", "data_type", "document_count"];

const customFieldDataTypeDescription =
  "Value type of the field: string, url, date, boolean, integer, float, monetary, documentlink, select or longtext.";

const selectOptionInputSchema = s.object(
  "A select option.",
  {
    id: s.nullableString(
      "Stable option id. Omit it or pass null for new options and Paperless-ngx generates one; keep the existing id of current options so documents referencing them keep their value.",
    ),
    label: s.nonEmptyString("Option label shown to users."),
  },
  { optional: ["id"] },
);

const customFieldExtraDataInputSchema = s.object(
  "Type-specific settings.",
  {
    select_options: s.array(
      "Options of a select field. Required and non-empty whenever the field is (or becomes) a select field, and it must always list every option, including existing ones with their ids, because the list replaces the stored options.",
      selectOptionInputSchema,
      { minItems: 1 },
    ),
    default_currency: s.nullableString(
      "Default ISO 4217 currency code (exactly three letters, or empty) for monetary fields, or null for the instance default.",
    ),
  },
  { optional: ["select_options", "default_currency"] },
);

const customFieldInputFields = {
  name: s.nonEmptyString("The custom field name, at most 128 characters and unique across the instance."),
  data_type: s.stringEnum(customFieldDataTypeDescription, customFieldDataTypeValues),
  extra_data: s.nullable(customFieldExtraDataInputSchema),
};

const customFieldOutputSchema = extendObject(
  "A Paperless-ngx custom field.",
  customFieldSchema,
  {
    extra_data: s.nullable(
      s.looseObject("Type-specific settings, or null.", {
        select_options: s.array(
          "Options of a select field.",
          s.looseObject("A select option.", {
            id: s.string("Stable option id referenced by document values."),
            label: s.string("Option label shown to users."),
          }),
        ),
        default_currency: s.nullableString("Default ISO 4217 currency code for monetary fields, or null."),
      }),
    ),
  },
  { optional: ["extra_data"] },
);

const customFieldActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_custom_fields",
    operationType: "read",
    description:
      "List custom field definitions with the number of documents using each one. Supports id and case-insensitive name filters, ordering and pagination. Custom fields carry no object-level permissions; requires the view_customfield permission.",
    requiredScopes: [],
    inputSchema: listInputSchema("Custom field list filters.", customFieldOrderingFields, nameFilterInputFields, {
      fullPerms: false,
    }),
    outputSchema: paginatedOutputSchema("A page of custom fields.", customFieldOutputSchema),
  }),
  defineProviderAction(service, {
    name: "get_custom_field",
    operationType: "read",
    description:
      "Get one custom field definition by id, including its select options or default currency and the number of documents using it. Requires the view_customfield permission.",
    requiredScopes: [],
    inputSchema: getInputSchema("The custom field to read.", "Id of the custom field.", {
      fullPerms: false,
    }),
    outputSchema: customFieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_custom_field",
    operationType: "write",
    description:
      "Create a custom field definition. Select fields need extra_data.select_options with at least one labelled option (ids are generated), monetary fields may set extra_data.default_currency. Requires the add_customfield permission.",
    requiredScopes: [],
    inputSchema: createInputSchema("The custom field to create.", customFieldInputFields, ["name", "data_type"]),
    outputSchema: customFieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_custom_field",
    operationType: "write",
    description:
      "Partially update a custom field definition; only the provided fields are changed. For select fields extra_data.select_options must be sent in full on every update, even when only renaming the field, keeping existing option ids so document values survive. Changing data_type of a field that already has values is not supported by the Paperless-ngx UI and can make stored values unreadable. Requires the change_customfield permission.",
    requiredScopes: [],
    inputSchema: updateInputSchema(
      "The custom field fields to update.",
      "Id of the custom field to update.",
      customFieldInputFields,
    ),
    outputSchema: customFieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_custom_field",
    operationType: "destructive",
    description:
      "Delete a custom field definition together with every value stored for it on documents. Requires the delete_customfield permission.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The custom field to delete.", "Id of the custom field to delete."),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted custom field."),
  }),
];

const savedViewOrderingFields = ["name"];

const savedViewIconValues = [
  "archive",
  "bank",
  "basket",
  "bell",
  "bookmark",
  "boxes",
  "briefcase",
  "building",
  "calculator",
  "calendar",
  "camera",
  "card-checklist",
  "cash",
  "chat-left-text",
  "check-circle",
  "clipboard",
  "clock-history",
  "credit-card",
  "download",
  "envelope",
  "exclamation-triangle",
  "file-earmark",
  "file-earmark-check",
  "file-earmark-lock",
  "file-earmark-medical",
  "file-earmark-person",
  "file-earmark-spreadsheet",
  "file-text",
  "files",
  "folder",
  "funnel",
  "gear",
  "globe2",
  "hash",
  "heart",
  "house",
  "inbox",
  "journals",
  "list-task",
  "newspaper",
  "paperclip",
  "people",
  "person",
  "printer",
  "receipt",
  "safe",
  "search",
  "send",
  "shop",
  "stack",
  "stars",
  "tag",
  "tags",
  "telephone",
  "truck",
  "upc-scan",
  "wallet2",
];

const filterRuleTypeValues = Array.from({ length: 50 }, (_, index) => index);

const filterRuleTypeDescription =
  "Numeric filter rule type: 0 title contains, 1 content contains, 2 ASN is, 3 correspondent is, 4 document type is, 5 is in inbox, 6 has tag, 7 has any tag, 8 created before, 9 created after, 10 created year is, 11 created month is, 12 created day is, 13 added before, 14 added after, 15 modified before, 16 modified after, 17 does not have tag, 18 does not have ASN, 19 title or content contains, 20 fulltext query, 21 more like this, 22 has tags in, 23 ASN greater than, 24 ASN less than, 25 storage path is, 26 has correspondent in, 27 does not have correspondent in, 28 has document type in, 29 does not have document type in, 30 has storage path in, 31 does not have storage path in, 32 owner is, 33 has owner in, 34 does not have owner, 35 does not have owner in, 36 has custom field value, 37 is shared by me, 38 has custom fields, 39 has custom field in, 40 does not have custom field in, 41 does not have custom field, 42 custom fields query, 43 created to, 44 created from, 45 added to, 46 added from, 47 mime type is, 48 simple title search, 49 simple text search.";

const filterRuleInputSchema = s.object(
  "A saved view filter rule.",
  {
    rule_type: integerEnum(filterRuleTypeDescription, filterRuleTypeValues),
    value: s.nullableString(
      "Rule value as a string (an object id, a date as YYYY-MM-DD, a search term or a boolean as true/false), at most 255 characters, or null for rules that take no value.",
    ),
  },
  { optional: ["value"] },
);

const savedViewInputFields = {
  name: s.nonEmptyString("The saved view name, at most 128 characters."),
  icon: s.stringEnum(
    "Icon shown next to the view in the sidebar, one of the Bootstrap icon names accepted by Paperless-ngx. Defaults to funnel.",
    savedViewIconValues,
  ),
  sort_field: s.nullableString(
    "Document field the view sorts by, such as created, added, modified, title, correspondent__name, document_type__name, archive_serial_number, num_notes, owner, page_count or custom_field_<id>, or null for the default order.",
  ),
  sort_reverse: s.boolean("Whether to sort in descending order. Defaults to false."),
  filter_rules: s.array(
    "Filter rules that define which documents the view shows. On update the list replaces all existing rules.",
    filterRuleInputSchema,
  ),
  page_size: s.nullable(
    s.positiveInteger("Documents per page when displaying the view, or null for the user's default."),
  ),
  display_mode: s.nullable(
    s.stringEnum("Display mode: table, smallCards or largeCards; null uses the user's default.", [
      "table",
      "smallCards",
      "largeCards",
    ]),
  ),
  display_fields: s.nullable(
    s.array(
      "Columns or fields shown for each document: title, created, added, tag, correspondent, documenttype, storagepath, note, owner, shared, asn, pagecount or custom_field_<id> for an existing custom field. Null (or an empty list on update) restores the default set.",
      s.string("A display field name."),
    ),
  ),
  ...ownedObjectInputFields,
};

const savedViewActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_saved_views",
    operationType: "read",
    description:
      "List saved document views visible to the connected user with their filter rules and display settings. Only ordering by name and pagination are supported; there are no field filters. Requires the view_savedview permission.",
    requiredScopes: [],
    inputSchema: listInputSchema("Saved view list options.", savedViewOrderingFields, {}),
    outputSchema: paginatedOutputSchema("A page of saved views.", savedViewSchema),
  }),
  defineProviderAction(service, {
    name: "get_saved_view",
    operationType: "read",
    description:
      "Get one saved view by id with its filter rules and display settings. Requires the view_savedview permission on the view.",
    requiredScopes: [],
    inputSchema: getInputSchema("The saved view to read.", "Id of the saved view."),
    outputSchema: savedViewSchema,
  }),
  defineProviderAction(service, {
    name: "create_saved_view",
    operationType: "write",
    description:
      "Create a saved document view from a name and a list of filter rules, optionally with sort order, page size, display mode and display fields. Dashboard and sidebar visibility are user preferences stored through update_ui_settings, not view fields. The owner defaults to the connected user. Requires the add_savedview permission.",
    requiredScopes: [],
    inputSchema: createInputSchema("The saved view to create.", savedViewInputFields, ["name", "filter_rules"]),
    outputSchema: savedViewSchema,
  }),
  defineProviderAction(service, {
    name: "update_saved_view",
    operationType: "write",
    description:
      "Partially update a saved view; only the provided fields are changed and filter_rules, when given, replaces the whole rule list. Requires the change_savedview permission on the view; changing owner or set_permissions additionally requires being the owner or a superuser.",
    requiredScopes: [],
    inputSchema: updateInputSchema(
      "The saved view fields to update.",
      "Id of the saved view to update.",
      savedViewInputFields,
    ),
    outputSchema: savedViewSchema,
  }),
  defineProviderAction(service, {
    name: "delete_saved_view",
    operationType: "destructive",
    description:
      "Delete a saved view together with its filter rules. Requires the delete_savedview permission on the view.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The saved view to delete.", "Id of the saved view to delete."),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted saved view."),
  }),
];

const bulkEditObjectTypeValues = ["tags", "correspondents", "document_types", "storage_paths"];

const bulkEditObjectsInputSchema = s.object(
  "The bulk object operation.",
  {
    object_type: s.stringEnum(
      "Type of the objects to edit: tags, correspondents, document_types or storage_paths.",
      bulkEditObjectTypeValues,
    ),
    operation: s.stringEnum(
      "Operation to perform: set_permissions rewrites the owner and/or object-level permissions, delete removes the objects.",
      ["set_permissions", "delete"],
    ),
    objects: idArrayField(
      "Ids of the objects to edit. Required unless all is true; every id must exist and must not repeat.",
      "An object id.",
    ),
    all: s.boolean(
      "When true, operate on every object of object_type that the connected user may change (or delete) and that matches filters, instead of the objects list; for tags this also includes the editable descendants of matched tags. Defaults to false.",
    ),
    filters: s.record(
      "Filters narrowing the objects when all is true, keyed by the query parameter names of the matching list action, for example name__icontains, id__in (comma-separated) or is_root.",
      typeUnion("A filter value.", ["string", "number", "boolean"]),
    ),
    owner: s.nullableInteger(
      "Id of the new owner, or null to make the objects unowned. Only used by set_permissions. With merge true a null owner is ignored and only currently unowned objects receive the new owner.",
    ),
    permissions: s.describe(
      setPermissionsInputSchema,
      "Object-level view and change permissions to apply with set_permissions, listing user and group ids. With merge false they replace the existing permissions, with merge true they are added to them.",
    ),
    merge: s.boolean(
      "Whether to merge the new owner and permissions into the existing ones instead of replacing them. Defaults to false.",
    ),
  },
  { optional: ["objects", "all", "filters", "owner", "permissions", "merge"] },
);

const bulkEditObjectsAction = defineProviderAction(service, {
  name: "bulk_edit_objects",
  operationType: "destructive",
  description:
    "Set the owner and permissions of, or delete, many tags, correspondents, document types or storage paths at once. Non-superusers need the change or delete model permission and must own (or the objects must be unowned) every targeted object, otherwise Paperless-ngx answers 403 Insufficient permissions. Deletion is immediate and not reversible.",
  requiredScopes: [],
  inputSchema: bulkEditObjectsInputSchema,
  outputSchema: resultOutputSchema,
});

export const paperlessNgxObjectActions: ProviderActionDefinition[] = [
  ...tagActions,
  ...correspondentActions,
  ...documentTypeActions,
  ...storagePathActions,
  ...customFieldActions,
  ...savedViewActions,
  bulkEditObjectsAction,
];
