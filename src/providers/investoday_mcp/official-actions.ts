import type { ActionDefinition } from "../../core/types.ts";
import type { InvestodayOfficialToolDefinition } from "./official-tool-types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { chartsOfficialTools } from "./official-tools/charts.ts";
import { fixedIncomeOfficialTools } from "./official-tools/fixed-income.ts";
import { fundsOfficialTools } from "./official-tools/funds.ts";
import { hongKongOfficialTools } from "./official-tools/hong-kong.ts";
import { indicesIndustriesOfficialTools } from "./official-tools/indices-industries.ts";
import { macroCalendarOfficialTools } from "./official-tools/macro-calendar.ts";
import { otherOfficialTools } from "./official-tools/other.ts";
import { researchNewsOfficialTools } from "./official-tools/research-news.ts";
import { stocksOfficialTools } from "./official-tools/stocks.ts";

const officialTools: InvestodayOfficialToolDefinition[] = [
  ...chartsOfficialTools,
  ...fixedIncomeOfficialTools,
  ...fundsOfficialTools,
  ...hongKongOfficialTools,
  ...indicesIndustriesOfficialTools,
  ...macroCalendarOfficialTools,
  ...otherOfficialTools,
  ...researchNewsOfficialTools,
  ...stocksOfficialTools,
];

export const investodayOfficialToolNames: Map<string, string> = new Map(
  officialTools.map((tool) => [tool.name, tool.toolName]),
);

export const investodayOfficialActions: ActionDefinition[] = officialTools.map((tool) =>
  defineProviderAction("investoday_mcp", {
    name: tool.name,
    operationType: tool.operationType,
    description: tool.description,
    requiredScopes: [],
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
  }),
);
