import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "abuseipdb";

const ipAddressSchema = s.string({
  format: "ip",
  description: "IPv4 or IPv6 address to inspect.",
});

const cidrSchema = s.stringPattern("^\\S+/\\d{1,3}$", {
  description: "CIDR network to inspect with the AbuseIPDB block endpoint.",
});

const maxAgeInDaysSchema = s.integer({
  minimum: 1,
  maximum: 365,
  description: "Look-back window in days for AbuseIPDB report matching.",
});

const reportItemSchema = s.object(
  {
    reportedAt: s.string({ description: "Timestamp when the abuse report was submitted." }),
    comment: s.string({ description: "Reporter-supplied comment for the abuse report." }),
    categories: s.array(s.integer({ description: "Abuse category identifier attached to the report." }), {
      description: "Abuse category identifiers associated with the report.",
    }),
    reporterId: s.integer({ description: "Reporter identifier assigned by AbuseIPDB." }),
    reporterCountryCode: s.nullableString("Reporter country code when AbuseIPDB includes it."),
    reporterCountryName: s.nullableString("Reporter country name when AbuseIPDB includes it."),
  },
  {
    required: ["reportedAt", "comment", "categories", "reporterId", "reporterCountryCode", "reporterCountryName"],
    description: "Single AbuseIPDB report entry.",
  },
);

const ipSummarySchema = s.object(
  {
    ipAddress: s.string({ description: "IP address returned by AbuseIPDB." }),
    isPublic: s.boolean({ description: "Whether AbuseIPDB considers the IP publicly routable." }),
    ipVersion: s.integer({ description: "IP protocol version reported by AbuseIPDB." }),
    abuseConfidenceScore: s.integer({
      description: "Abuse confidence score returned by AbuseIPDB.",
    }),
    totalReports: s.integer({ description: "Total number of reports recorded for the IP." }),
    numDistinctUsers: s.integer({
      description: "Number of distinct reporters that submitted reports for the IP.",
    }),
    countryCode: s.nullableString("Country code associated with the IP when available."),
    usageType: s.nullableString("Usage classification associated with the IP when available."),
    isp: s.nullableString("Internet service provider associated with the IP."),
    domain: s.nullableString("Domain associated with the IP when available."),
    hostnames: s.array(s.string({ description: "Hostname associated with the IP." }), {
      description: "Hostnames associated with the IP.",
    }),
    lastReportedAt: s.nullableString("Timestamp of the most recent abuse report when available."),
  },
  {
    required: [
      "ipAddress",
      "isPublic",
      "ipVersion",
      "abuseConfidenceScore",
      "totalReports",
      "numDistinctUsers",
      "countryCode",
      "usageType",
      "isp",
      "domain",
      "hostnames",
      "lastReportedAt",
    ],
    description: "Normalized AbuseIPDB IP summary.",
  },
);

const reportsPaginationSchema = s.object(
  {
    total: s.integer({ description: "Total number of reports matching the request." }),
    page: s.integer({ description: "Current report page number." }),
    count: s.integer({ description: "Number of reports returned in the current page." }),
    perPage: s.integer({ description: "Requested page size for the report list." }),
    lastPage: s.integer({ description: "Last available page number for the report list." }),
    nextPageUrl: s.nullableString("Next page URL returned by AbuseIPDB when available."),
    previousPageUrl: s.nullableString("Previous page URL returned by AbuseIPDB when available."),
  },
  {
    required: ["total", "page", "count", "perPage", "lastPage", "nextPageUrl", "previousPageUrl"],
    description: "Pagination metadata returned by the AbuseIPDB reports endpoint.",
  },
);

const blockSummarySchema = s.object(
  {
    networkAddress: s.string({ description: "Network address returned for the block." }),
    netmask: s.string({ description: "Netmask returned for the block." }),
    minAddress: s.string({ description: "Minimum IP address within the block." }),
    maxAddress: s.string({ description: "Maximum IP address within the block." }),
    numPossibleHosts: s.integer({
      description: "Number of possible hosts contained in the block.",
    }),
    addressSpaceDesc: s.string({ description: "Address space description returned by AbuseIPDB." }),
  },
  {
    required: ["networkAddress", "netmask", "minAddress", "maxAddress", "numPossibleHosts", "addressSpaceDesc"],
    description: "Normalized AbuseIPDB network block summary.",
  },
);

const reportedAddressSchema = s.object(
  {
    ipAddress: s.string({ description: "Reported IP address inside the requested network block." }),
    numReports: s.integer({
      description: "Number of reports recorded for the reported address.",
    }),
    mostRecentReport: s.nullableString("Timestamp of the most recent report for the reported address."),
    abuseConfidenceScore: s.integer({
      description: "Abuse confidence score for the reported address.",
    }),
    countryCode: s.nullableString("Country code associated with the reported address when available."),
  },
  {
    required: ["ipAddress", "numReports", "mostRecentReport", "abuseConfidenceScore", "countryCode"],
    description: "Single reported address returned by the AbuseIPDB block endpoint.",
  },
);

const blacklistEntrySchema = s.looseObject({}, { description: "Single AbuseIPDB blacklist entry." });

export const abuseipdbActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "check_ip",
    description: "Check the abuse reputation of a single IP address with AbuseIPDB.",
    inputSchema: s.object(
      {
        ipAddress: ipAddressSchema,
        maxAgeInDays: maxAgeInDaysSchema,
        verbose: s.boolean({ description: "Whether to include detailed abuse reports in the response." }),
      },
      {
        required: ["ipAddress"],
        description: "Input parameters for checking a single IP address with AbuseIPDB.",
      },
    ),
    outputSchema: s.object(
      {
        ip: ipSummarySchema,
        reports: s.nullable(
          s.array(reportItemSchema, { description: "Detailed abuse reports when verbose mode is enabled." }),
        ),
      },
      {
        required: ["ip", "reports"],
        description: "Abuse reputation summary returned for a single IP address.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_reports",
    description: "List detailed AbuseIPDB reports for a single IP address.",
    inputSchema: s.object(
      {
        ipAddress: ipAddressSchema,
        maxAgeInDays: maxAgeInDaysSchema,
        page: s.integer({
          minimum: 1,
          description: "Page number to request from the AbuseIPDB reports endpoint.",
        }),
        perPage: s.integer({
          minimum: 1,
          description: "Number of reports to request per page from AbuseIPDB.",
        }),
      },
      {
        required: ["ipAddress"],
        description: "Input parameters for listing AbuseIPDB reports for an IP address.",
      },
    ),
    outputSchema: s.object(
      {
        reports: s.array(reportItemSchema, { description: "Detailed reports returned by AbuseIPDB." }),
        pagination: reportsPaginationSchema,
      },
      {
        required: ["reports", "pagination"],
        description: "Detailed AbuseIPDB reports returned for a single IP address.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "check_block",
    description: "Inspect a CIDR block for reported addresses with AbuseIPDB.",
    inputSchema: s.object(
      {
        network: cidrSchema,
        maxAgeInDays: maxAgeInDaysSchema,
      },
      {
        required: ["network"],
        description: "Input parameters for checking a CIDR block with AbuseIPDB.",
      },
    ),
    outputSchema: s.object(
      {
        block: blockSummarySchema,
        reportedAddresses: s.array(reportedAddressSchema, {
          description: "Reported addresses returned for the requested network block.",
        }),
      },
      {
        required: ["block", "reportedAddresses"],
        description: "AbuseIPDB block inspection result.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "blacklist",
    description: "Read the structured AbuseIPDB blacklist feed in JSON format.",
    inputSchema: s.object(
      {
        limit: s.integer({
          minimum: 1,
          description: "Maximum number of blacklist entries to return.",
        }),
        ipVersion: s.union([s.literal(4), s.literal(6)], {
          description: "Optional IP version filter for blacklist results.",
        }),
        confidenceMinimum: s.integer({
          minimum: 1,
          maximum: 100,
          description: "Minimum abuse confidence score required for returned entries.",
        }),
        onlyCountries: s.array(
          s.string({
            minLength: 2,
            maxLength: 2,
            description: "ISO 3166-1 alpha-2 country code to include.",
          }),
          { description: "Optional allowlist of countries to include in the blacklist response." },
        ),
        exceptCountries: s.array(
          s.string({
            minLength: 2,
            maxLength: 2,
            description: "ISO 3166-1 alpha-2 country code to exclude.",
          }),
          { description: "Optional denylist of countries to exclude from the blacklist response." },
        ),
      },
      {
        description: "Input parameters for reading the AbuseIPDB blacklist feed.",
      },
    ),
    outputSchema: s.object(
      {
        entries: s.array(blacklistEntrySchema, {
          description: "Structured blacklist entries returned by AbuseIPDB.",
        }),
        generatedAt: s.string({ description: "Timestamp when the blacklist feed was generated." }),
      },
      {
        required: ["entries", "generatedAt"],
        description: "Structured AbuseIPDB blacklist output.",
      },
    ),
  }),
];
