import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { mingdaoBuildActions } from "./actions-build.ts";
import { mingdaoManagementActions } from "./actions-management.ts";
import { mingdaoQueryActions } from "./actions-query.ts";

const worksheetId = s.nonEmptyString("The Mingdao worksheet ID.");
const rowId = s.nonEmptyString("The Mingdao record ID.");
const processId = s.nonEmptyString("The existing Mingdao workflow process ID.");
const responseFormat = s.stringEnum(
  "The upstream response format: json for structured data or md for Markdown text; defaults to json. Markdown may contain only the important schema fields.",
  ["json", "md"],
);
const triggerWorkflow = s.boolean("Whether this record mutation triggers configured workflows.");
const permanent = s.boolean(
  "Whether to permanently delete records without sending them to the recycle bin. Defaults to false; permanent deletion cannot be recovered.",
);
const fieldValue = s.unknown(
  'The value in the worksheet field format. Attachment values use accessible URLs, for example [{"name":"report.pdf","url":"https://example.com/report.pdf"}]; do not pass local files or inline base64. Attachment removal uses file IDs.',
);
const fields = s.array(
  "The field values to write.",
  s.object(
    "A worksheet field value.",
    {
      id: s.nonEmptyString("The field ID or alias."),
      value: fieldValue,
      updateType: s.stringEnum(
        "For updates to attachments, multiple selections, collaborators, departments, relations, subtables or organization roles: 0 replaces, 1 adds, 2 removes. Defaults to 0; omit for creation.",
        ["0", "1", "2"],
      ),
      allowNewOptions: s.boolean("Whether single-select or multiple-select values may create missing options."),
    },
    { optional: ["updateType", "allowNewOptions"] },
  ),
);
const batchType = s.integer(
  "The batch field option: for single/multiple selections, 1 disallows new options and 2 allows them (default 1); for attachments, 0 replaces and 1 appends (default 0).",
);
const batchFields = s.array(
  "The field values applied to every selected record.",
  s.object(
    "A batch-update field value.",
    {
      id: s.nonEmptyString("The field ID or alias."),
      value: fieldValue,
      type: batchType,
    },
    { optional: ["type"] },
  ),
);
const rowIds = s.stringArray("The record IDs to operate on.", {
  itemDescription: "A Mingdao record ID.",
});
const filter = {
  ...s.looseObject(
    "A recursive Mingdao filter. A condition requires type=condition, field and operator; value is required except for isempty and isnotempty. A group requires type=group, logic (AND or OR, case-insensitive) and nested children. Operators and values depend on worksheet field types.",
    {
      type: s.stringEnum("The filter node kind.", ["condition", "group"]),
      logic: s.string("The group logical operator: AND or OR, case-insensitive."),
      field: s.string("The condition field ID or alias."),
      operator: s.string("The Mingdao condition operator for the field type, such as eq or contains."),
      value: s.unknown("The condition value in the field's documented format; omit for isempty and isnotempty."),
      children: s.array("Nested condition or group filters.", {
        // Both actions place this recursive schema at input.filter.
        $ref: "#/properties/filter",
        description: "A recursive Mingdao filter with the same condition or group structure.",
      }),
    },
  ),
  required: ["type"],
  anyOf: [
    {
      properties: { type: { const: "condition" } },
      required: ["field", "operator"],
      anyOf: [{ properties: { operator: { enum: ["isempty", "isnotempty"] } } }, { required: ["value"] }],
    },
    { properties: { type: { const: "group" } }, required: ["logic"] },
  ],
};
const sort = s.object(
  "A record sort rule.",
  {
    field: s.string("The field ID or alias."),
    isAsc: s.boolean("Whether to sort ascending; defaults to descending."),
  },
  { optional: ["isAsc"] },
);
const dimension = s.object(
  "A pivot grouping dimension.",
  {
    field: s.string("The field ID."),
    displayName: s.string("The display name for this dimension."),
    granularity: s.integer(
      "Grouping granularity for dates (1 day, 2 week, 3 month) or regions (1 province, 2 province/city, 3 province/city/district).",
    ),
    includeEmpty: s.boolean("Whether to include empty values; defaults to false."),
  },
  { optional: ["displayName", "granularity", "includeEmpty"] },
);
const record = s.looseObject("A record with dynamic field IDs or aliases and optional system fields.", {
  id: s.string("The record ID."),
});
const records = s.looseObject("The record page returned by Mingdao.", {
  rows: s.array("The returned records.", record),
  total: s.integer("The total matching record count, when requested or returned."),
});
const mutationResult = s.looseObject("The record mutation result.", {
  id: s.string("The created or updated record ID."),
});
const markdown = s.string("The upstream Markdown response text.");
const workflow = s.looseObject("An existing workflow process.", {
  id: s.string("The workflow ID."),
  alias: s.string("The workflow alias."),
  name: s.string("The workflow name."),
  type: s.integer("The workflow type: 6 for webhook or 10 for packaged business process."),
  description: s.string("The workflow description."),
  status: s.integer("The workflow status."),
});

export const mingdaoActions: readonly ProviderActionDefinition[] = [
  ...mingdaoQueryActions,
  ...mingdaoManagementActions,
  ...mingdaoBuildActions,
  defineProviderAction("mingdao", {
    name: "get_app",
    operationType: "read",
    requiredScopes: [],
    description: "Get the connected Mingdao application's identity, metadata and navigation sections.",
    inputSchema: s.object("The application information request.", {}),
    outputSchema: s.object("The application information response.", {
      data: s.looseObject("The connected application.", {
        organizationId: s.string("The organization ID."),
        appId: s.string("The application ID."),
        name: s.string("The application name."),
        iconUrl: s.string("The application icon URL."),
        color: s.string("The application color."),
        desc: s.string("The application explanation."),
        remark: s.string("The application description."),
        sections: s.array(
          "The application navigation sections and nested items.",
          s.looseObject("An application section."),
        ),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_worksheets",
    operationType: "read",
    requiredScopes: [],
    description:
      "List worksheets in the connected Mingdao application, optionally restricted to selected worksheet IDs.",
    inputSchema: s.object(
      "The worksheet list request.",
      {
        responseFormat,
        worksheets: s.stringArray("Restrict the result to these worksheet IDs.", {
          itemDescription: "A worksheet ID.",
        }),
      },
      { optional: ["responseFormat", "worksheets"] },
    ),
    outputSchema: s.object("The worksheet list response.", {
      data: s.anyOf("The worksheet list or requested Markdown text.", [
        s.array(
          "The application worksheets.",
          s.looseObject("A worksheet summary.", {
            id: s.string("The worksheet ID."),
            name: s.string("The worksheet name."),
            remark: s.string("The worksheet remark."),
          }),
        ),
        markdown,
      ]),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "get_worksheet",
    operationType: "read",
    requiredScopes: [],
    description: "Get a Mingdao worksheet's fields, views and metadata before querying or writing its records.",
    inputSchema: s.object(
      "The worksheet details request.",
      { worksheetId, responseFormat },
      { optional: ["responseFormat"] },
    ),
    outputSchema: s.object("The worksheet details response.", {
      data: s.anyOf("The worksheet schema or requested Markdown text.", [
        s.looseObject("The worksheet schema and metadata.", {
          worksheetId,
          name: s.string("The worksheet name."),
          alias: s.string("The worksheet alias."),
          desc: s.string("The worksheet explanation."),
          remark: s.string("The worksheet description."),
          fields: s.array(
            "The worksheet field definitions.",
            s.looseObject("A field definition with its type, options and relationship metadata."),
          ),
          views: s.array("The worksheet views.", s.looseObject("A worksheet view definition.")),
        }),
        markdown,
      ]),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_records",
    operationType: "read",
    requiredScopes: [],
    description:
      "Search, filter, sort and page through Mingdao worksheet records, with optional field selection and total count.",
    inputSchema: s.object(
      "The record list request.",
      {
        worksheetId,
        responseFormat,
        pageSize: s.integer("The number of records per page, from 1 to 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
        pageIndex: s.integer("The one-based page index.", { minimum: 1 }),
        viewId: s.string("The view ID used to constrain the results."),
        fields: s.stringArray("The field IDs or aliases to include.", {
          itemDescription: "A field ID or alias.",
        }),
        filter,
        sorts: s.array("The ordered sort rules.", sort),
        search: s.string("A fuzzy search keyword."),
        tableView: s.boolean("Whether to return records in table-view format."),
        useFieldIdAsKey: s.boolean("Whether response field keys use IDs instead of aliases."),
        includeTotalCount: s.boolean("Whether to include the total record count; defaults to false."),
        includeSystemFields: s.boolean("Whether to include system fields; defaults to false."),
      },
      { required: ["worksheetId", "pageSize", "pageIndex"] },
    ),
    outputSchema: s.object("The record list response.", {
      data: s.anyOf("The record page or requested Markdown text.", [records, markdown]),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "get_record",
    operationType: "read",
    requiredScopes: [],
    description: "Get one Mingdao worksheet record with its dynamic field values and optional system fields.",
    inputSchema: s.object(
      "The record details request.",
      {
        worksheetId,
        rowId,
        responseFormat,
        includeSystemFields: s.boolean(
          "Whether to include system fields; first enable system fields in the worksheet feature settings.",
        ),
      },
      { optional: ["responseFormat", "includeSystemFields"] },
    ),
    outputSchema: s.object("The record details response.", {
      data: s.anyOf("The record or requested Markdown text.", [record, markdown]),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "create_record",
    operationType: "write",
    requiredScopes: [],
    description: "Create a Mingdao worksheet record using field IDs or aliases and URL-based attachment values.",
    inputSchema: s.object(
      "The record creation request.",
      { worksheetId, fields, triggerWorkflow },
      { optional: ["triggerWorkflow"] },
    ),
    outputSchema: s.object("The record creation response.", { data: mutationResult }),
  }),
  defineProviderAction("mingdao", {
    name: "update_record",
    operationType: "destructive",
    requiredScopes: [],
    description: "Update a Mingdao worksheet record, replacing, adding or removing supported field values.",
    inputSchema: s.object(
      "The record update request.",
      { worksheetId, rowId, fields, triggerWorkflow },
      { optional: ["triggerWorkflow"] },
    ),
    outputSchema: s.object("The record update response.", { data: mutationResult }),
  }),
  defineProviderAction("mingdao", {
    name: "delete_record",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete a Mingdao worksheet record, optionally permanently instead of using the recycle bin.",
    inputSchema: s.object(
      "The record deletion request.",
      { worksheetId, rowId, triggerWorkflow, permanent },
      { optional: ["triggerWorkflow", "permanent"] },
    ),
    outputSchema: s.object("The record deletion response.", {
      data: s.looseObject("The deletion result, normally an empty object."),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "batch_create_records",
    operationType: "write",
    requiredScopes: [],
    description:
      "Create multiple Mingdao worksheet records with the batch API's string-encoded field values and URL-based attachments.",
    inputSchema: s.object(
      "The batch record creation request.",
      {
        worksheetId,
        triggerWorkflow,
        rows: s.array(
          "The records to create.",
          s.object("A record to create.", {
            fields: s.array(
              "The record field values.",
              s.object(
                "A batch-create field value.",
                {
                  id: s.nonEmptyString("The field ID or alias."),
                  value: s.string(
                    "The batch API field value as a string; serialize structured field values as JSON text. Attachments must reference accessible URLs, never local files or inline base64.",
                  ),
                  type: batchType,
                },
                { optional: ["type"] },
              ),
            ),
          }),
        ),
      },
      { optional: ["triggerWorkflow"] },
    ),
    outputSchema: s.object("The batch record creation response.", {
      data: s.looseObject("The batch creation result.", {
        rowIds: s.stringArray("The successfully created record IDs.", {
          itemDescription: "A created record ID.",
        }),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "batch_update_records",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Apply the same field updates to multiple Mingdao worksheet records and report successful and failed record IDs.",
    inputSchema: s.object(
      "The batch record update request.",
      { worksheetId, rowIds, fields: batchFields, triggerWorkflow },
      { optional: ["triggerWorkflow"] },
    ),
    outputSchema: s.object("The batch record update response.", {
      data: s.looseObject("The batch update result.", {
        failedRowIds: s.stringArray("The IDs of records that failed to update.", {
          itemDescription: "A failed record ID.",
        }),
        succeededRowIds: s.stringArray("The IDs of records successfully updated.", {
          itemDescription: "A successful record ID.",
        }),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "batch_delete_records",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete multiple Mingdao worksheet records, optionally permanently instead of using the recycle bin.",
    inputSchema: s.object(
      "The batch record deletion request.",
      { worksheetId, rowIds, triggerWorkflow, permanent },
      { optional: ["triggerWorkflow", "permanent"] },
    ),
    outputSchema: s.object("The batch record deletion response.", {
      data: s.looseObject("The batch deletion result, normally an empty object."),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "get_related_records",
    operationType: "read",
    requiredScopes: [],
    description: "Page through the records linked by a Mingdao record's relationship field.",
    inputSchema: s.object(
      "The related record request.",
      {
        worksheetId,
        rowId,
        field: s.nonEmptyString("The relationship field ID."),
        pageSize: s.integer("The number of related records per page; defaults to 20."),
        pageIndex: s.integer("The page index; defaults to 1."),
        isReturnSystemFields: s.boolean("Whether to include system fields; defaults to false."),
      },
      { optional: ["pageSize", "pageIndex", "isReturnSystemFields"] },
    ),
    outputSchema: s.object("The related record response.", { data: records }),
  }),
  defineProviderAction("mingdao", {
    name: "pivot_records",
    operationType: "read",
    requiredScopes: [],
    description:
      "Aggregate Mingdao worksheet records into a pivot table with grouping dimensions, filters, sorting and optional summary totals.",
    inputSchema: s.object(
      "The pivot aggregation request.",
      {
        worksheetId,
        pageSize: s.integer("The page size, at most 1000.", { maximum: 1000 }),
        pageIndex: s.integer("The one-based page index.", { minimum: 1 }),
        viewId: s.string("The view ID."),
        columns: s.array("The column grouping dimensions.", dimension),
        rows: s.array("The row grouping dimensions.", dimension),
        values: s.array(
          "The values to aggregate.",
          s.object(
            "A pivot measure.",
            {
              field: s.string("The field ID, or record_count to count records."),
              displayName: s.string("The measure display name."),
              aggregation: s.string(
                "The aggregation function: COUNT, DISTINCTCOUNT, SUM, MIN, MAX or AVG. Function names are case-insensitive.",
              ),
              includeEmpty: s.boolean(
                "Whether to include empty values; defaults to false, with empty values displayed as zero.",
              ),
            },
            { optional: ["displayName", "includeEmpty"] },
          ),
        ),
        filter,
        sorts: s.array(
          "The ordered pivot sort rules.",
          s.object("A pivot sort rule.", {
            field: s.string("The field ID."),
            isAsc: s.boolean("Whether to sort ascending."),
          }),
        ),
        includeSummary: s.boolean("Whether to include summary values over all rows."),
      },
      { required: ["worksheetId", "values"] },
    ),
    outputSchema: s.object("The pivot aggregation response.", {
      data: s.looseObject("The pivot result.", {
        meta: s.looseObject("The selected column, row and value definitions."),
        pivot: s.array("The pivot data rows.", s.looseObject("A pivot row with dynamic columns, rows and values.")),
        summary: s.looseObject("The summary values keyed by field ID."),
        totalPages: s.integer("The total number of pages."),
        currentPage: s.integer("The current page index."),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_workflows",
    operationType: "read",
    requiredScopes: [],
    description:
      "List the existing webhook and packaged business process workflows available in the connected Mingdao application.",
    inputSchema: s.object("The workflow list request.", {}),
    outputSchema: s.object("The workflow list response.", {
      data: s.looseObject("The workflow listing.", {
        processes: s.array("The available workflows.", workflow),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "get_workflow",
    operationType: "read",
    requiredScopes: [],
    description: "Get a Mingdao workflow's input and output parameter definitions before triggering it.",
    inputSchema: s.object("The workflow details request.", { processId }),
    outputSchema: s.object("The workflow details response.", {
      data: s.looseObject("The workflow definition.", {
        id: s.string("The workflow ID."),
        name: s.string("The workflow name."),
        description: s.string("The workflow description."),
        inputParameters: s.array(
          "The expected workflow input parameters.",
          s.looseObject(
            "An input parameter definition, including alias, type, required flag, options and nested items.",
          ),
        ),
        outputParameters: s.array(
          "The workflow output parameters.",
          s.looseObject("An output parameter definition, including alias, type and nested items."),
        ),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "trigger_workflow",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Trigger an existing Mingdao workflow with its defined parameters. Its configured steps may update or delete business data; the returned result does not imply that all downstream work has completed.",
    inputSchema: s.object("The workflow trigger request.", {
      processId,
      parameters: s.looseObject(
        "The dynamic input values keyed by the workflow parameter aliases returned by get_workflow. Use an empty object when no parameters are required.",
      ),
    }),
    outputSchema: s.object("The workflow trigger response.", {
      data: s.looseObject("The dynamic output values defined by this workflow."),
    }),
  }),
];
