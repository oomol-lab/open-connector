import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kingdee";

export const kingdeeMethods = {
  query_records: "ExecuteBillQuery",
  get_record: "View",
  query_report: "GetSysReportData",
  save_record: "Save",
  batch_save_records: "BatchSave",
  draft_record: "Draft",
  submit_records: "Submit",
  audit_records: "Audit",
  unaudit_records: "UnAudit",
  delete_records: "Delete",
  push_records: "Push",
  allocate_records: "Allocate",
} as const;

const businessOutputSchema = s.object("Business operation outcome, preserving partial success.", {
  success: s.boolean("Whether every reported operation succeeded."),
  partialSuccess: s.boolean("Whether both successful entities and errors were reported."),
  errors: s.array("Reported business errors.", s.unknown("An upstream business error.")),
  successfulEntities: s.array(
    "Successfully processed entities reported by Kingdee.",
    s.unknown("An upstream successful entity."),
  ),
  result: s.looseRequiredObject("The upstream Result, including additional fields.", {}),
});

export const kingdeeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_records",
    operationType: "read",
    description: "Query business records by fields, filters and row offset.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          FieldKeys: s.string(
            "Comma-separated field keys to return, in column order; use keys from the object documentation.",
            { minLength: 1 },
          ),
          FilterString: s.anyOf(
            "Documented filter expression or structured filter conditions; use the object documentation.",
            [
              s.string("A filter expression."),
              s.array("Structured filter conditions.", s.looseRequiredObject("A documented filter condition.", {})),
            ],
          ),
          OrderString: s.string("Sort expression using documented field keys."),
          TopRowCount: s.integer("Maximum total rows requested by the query.", { minimum: 0 }),
          StartRow: s.integer("Zero-based starting row offset.", { minimum: 0 }),
          Limit: s.integer("Maximum rows to return, up to 10000.", { minimum: 0, maximum: 10000 }),
          SubSystemId: s.string("Subsystem ID containing the form."),
        },
        { additionalProperties: true, required: ["FieldKeys"] },
      ),
    }),
    outputSchema: s.object("Query rows in requested field order.", {
      rows: s.array(
        "Returned rows, without inferred totals or next-page flags.",
        s.array("A row in FieldKeys order.", s.unknown("A field value.")),
      ),
      fieldKeys: s.array("Column keys in requested order.", s.string("A field key.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "View a record by its internal ID or number.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          CreateOrgId: s.integer("Internal ID of the creating organization."),
          Number: s.string("Record number; required when selecting by number.", { minLength: 1 }),
          Id: s.string("Record internal ID; required when selecting by ID.", { minLength: 1 }),
          IsSortBySeq: s.boolean("Whether to sort entries by sequence."),
        },
        { additionalProperties: true, required: [] },
      ),
    }),
    outputSchema: s.object("Record details and the upstream result.", {
      record: s.unknown("The form-specific record."),
      result: s.looseRequiredObject("The upstream Result, including additional fields.", {}),
    }),
  }),
  defineProviderAction(service, {
    name: "query_report",
    operationType: "read",
    description: "Query a report using its form-specific filters.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          FieldKeys: s.string(
            "Comma-separated field keys to return, in column order; use keys from the object documentation.",
            { minLength: 1 },
          ),
          SchemeId: s.string("Internal ID of the report filter scheme."),
          StartRow: s.integer("Zero-based starting row offset.", { minimum: 0 }),
          Limit: s.integer("Maximum rows to return, up to 10000.", { minimum: 0, maximum: 10000 }),
          IsVerifyBaseDataField: s.boolean(
            "Whether to validate referenced master data; the operation determines the default.",
          ),
          FilterString: s.anyOf(
            "Documented filter expression or structured filter conditions; use the object documentation.",
            [
              s.string("A filter expression."),
              s.array("Structured filter conditions.", s.looseRequiredObject("A documented filter condition.", {})),
            ],
          ),
          Model: s.looseRequiredObject(
            "Form-specific business data; obtain field keys and requirements from the official object documentation.",
            {},
          ),
        },
        { additionalProperties: true, required: ["Model", "FieldKeys"] },
      ),
    }),
    outputSchema: s.object("Report data and upstream pagination when supplied.", {
      result: s.looseRequiredObject("The upstream report Result, including Rows and RowCount when supplied.", {}),
    }),
  }),
  defineProviderAction(service, {
    name: "save_record",
    operationType: "destructive",
    description: "Save a record, including updates to existing records.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          NeedUpDateFields: s.array(
            "Fields to update; Model must include record and applicable entry internal IDs.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          NeedReturnFields: s.array(
            "Fields to return; use entitykey.key for entry fields.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          IsDeleteEntry: s.boolean("Whether to delete existing entries; upstream defaults to true."),
          SubSystemId: s.string("Subsystem ID containing the form."),
          IsVerifyBaseDataField: s.boolean(
            "Whether to validate referenced master data; the operation determines the default.",
          ),
          IsEntryBatchFill: s.boolean("Whether to fill entries in batches."),
          ValidateFlag: s.boolean("Whether to validate business data; false disables validation."),
          NumberSearch: s.boolean("Whether to look up master data by number."),
          IsAutoAdjustField: s.boolean("Whether to reorder JSON fields automatically."),
          InterationFlags: s.string("Semicolon-separated interaction flags documented for this operation."),
          IgnoreInterationFlag: s.boolean("Whether to ignore interactions."),
          IsControlPrecision: s.boolean("Whether to validate amount, price and quantity precision."),
          ValidateRepeatJson: s.boolean("Whether to reject duplicate JSON data."),
          Model: s.looseRequiredObject(
            "Form-specific business data; obtain field keys and requirements from the official object documentation.",
            {},
          ),
        },
        { additionalProperties: true, required: ["Model"] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_save_records",
    operationType: "destructive",
    description: "Save multiple records, including updates, and preserve partial results.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          NumberSearch: s.boolean("Whether to look up master data by number."),
          ValidateFlag: s.boolean("Whether to validate business data; false disables validation."),
          IsDeleteEntry: s.boolean("Whether to delete existing entries; upstream defaults to true."),
          IsEntryBatchFill: s.boolean("Whether to fill entries in batches."),
          NeedUpDateFields: s.array(
            "Fields to update; Model must include record and applicable entry internal IDs.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          NeedReturnFields: s.array(
            "Fields to return; use entitykey.key for entry fields.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          SubSystemId: s.string("Subsystem ID containing the form."),
          InterationFlags: s.string("Semicolon-separated interaction flags documented for this operation."),
          Model: s.array(
            "Form-specific business data; obtain field keys and requirements from the official object documentation.",
            s.looseRequiredObject("A form-specific record.", {}),
            { minItems: 1 },
          ),
          BatchCount: s.integer("Number of server-side processing threads; only effective for larger batches."),
          IsVerifyBaseDataField: s.boolean(
            "Whether to validate referenced master data; the operation determines the default.",
          ),
          IsAutoAdjustField: s.boolean("Whether to reorder JSON fields automatically."),
          IgnoreInterationFlag: s.boolean("Whether to ignore interactions."),
          IsControlPrecision: s.boolean("Whether to validate amount, price and quantity precision."),
          ValidateRepeatJson: s.boolean("Whether to reject duplicate JSON data."),
        },
        { additionalProperties: true, required: ["Model"] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "draft_record",
    operationType: "destructive",
    description: "Save a draft, including changes to an existing draft.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          NeedUpDateFields: s.array(
            "Fields to update; Model must include record and applicable entry internal IDs.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          NeedReturnFields: s.array(
            "Fields to return; use entitykey.key for entry fields.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          IsDeleteEntry: s.boolean("Whether to delete existing entries; upstream defaults to true."),
          SubSystemId: s.string("Subsystem ID containing the form."),
          IsVerifyBaseDataField: s.boolean(
            "Whether to validate referenced master data; the operation determines the default.",
          ),
          IsEntryBatchFill: s.boolean("Whether to fill entries in batches."),
          ValidateFlag: s.boolean("Whether to validate business data; false disables validation."),
          NumberSearch: s.boolean("Whether to look up master data by number."),
          IsAutoAdjustField: s.boolean("Whether to reorder JSON fields automatically."),
          InterationFlags: s.string("Semicolon-separated interaction flags documented for this operation."),
          IgnoreInterationFlag: s.boolean("Whether to ignore interactions."),
          IsControlPrecision: s.boolean("Whether to validate amount, price and quantity precision."),
          ValidateRepeatJson: s.boolean("Whether to reject duplicate JSON data."),
          Model: s.looseRequiredObject(
            "Form-specific business data; obtain field keys and requirements from the official object documentation.",
            {},
          ),
        },
        { additionalProperties: true, required: ["Model"] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_records",
    operationType: "write",
    description: "Submit records for approval.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          CreateOrgId: s.integer("Internal ID of the creating organization."),
          Numbers: s.array(
            "Record numbers; required when selecting by numbers.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          Ids: s.string("Comma-separated record internal IDs; required when selecting by IDs.", {
            minLength: 1,
          }),
          SelectedPostId: s.integer(
            "Employee position ID used to initiate workflow when the employee has multiple positions.",
          ),
          UseOrgId: s.integer("Internal ID of the using organization."),
          NetworkCtrl: s.boolean("Whether to enable network concurrency control."),
          IgnoreInterationFlag: s.boolean("Whether to ignore interactions."),
        },
        { additionalProperties: true, required: [] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "audit_records",
    operationType: "write",
    description: "Approve records through the audit operation.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          CreateOrgId: s.integer("Internal ID of the creating organization."),
          Numbers: s.array(
            "Record numbers; required when selecting by numbers.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          Ids: s.string("Comma-separated record internal IDs; required when selecting by IDs.", {
            minLength: 1,
          }),
          InterationFlags: s.string("Semicolon-separated interaction flags documented for this operation."),
          UseOrgId: s.integer("Internal ID of the using organization."),
          NetworkCtrl: s.boolean("Whether to enable network concurrency control."),
          IsVerifyProcInst: s.boolean("Whether to check running workflow instances associated with the record."),
          IgnoreInterationFlag: s.boolean("Whether to ignore interactions."),
          UseBatControlTimes: s.boolean("Whether to apply the record batch-processing configuration."),
        },
        { additionalProperties: true, required: [] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "unaudit_records",
    operationType: "destructive",
    description: "Reverse the audit status of records.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          CreateOrgId: s.integer("Internal ID of the creating organization."),
          Numbers: s.array(
            "Record numbers; required when selecting by numbers.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          Ids: s.string("Comma-separated record internal IDs; required when selecting by IDs.", {
            minLength: 1,
          }),
          InterationFlags: s.string("Semicolon-separated interaction flags documented for this operation."),
          IgnoreInterationFlag: s.boolean("Whether to ignore interactions."),
          UseOrgId: s.integer("Internal ID of the using organization."),
          NetworkCtrl: s.boolean("Whether to enable network concurrency control."),
          IsVerifyProcInst: s.boolean("Whether to check running workflow instances associated with the record."),
        },
        { additionalProperties: true, required: [] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_records",
    operationType: "destructive",
    description: "Delete records by internal IDs or numbers.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          CreateOrgId: s.integer("Internal ID of the creating organization."),
          Numbers: s.array(
            "Record numbers; required when selecting by numbers.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          Ids: s.string("Comma-separated record internal IDs; required when selecting by IDs.", {
            minLength: 1,
          }),
          NetworkCtrl: s.boolean("Whether to enable network concurrency control."),
        },
        { additionalProperties: true, required: [] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "push_records",
    operationType: "write",
    description: "Convert source records or entries into target records using a conversion rule.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          Ids: s.string("Comma-separated record internal IDs; required when selecting by IDs.", {
            minLength: 1,
          }),
          Numbers: s.array(
            "Record numbers; required when selecting by numbers.",
            s.string("A field key or record number.", { minLength: 1 }),
          ),
          EntryIds: s.string(
            "Comma-separated entry internal IDs; omit record IDs and numbers when pushing individual entries.",
            { minLength: 1 },
          ),
          RuleId: s.string("Conversion rule ID; required unless a default conversion rule is enabled."),
          TargetBillTypeId: s.string("Target bill type ID."),
          TargetOrgId: s.integer("Target organization internal ID."),
          TargetFormId: s.string("Target form ID; required when using a default conversion rule."),
          IsEnableDefaultRule: s.boolean("Whether to use the default conversion rule."),
          IsDraftWhenSaveFail: s.boolean("Whether to save a draft if saving the converted record fails."),
          CustomParams: s.looseRequiredObject("Custom parameters passed through to conversion plugins.", {}),
        },
        { additionalProperties: true, required: [] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "allocate_records",
    operationType: "write",
    description: "Allocate master data to target organizations.",
    inputSchema: s.object("The business object and operation parameters.", {
      formId: s.string("The official business object FormId, not a catalog node ID.", {
        minLength: 1,
      }),
      data: s.object(
        "The complete business parameters with official field casing; Connector serializes the inner JSON.",
        {
          PkIds: s.string("Comma-separated internal IDs of master data to allocate.", {
            minLength: 1,
          }),
          TOrgIds: s.string("Comma-separated target organization internal IDs.", { minLength: 1 }),
        },
        { additionalProperties: true, required: ["PkIds", "TOrgIds"] },
      ),
    }),
    outputSchema: businessOutputSchema,
  }),
];
