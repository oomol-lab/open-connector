import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "microsoft_clarity";

const clarityDimensions = [
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
];
const clarityDimensionSchema = s.stringEnum(
  "A Microsoft Clarity dimension used to break down the exported insight rows.",
  clarityDimensions,
);
const numOfDaysSchema = s.union(
  [
    s.literal(1, { description: "Export the last 24 hours." }),
    s.literal(2, { description: "Export the last 48 hours." }),
    s.literal(3, { description: "Export the last 72 hours." }),
  ],
  {
    description: "The number of days to export. Use 1, 2, or 3 for the last 24, 48, or 72 hours.",
  },
);
const insightRowSchema = s.looseObject(
  "One Microsoft Clarity insight row that contains metric values and dimension fields.",
);
const insightSchema = s.object(
  "One metric group returned by the Microsoft Clarity Data Export API.",
  {
    metricName: s.nonEmptyString("The metric group name returned by Microsoft Clarity."),
    information: s.array("The rows returned for this metric group.", insightRowSchema),
  },
  { additionalProperties: true },
);

export const microsoftClarityActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "export_live_insights",
    operationType: "write",
    description:
      "Export Microsoft Clarity live insights for the last 1 to 3 days with up to three optional breakdown dimensions.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for exporting Microsoft Clarity live insights.",
      {
        numOfDays: numOfDaysSchema,
        dimension1: {
          ...clarityDimensionSchema,
          description: "The first optional dimension used to break down the exported insights.",
        },
        dimension2: {
          ...clarityDimensionSchema,
          description: "The second optional dimension used to break down the exported insights.",
        },
        dimension3: {
          ...clarityDimensionSchema,
          description: "The third optional dimension used to break down the exported insights.",
        },
      },
      { required: ["numOfDays"], optional: ["dimension1", "dimension2", "dimension3"] },
    ),
    outputSchema: s.requiredObject("The exported Microsoft Clarity live insights.", {
      insights: s.array("The metric groups returned by the Microsoft Clarity Data Export API.", insightSchema),
    }),
  }),
];
