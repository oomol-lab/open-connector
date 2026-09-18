import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "erpnext";

const doctypeField = s.nonEmptyString("The ERPNext DocType name to operate on.");
const documentNameField = s.nonEmptyString("The unique name of the ERPNext document.");
const fieldNamesField = s.anyOf("One field name or an array of field names to request from ERPNext.", [
  s.nonEmptyString("One field name to request from ERPNext."),
  s.stringArray("Field names to request from ERPNext.", {
    minItems: 1,
    itemDescription: "A field name to request from ERPNext.",
  }),
]);
const looseObjectSchema = s.looseObject("An ERPNext document or nested payload.");
const documentsOutputSchema = s.array("The ERPNext documents returned by the request.", looseObjectSchema);
const filtersSchema = s.anyOf("Filters passed through to ERPNext as JSON.", [
  s.record("A field-to-value filter object accepted by ERPNext.", s.unknown("A filter value.")),
  s.array(
    "An array of positional filter tuples accepted by ERPNext.",
    s.array("A positional filter tuple accepted by ERPNext.", s.unknown("A filter tuple value."), {
      minItems: 1,
    }),
    { minItems: 1 },
  ),
]);
const documentMutationSchema = s.record(
  "The document fields to create or update in ERPNext.",
  s.unknown("One ERPNext document field value."),
);
const fieldValueSchema = s.unknown("The field value or object returned by ERPNext.");

const getValueInputSchema = s.object(
  "The input payload for reading one or more ERPNext field values. Provide exactly one of name or filters.",
  {
    doctype: doctypeField,
    name: documentNameField,
    filters: filtersSchema,
    fieldname: fieldNamesField,
  },
  { optional: ["name", "filters"] },
);

export const erpnextActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_logged_user",
    operationType: "read",
    description: "Get the currently authenticated ERPNext user for the configured connection.",
    inputSchema: s.object("The input payload for fetching the current ERPNext user.", {}),
    outputSchema: s.object("The authenticated ERPNext user returned by the server.", {
      user: s.string("The authenticated ERPNext user identifier."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description:
      "List ERPNext documents for a DocType with optional field selection, filters, sorting, and pagination.",
    inputSchema: s.object(
      "The input payload for listing ERPNext documents.",
      {
        doctype: doctypeField,
        fields: s.stringArray("The ERPNext document fields to include in the response.", {
          minItems: 1,
          itemDescription: "A document field to include in the list response.",
        }),
        filters: filtersSchema,
        order_by: s.nonEmptyString("The ERPNext order_by expression such as modified desc."),
        start: s.integer("The zero-based ERPNext list offset.", { minimum: 0 }),
        page_length: s.positiveInteger("The maximum number of ERPNext documents to return."),
      },
      { optional: ["fields", "filters", "order_by", "start", "page_length"] },
    ),
    outputSchema: s.object("The ERPNext documents returned by the list query.", {
      documents: documentsOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description: "Get one ERPNext document by DocType and name.",
    inputSchema: s.object("The input payload for fetching one ERPNext document.", {
      doctype: doctypeField,
      name: documentNameField,
    }),
    outputSchema: s.object("The ERPNext document returned by the request.", {
      document: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_document",
    operationType: "write",
    description: "Create one ERPNext document for the specified DocType.",
    inputSchema: s.object("The input payload for creating an ERPNext document.", {
      doctype: doctypeField,
      data: documentMutationSchema,
    }),
    outputSchema: s.object("The created ERPNext document.", {
      document: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_document",
    operationType: "write",
    description: "Update selected fields on one ERPNext document.",
    inputSchema: s.object("The input payload for updating an ERPNext document.", {
      doctype: doctypeField,
      name: documentNameField,
      fields: documentMutationSchema,
    }),
    outputSchema: s.object("The updated ERPNext document.", {
      document: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_document",
    operationType: "destructive",
    description: "Delete one ERPNext document by DocType and name.",
    inputSchema: s.object("The input payload for deleting one ERPNext document.", {
      doctype: doctypeField,
      name: documentNameField,
    }),
    outputSchema: s.object("The deletion status returned by ERPNext.", {
      ok: s.boolean("Whether ERPNext confirmed the document deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_count",
    operationType: "read",
    description: "Get the count of ERPNext documents that match an optional filter.",
    inputSchema: s.object(
      "The input payload for counting ERPNext documents.",
      {
        doctype: doctypeField,
        filters: filtersSchema,
      },
      { optional: ["filters"] },
    ),
    outputSchema: s.object("The ERPNext document count.", {
      count: s.integer("The count returned by ERPNext.", { minimum: 0 }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_value",
    operationType: "read",
    description: "Get one ERPNext field value or a group of field values without loading the full document.",
    inputSchema: getValueInputSchema,
    outputSchema: s.object("The ERPNext field value or value object returned by the request.", {
      value: fieldValueSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "set_document_value",
    operationType: "write",
    description: "Set one field value on an ERPNext document and return the updated document.",
    inputSchema: s.object("The input payload for updating one ERPNext field value.", {
      doctype: doctypeField,
      name: documentNameField,
      fieldname: s.nonEmptyString("The ERPNext field name to update."),
      value: fieldValueSchema,
    }),
    outputSchema: s.object("The ERPNext document returned after the update.", {
      document: looseObjectSchema,
    }),
  }),
];
