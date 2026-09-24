import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const model = s.nonWhitespaceString("Technical model name, such as res.partner or sale.order.");
const context = s.optional(s.unknownObject("Odoo context, such as lang, tz, or allowed_company_ids."));
const domain = s.array(s.unknown("A domain condition array or prefix operator: &, |, !."), {
  description: 'Odoo domain in JSON form, for example [["is_company", "=", true]]. Use [] to match all records.',
});
const ids = s.array(s.positiveInteger("Record ID."), { minItems: 1, description: "IDs of the records to operate on." });
const fields = s.optional(s.stringArray("Field names to return. Omit to use Odoo's default field selection."));
const pagination = {
  limit: s.optional(s.positiveInteger("Maximum records to return. Defaults to 100.", { default: 100 })),
  offset: s.optional(s.nonNegativeInteger("Number of matching records to skip.")),
  order: s.optional(s.nonWhitespaceString("Sort expression, such as name asc, id asc.")),
};
const records = s.requiredObject("Matching records with model-specific fields.", {
  records: s.array(s.unknownObject("An Odoo record. Relational fields retain Odoo's JSON representation.")),
});

export const odooActions: ProviderActionDefinition[] = [
  defineProviderAction("odoo", {
    name: "search",
    operationType: "read",
    description: "Find record IDs matching an Odoo domain.",
    inputSchema: s.requiredObject("Search criteria.", { model, domain, ...pagination, context }),
    outputSchema: s.requiredObject("Matching record IDs.", { ids: s.array(s.positiveInteger("Record ID.")) }),
  }),
  defineProviderAction("odoo", {
    name: "read",
    operationType: "read",
    description: "Read fields from specific Odoo records.",
    inputSchema: s.requiredObject("Records and fields to read.", { model, ids, fields, context }),
    outputSchema: records,
  }),
  defineProviderAction("odoo", {
    name: "search_read",
    operationType: "read",
    description: "Search and read Odoo records in one ORM call.",
    inputSchema: s.requiredObject("Search criteria and fields to return.", {
      model,
      domain,
      fields,
      ...pagination,
      context,
    }),
    outputSchema: records,
  }),
  defineProviderAction("odoo", {
    name: "search_count",
    operationType: "read",
    description: "Count Odoo records matching a domain.",
    inputSchema: s.requiredObject("Records to count.", { model, domain, context }),
    outputSchema: s.requiredObject("Number of matching records.", { count: s.nonNegativeInteger("Record count.") }),
  }),
  defineProviderAction("odoo", {
    name: "fields_get",
    operationType: "read",
    description: "Inspect field types and metadata for an Odoo model.",
    inputSchema: s.requiredObject("Fields and metadata to inspect.", {
      model,
      fields,
      context,
      attributes: s.optional(
        s.stringArray(
          "Metadata attributes, such as string, type, help, required, or selection. Omit to return all attributes.",
        ),
      ),
    }),
    outputSchema: s.requiredObject("Metadata keyed by field name.", {
      fields: s.record(s.unknownObject("Field metadata returned by Odoo.")),
    }),
  }),
  defineProviderAction("odoo", {
    name: "create",
    operationType: "destructive",
    description: "Create one record in an Odoo model. Relational commands may delete related records.",
    inputSchema: s.requiredObject("Record to create.", {
      model,
      values: s.unknownObject("Field values for the new record, including any relational command arrays."),
      context,
    }),
    outputSchema: s.requiredObject("Created record.", { id: s.positiveInteger("Created record ID.") }),
  }),
  defineProviderAction("odoo", {
    name: "write",
    operationType: "destructive",
    description: "Update fields on one or more Odoo records. Relational commands may delete related records.",
    inputSchema: s.requiredObject("Records and values to update.", {
      model,
      ids,
      values: s.unknownObject("Field values to update, including any relational command arrays."),
      context,
    }),
    outputSchema: s.requiredObject("Update result.", { success: s.boolean("Whether Odoo reported success.") }),
  }),
  defineProviderAction("odoo", {
    name: "unlink",
    operationType: "destructive",
    description: "Delete one or more Odoo records.",
    inputSchema: s.requiredObject("Records to delete.", { model, ids, context }),
    outputSchema: s.requiredObject("Deletion result.", { success: s.boolean("Whether Odoo reported success.") }),
  }),
  defineProviderAction("odoo", {
    name: "execute_kw",
    operationType: "destructive",
    description: "Call a public Odoo model method, including custom methods. The method may modify or delete data.",
    inputSchema: s.requiredObject("Model method and arguments.", {
      model,
      method: s.nonWhitespaceString("Public model method name, such as action_confirm."),
      args: s.optional(
        s.array(s.unknown("Positional argument."), {
          description: "Positional arguments. For record methods, pass the record ID array as the first argument.",
        }),
      ),
      kwargs: s.optional(s.unknownObject("Keyword arguments, including context when needed.")),
    }),
    outputSchema: s.requiredObject("Model method result.", {
      result: s.unknown("The JSON value returned by the method, without coercion."),
    }),
  }),
];
