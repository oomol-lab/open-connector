import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clinicalkey";

const rawObjectSchema = s.looseObject("The raw COUNTER 5.1 JSON object returned by Elsevier.");
const filterValueSchema = s.stringPattern("^[^|]+$", {
  description: "One official COUNTER filter value, without the pipe separator used on the wire.",
});
const filterValuesSchema = (description: string) => s.array(description, filterValueSchema, { minItems: 1 });

export const clinicalKeyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_service_status",
    operationType: "read",
    description: "Get the current operational status of Elsevier's ClinicalKey COUNTER 5.1 service.",
    inputSchema: s.object("Input for checking the ClinicalKey COUNTER service status.", {}),
    outputSchema: s.object("The ClinicalKey COUNTER service status response.", {
      status: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_reports",
    operationType: "read",
    description:
      "List the COUNTER 5.1 usage reports currently available to the connected ClinicalKey customer account.",
    inputSchema: s.object("Input for listing available ClinicalKey COUNTER reports.", {}),
    outputSchema: s.object("The available ClinicalKey COUNTER reports.", {
      reports: s.array("The account-specific report definitions returned by Elsevier.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List the consortium members or sites associated with the connected ClinicalKey customer account.",
    inputSchema: s.object("Input for listing ClinicalKey consortium members or sites.", {}),
    outputSchema: s.object("The ClinicalKey consortium members or sites.", {
      members: s.array(
        "The member account records, including customer and requestor identifiers returned by Elsevier.",
        rawObjectSchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage_report",
    operationType: "read",
    description:
      "Retrieve one ClinicalKey COUNTER 5.1 usage report for an inclusive date range with optional standard filters and attributes.",
    inputSchema: s.object(
      "Input for retrieving one ClinicalKey COUNTER 5.1 usage report.",
      {
        reportId: s.nonWhitespaceString(
          "The report identifier returned by list_reports, such as PR, PR_P1, TR_B1, or TR_J1.",
        ),
        beginDate: s.date("The inclusive first usage date in YYYY-MM-DD format."),
        endDate: s.date("The inclusive last usage date in YYYY-MM-DD format."),
        dataTypes: filterValuesSchema(
          "The official COUNTER Data_Type values to include, such as Book, Journal, or Reference_Work.",
        ),
        accessTypes: filterValuesSchema(
          "The official COUNTER Access_Type values to include, such as Controlled, Open, or Free_To_Read.",
        ),
        accessMethods: filterValuesSchema(
          "The official COUNTER Access_Method values to include, such as Regular or TDM.",
        ),
        metricTypes: filterValuesSchema(
          "The official COUNTER Metric_Type values to include, such as Total_Item_Requests or Unique_Item_Requests.",
        ),
        yearsOfPublication: filterValuesSchema(
          "The publication years or ranges to include, such as 2024, 2020-2024, 0001, or 9999.",
        ),
        database: s.nonWhitespaceString(
          "The database name to include when the selected report supports the Database filter.",
        ),
        itemId: s.nonWhitespaceString(
          "The item identifier to include when the selected title report supports the Item_ID filter.",
        ),
        attributesToShow: filterValuesSchema(
          "The additional official COUNTER columns or elements to include in the report.",
        ),
        granularity: s.stringEnum("The JSON report usage granularity.", ["Month", "Totals"]),
      },
      {
        optional: [
          "dataTypes",
          "accessTypes",
          "accessMethods",
          "metricTypes",
          "yearsOfPublication",
          "database",
          "itemId",
          "attributesToShow",
          "granularity",
        ],
      },
    ),
    outputSchema: s.object("The requested ClinicalKey COUNTER usage report.", {
      report: rawObjectSchema,
    }),
  }),
];
