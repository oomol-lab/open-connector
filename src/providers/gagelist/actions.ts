import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gagelist";

const rawObjectSchema = s.looseObject("The raw object returned by GageList.");
const messageSchema = s.nullable(s.string("The message returned by GageList when present."));

const positiveIdSchema = s.positiveInteger("The GageList record identifier.");
const startSchema = s.nonNegativeInteger("The zero-based record offset for a GageList list query.");
const recordNumberSchema = s.positiveInteger("The number of records to return from GageList.");

const listInputSchema = s.object(
  "The pagination input for a GageList list query.",
  {
    start: startSchema,
    recordNumber: recordNumberSchema,
  },
  { optional: ["start", "recordNumber"] },
);

const accountStatusAction = defineProviderAction(service, {
  name: "get_account_status",
  operationType: "read",
  description: "Get general status and usage information for the connected GageList account.",
  inputSchema: s.object("This action does not require input fields.", {}),
  outputSchema: s.requiredObject("The connected GageList account status.", {
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    siteName: s.nullable(s.string("The requested site name returned by GageList.")),
    enterpriseName: s.nullable(s.string("The enterprise name returned by GageList.")),
    roles: s.array("The role names returned for the connected account.", s.string("A role name.")),
    accountStatus: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

const accountSettingsAction = defineProviderAction(service, {
  name: "get_account_settings",
  operationType: "read",
  description: "Get configurable account settings for the connected GageList account.",
  inputSchema: s.object("This action does not require input fields.", {}),
  outputSchema: s.requiredObject("The connected GageList account settings.", {
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    settings: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

const manufacturerSchema = s.requiredObject("A normalized GageList manufacturer record.", {
  id: s.nullable(s.integer("The manufacturer identifier.")),
  name: s.nullable(s.string("The manufacturer name.")),
  address: s.nullable(s.string("The manufacturer address.")),
  phone: s.nullable(s.string("The manufacturer phone number.")),
  fax: s.nullable(s.string("The manufacturer fax number.")),
  website: s.nullable(s.string("The manufacturer website.")),
  isDeleted: s.nullable(s.boolean("Whether GageList marks this manufacturer as deleted.")),
  updatedDate: s.nullable(s.string("The manufacturer update timestamp returned by GageList.")),
  raw: rawObjectSchema,
});

const manufacturerFieldsSchema = {
  name: s.nonEmptyString("The manufacturer name."),
  address: s.string("The manufacturer address."),
  phone: s.string("The manufacturer phone number."),
  fax: s.string("The manufacturer fax number."),
  website: s.string("The manufacturer website."),
};

const listManufacturersAction = defineProviderAction(service, {
  name: "list_manufacturers",
  operationType: "read",
  description: "List manufacturers configured in the connected GageList account.",
  inputSchema: s.object("This action does not require input fields.", {}),
  outputSchema: s.requiredObject("The GageList manufacturer list response.", {
    total: s.nullable(s.integer("The total number of matching manufacturers reported by GageList.")),
    count: s.nullable(s.integer("The number of manufacturers returned in this response.")),
    manufacturers: s.array("The manufacturers returned by GageList.", manufacturerSchema),
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const createManufacturerAction = defineProviderAction(service, {
  name: "create_manufacturer",
  operationType: "write",
  description: "Create a manufacturer record in the connected GageList account.",
  inputSchema: s.object("The manufacturer fields sent to GageList.", manufacturerFieldsSchema, {
    optional: ["address", "phone", "fax", "website"],
  }),
  outputSchema: s.requiredObject("The GageList create manufacturer response.", {
    id: s.nullable(s.integer("The identifier returned for the created manufacturer.")),
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const updateManufacturerAction = defineProviderAction(service, {
  name: "update_manufacturer",
  operationType: "write",
  description: "Update a manufacturer record in the connected GageList account.",
  inputSchema: s.object(
    "The manufacturer update fields sent to GageList.",
    {
      id: positiveIdSchema,
      ...manufacturerFieldsSchema,
    },
    { optional: ["address", "phone", "fax", "website"] },
  ),
  outputSchema: s.requiredObject("The GageList update manufacturer response.", {
    id: s.nullable(s.integer("The identifier returned for the updated manufacturer.")),
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const deleteManufacturerAction = defineProviderAction(service, {
  name: "delete_manufacturer",
  operationType: "destructive",
  description: "Delete a manufacturer record from the connected GageList account.",
  inputSchema: s.requiredObject("The manufacturer delete input.", {
    id: positiveIdSchema,
  }),
  outputSchema: s.requiredObject("The GageList delete manufacturer response.", {
    id: s.nullable(s.integer("The identifier returned for the deleted manufacturer.")),
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const gageRecordSchema = s.requiredObject("A normalized GageList gage record.", {
  id: s.nullable(s.integer("The gage record identifier.")),
  serialNumber: s.nullable(s.string("The gage serial number.")),
  controlNumber: s.nullable(s.string("The gage control number.")),
  status: s.nullable(s.string("The gage status.")),
  manufacturer: s.nullable(s.string("The gage manufacturer name.")),
  model: s.nullable(s.string("The gage model.")),
  calibrationDueDate: s.nullable(s.string("The next calibration due timestamp.")),
  raw: rawObjectSchema,
});

const listGageRecordsAction = defineProviderAction(service, {
  name: "list_gage_records",
  operationType: "read",
  description: "List gage records in the connected GageList account.",
  inputSchema: listInputSchema,
  outputSchema: s.requiredObject("The GageList gage record list response.", {
    total: s.nullable(s.integer("The total number of matching gage records reported by GageList.")),
    count: s.nullable(s.integer("The number of gage records returned in this response.")),
    gageRecords: s.array("The gage records returned by GageList.", gageRecordSchema),
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const getGageRecordAction = defineProviderAction(service, {
  name: "get_gage_record",
  operationType: "read",
  description: "Get one gage record by identifier from the connected GageList account.",
  inputSchema: s.requiredObject("The gage record lookup input.", {
    id: positiveIdSchema,
  }),
  outputSchema: s.requiredObject("The GageList gage record detail response.", {
    gageRecord: gageRecordSchema,
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const calibrationRecordSchema = s.requiredObject("A normalized GageList calibration record.", {
  id: s.nullable(s.integer("The calibration record identifier.")),
  recordNumber: s.nullable(s.string("The calibration record number.")),
  equipmentRefId: s.nullable(s.integer("The related gage equipment identifier.")),
  serialNumber: s.nullable(s.string("The related equipment serial number.")),
  controlNumber: s.nullable(s.string("The related equipment control number.")),
  calibrationDate: s.nullable(s.string("The calibration timestamp.")),
  nextCalibrationDue: s.nullable(s.string("The next calibration due timestamp.")),
  raw: rawObjectSchema,
});

const listCalibrationRecordsAction = defineProviderAction(service, {
  name: "list_calibration_records",
  operationType: "read",
  description: "List calibration records in the connected GageList account.",
  inputSchema: listInputSchema,
  outputSchema: s.requiredObject("The GageList calibration record list response.", {
    total: s.nullable(s.integer("The total number of matching calibration records reported by GageList.")),
    count: s.nullable(s.integer("The number of calibration records returned in this response.")),
    calibrationRecords: s.array("The calibration records returned by GageList.", calibrationRecordSchema),
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

const getCalibrationRecordAction = defineProviderAction(service, {
  name: "get_calibration_record",
  operationType: "read",
  description: "Get one calibration record by identifier from the connected GageList account.",
  inputSchema: s.requiredObject("The calibration record lookup input.", {
    id: positiveIdSchema,
  }),
  outputSchema: s.requiredObject("The GageList calibration record detail response.", {
    calibrationRecord: calibrationRecordSchema,
    success: s.boolean("Whether GageList reported the operation as successful."),
    message: messageSchema,
    raw: rawObjectSchema,
  }),
});

export const gagelistActions: ActionDefinition[] = [
  accountStatusAction,
  accountSettingsAction,
  listManufacturersAction,
  createManufacturerAction,
  updateManufacturerAction,
  deleteManufacturerAction,
  listGageRecordsAction,
  getGageRecordAction,
  listCalibrationRecordsAction,
  getCalibrationRecordAction,
];
