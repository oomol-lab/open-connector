import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ahrefs";

const modeSchema = s.stringEnum("Scope of the Ahrefs target search.", ["exact", "prefix", "domain", "subdomains"]);

const protocolSchema = s.stringEnum("Protocol filter for the target.", ["both", "http", "https"]);

const volumeModeSchema = s.stringEnum(
  "Search volume calculation mode used by Ahrefs for volume, traffic, and traffic value.",
  ["monthly", "average"],
);

const targetPositionSchema = s.stringEnum("Ranking position filter for the specified target.", [
  "in_top10",
  "in_top100",
]);

const dataWrapperOutput = s.object("Normalized Ahrefs response wrapper.", {
  data: s.anyOf("JSON data returned by Ahrefs.", [
    s.looseObject({}, { description: "Object payload returned by Ahrefs." }),
    s.array("Array payload returned by Ahrefs.", s.looseObject({}, { description: "One Ahrefs result row." })),
  ]),
});

const targetMetricsInputProperties = {
  target: s.string("Domain or URL to analyze with Ahrefs.", { minLength: 1 }),
  date: s.date("Date to report metrics on in YYYY-MM-DD format."),
  mode: modeSchema,
  country: s.string("Two-letter country code in ISO 3166-1 alpha-2 format.", { minLength: 1 }),
  protocol: protocolSchema,
  volumeMode: volumeModeSchema,
};

export const ahrefsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_limits_and_usage",
    description: "Retrieve Ahrefs API subscription limits and current usage.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving Ahrefs limits and usage.", {}),
    outputSchema: dataWrapperOutput,
  }),
  defineProviderAction(service, {
    name: "get_site_explorer_metrics",
    description: "Retrieve Site Explorer metrics for a domain or URL.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving Ahrefs Site Explorer metrics.", targetMetricsInputProperties, {
      optional: ["mode", "country", "protocol", "volumeMode"],
    }),
    outputSchema: dataWrapperOutput,
  }),
  defineProviderAction(service, {
    name: "get_site_explorer_metrics_by_country",
    description: "Retrieve Site Explorer metrics grouped by country for a domain or URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Ahrefs Site Explorer metrics by country.",
      {
        target: targetMetricsInputProperties.target,
        date: targetMetricsInputProperties.date,
        mode: targetMetricsInputProperties.mode,
        select: s.string("Comma-separated list of columns to return.", { minLength: 1 }),
        protocol: targetMetricsInputProperties.protocol,
        volumeMode: targetMetricsInputProperties.volumeMode,
      },
      {
        optional: ["mode", "select", "protocol", "volumeMode"],
      },
    ),
    outputSchema: dataWrapperOutput,
  }),
  defineProviderAction(service, {
    name: "get_keywords_overview",
    description: "Retrieve Keywords Explorer overview rows for keywords, a target, or a keyword list.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Ahrefs Keywords Explorer overview rows.",
      {
        country: s.string("Two-letter country code in ISO 3166-1 alpha-2 format.", { minLength: 1 }),
        select: s.string("Comma-separated list of columns to return.", { minLength: 1 }),
        keywords: s.string("Comma-separated list of keywords to show metrics for.", { minLength: 1 }),
        target: s.string("Domain or URL used to filter keyword data.", { minLength: 1 }),
        targetMode: modeSchema,
        targetPosition: targetPositionSchema,
        keywordListId: s.integer("Identifier of an existing Ahrefs keyword list.", { minimum: 1 }),
        volumeMonthlyDateFrom: s.date(
          "Start date in YYYY-MM-DD format for retrieving historical monthly search volumes.",
        ),
        volumeMonthlyDateTo: s.date(
          "End date in YYYY-MM-DD format for retrieving historical monthly search volumes.",
        ),
        where: s.string("Ahrefs filter expression.", { minLength: 1 }),
        orderBy: s.string("Column ordering expression accepted by Ahrefs.", { minLength: 1 }),
        limit: s.integer("Maximum number of keyword rows to return.", { minimum: 1 }),
        timeout: s.integer("Manual timeout duration in seconds.", { minimum: 1 }),
      },
      {
        optional: [
          "keywords",
          "target",
          "targetMode",
          "targetPosition",
          "keywordListId",
          "volumeMonthlyDateFrom",
          "volumeMonthlyDateTo",
          "where",
          "orderBy",
          "limit",
          "timeout",
        ],
      },
    ),
    outputSchema: dataWrapperOutput,
  }),
];

export type AhrefsActionName = (typeof ahrefsActions)[number]["name"];
