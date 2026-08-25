import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hybrid_analysis";

const trimmedString = (description: string) => s.nonEmptyString(description);

const fileHashSchema = s.string("An MD5, SHA1, SHA256, or SHA512 file hash.", {
  pattern: "^(?:[A-Fa-f0-9]{32}|[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64}|[A-Fa-f0-9]{128})$",
});

const sha256Schema = s.string("The SHA256 file hash to look up.", {
  pattern: "^[A-Fa-f0-9]{64}$",
});

const loosePayload = (description: string) => s.looseObject(description);

const getCurrentKeyAction = defineProviderAction(service, {
  name: "get_current_key",
  description: "Get the authorization level for the current Hybrid Analysis API key.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for reading the current Hybrid Analysis API key.", {}),
  outputSchema: s.object("The current Hybrid Analysis API key information.", {
    authLevel: s.nullable(s.integer("The numeric authorization level assigned to the API key.")),
    authLevelName: s.nullable(s.string("The human-readable authorization level assigned to the API key.")),
  }),
});

const searchHashAction = defineProviderAction(service, {
  name: "search_hash",
  description: "Find Hybrid Analysis detonation reports associated with a file hash.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for searching by file hash.", {
    hash: fileHashSchema,
  }),
  outputSchema: s.object("Hybrid Analysis reports associated with the requested hash.", {
    sha256s: s.array("Canonical SHA256 hashes returned for the query.", s.string("A SHA256 hash.")),
    reports: s.array(
      "Detonation reports associated with the hash.",
      loosePayload("A Hybrid Analysis detonation report match."),
    ),
  }),
});

const getOverviewAction = defineProviderAction(service, {
  name: "get_overview",
  description: "Get the Hybrid Analysis overview for a SHA256 file hash.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for reading an analysis overview.", {
    sha256: sha256Schema,
  }),
  outputSchema: s.object("The Hybrid Analysis overview for the requested hash.", {
    overview: loosePayload("The overview and scanner results returned by Hybrid Analysis."),
  }),
});

const reportIdSchema = trimmedString(
  "A Hybrid Analysis job ID or a report identifier formatted as sha256:environmentId.",
);

const getReportStateAction = defineProviderAction(service, {
  name: "get_report_state",
  description: "Get the processing state of a Hybrid Analysis sandbox report.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for reading a sandbox report state.", {
    reportId: reportIdSchema,
  }),
  outputSchema: s.object("The current state of the requested Hybrid Analysis report.", {
    state: loosePayload("State, error, and related report details returned by Hybrid Analysis."),
  }),
});

const getReportSummaryAction = defineProviderAction(service, {
  name: "get_report_summary",
  description: "Get the summary of a Hybrid Analysis sandbox report.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for reading a sandbox report summary.", {
    reportId: reportIdSchema,
  }),
  outputSchema: s.object("The summary of the requested Hybrid Analysis report.", {
    summary: loosePayload("The sandbox report summary returned by Hybrid Analysis."),
  }),
});

export const hybridAnalysisActions: ActionDefinition[] = [
  getCurrentKeyAction,
  searchHashAction,
  getOverviewAction,
  getReportStateAction,
  getReportSummaryAction,
];
