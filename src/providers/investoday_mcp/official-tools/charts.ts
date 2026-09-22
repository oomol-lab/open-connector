import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const chartsOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "generate_chart",
    toolName: "generate_chart",
    description: "Generate chart with Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday generate_chart operation.",
      {
        options: s.withExamples(
          s.nonEmptyString("Serialized ECharts options Accepted by Investoday for generate_chart."),
          [
            '{"xAxis":{"type":"category","data":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},"yAxis":{"type":"value"},"series":[{"data":[120,200,150,80,70,110,130],"type":"bar"}]}',
          ],
        ),
      },
      { required: ["options"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "generate_nex_chart",
    toolName: "generate_nex_chart",
    description: "Generate nex chart with Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday generate_nex_chart operation.",
      {
        options: s.withExamples(
          s.nonEmptyString("Serialized ECharts options Accepted by Investoday for generate_nex_chart."),
          [
            ' {"xAxis":{"type":"category","data":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},"yAxis":{"type":"value"},"series":[{"data":[120,200,150,80,70,110,130],"type":"bar"}]}',
          ],
        ),
        id: s.withExamples(s.nonEmptyString("Record identifier Accepted by Investoday for generate_nex_chart."), [
          "nex-line-bar",
        ]),
      },
      { required: ["id", "options"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
