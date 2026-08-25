import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { deviceSortColumns, sensorSortColumns } from "./constants.ts";

const service = "prtg_classic";

const prtgRowSchema = s.looseObject("One row returned by the PRTG table API.");
const rawTableSchema = s.looseObject("The raw PRTG table API response.");

const statusFilterSchema = s.array(
  "PRTG raw status codes to include. Multiple status filters are sent as repeated filter_status query parameters.",
  s.integer("A PRTG raw status code.", { minimum: 1, maximum: 14 }),
  { minItems: 1 },
);

const commonTableInputFields = {
  count: s.integer("Maximum number of items to return. PRTG allows values from 1 to 50000.", {
    minimum: 1,
    maximum: 50000,
  }),
  start: s.integer("Zero-based item offset for paginated table reads.", { minimum: 0 }),
  objectId: s.integer("PRTG object ID used to restrict the table to that object and its child objects.", {
    minimum: 0,
  }),
  filterStatus: statusFilterSchema,
  sortDescending: s.boolean("Reverse the selected sortBy column by sending a leading dash."),
};

const listSensorsInputSchema = s.object(
  {
    ...commonTableInputFields,
    filterTags: s.string("Tag name or PRTG @tag(...) expression used to filter sensors by tag.", {
      minLength: 1,
    }),
    filterType: s.string("PRTG sensor type filter value or filter expression.", { minLength: 1 }),
    filterDevice: s.string("PRTG device column filter value or filter expression.", { minLength: 1 }),
    filterSensor: s.string("PRTG sensor column filter value or filter expression.", { minLength: 1 }),
    sortBy: s.stringEnum("PRTG sensor table column used for sorting.", [...sensorSortColumns]),
  },
  {
    required: [],
    description: "Query parameters for listing PRTG sensors through the classic table API.",
  },
);

const listDevicesInputSchema = s.object(
  {
    ...commonTableInputFields,
    filterHost: s.string("PRTG host column filter value or filter expression.", { minLength: 1 }),
    filterDevice: s.string("PRTG device column filter value or filter expression.", { minLength: 1 }),
    sortBy: s.stringEnum("PRTG device table column used for sorting.", [...deviceSortColumns]),
  },
  {
    required: [],
    description: "Query parameters for listing PRTG devices through the classic table API.",
  },
);

const tableOutputFields = {
  treeSize: s.integer("Total number of matching PRTG table rows when provided by PRTG.", { minimum: 0 }),
  prtgVersion: s.string("PRTG server version string when included in the API response."),
  raw: rawTableSchema,
};

const listSensorsOutputSchema = s.object(
  {
    ...tableOutputFields,
    sensors: s.array("Sensor rows returned by PRTG.", prtgRowSchema),
  },
  {
    required: ["sensors", "raw"],
    description: "A PRTG sensors table page.",
  },
);

const listDevicesOutputSchema = s.object(
  {
    ...tableOutputFields,
    devices: s.array("Device rows returned by PRTG.", prtgRowSchema),
  },
  {
    required: ["devices", "raw"],
    description: "A PRTG devices table page.",
  },
);

export const prtgClassicActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sensors",
    description: "List PRTG sensors with status, message, and last value fields from the classic table API.",
    inputSchema: listSensorsInputSchema,
    outputSchema: listSensorsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_devices",
    description: "List PRTG devices with host, status, and message fields from the classic table API.",
    inputSchema: listDevicesInputSchema,
    outputSchema: listDevicesOutputSchema,
  }),
];
