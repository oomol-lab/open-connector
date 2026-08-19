import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { wejamAiExportResourceValues } from "./constants.ts";

const service = "wejam_ai";

const exportResourceSchema = s.stringEnum("The Jam data-export resource to retrieve.", [
  ...wejamAiExportResourceValues,
]);

const paginationMetaSchema = s.object("Jam pagination metadata for a data-export page.", {
  total: s.number("The total number of records matching the export request."),
  page: s.number("The one-indexed page number returned by Jam."),
  limit: s.number("The page size returned by Jam."),
  hasNext: s.boolean("Whether another page exists after this response."),
});

const dataExportRecordSchema = s.looseObject("One Jam data-export record.");

export const wejamAiActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "export_data",
    description: "Export one page of Jam training data for reporting or BI workflows.",
    inputSchema: s.actionInput(
      {
        resource: exportResourceSchema,
        page: s.integer("The one-indexed page number to return. Jam defaults to 1.", {
          minimum: 1,
        }),
        limit: s.integer("The number of records to return. Jam allows 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      ["resource"],
      "The input payload for exporting Jam training data.",
    ),
    outputSchema: s.actionOutput(
      {
        resource: exportResourceSchema,
        data: s.array("The records returned for the requested Jam data-export resource.", dataExportRecordSchema),
        meta: paginationMetaSchema,
      },
      "A page of Jam data-export records.",
    ),
  }),
] as const;
