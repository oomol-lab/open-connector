import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apaleo";

const apaleoPropertyCreateScope = "apaleo.properties.create";
const apaleoPropertyManageScope = "apaleo.properties.manage";
const apaleoUnitReadScope = "apaleo.units.read";
const apaleoUnitCreateScope = "apaleo.units.create";
const apaleoUnitDeleteScope = "apaleo.units.delete";
const apaleoUnitGroupReadScope = "apaleo.unit_groups.read";
const apaleoUnitGroupCreateScope = "apaleo.unit_groups.create";
const apaleoUnitGroupManageScope = "apaleo.unit_groups.manage";
const apaleoUnitGroupDeleteScope = "apaleo.unit_groups.delete";
const apaleoUnitAttributeReadScope = "apaleo.unit_attributes.read";
const apaleoUnitAttributeCreateScope = "apaleo.unit_attributes.create";
const apaleoUnitAttributeDeleteScope = "apaleo.unit_attributes.delete";

const setupReadPermissions = ["setup.read"] as const;
const setupManagePermissions = ["setup.manage"] as const;
const propertyCreatePermissions = setupManagePermissions;
const propertyManagePermissions = setupManagePermissions;
const unitReadPermissions = setupReadPermissions;
const unitCreatePermissions = setupManagePermissions;
const unitDeletePermissions = setupManagePermissions;
const unitGroupReadPermissions = setupReadPermissions;
const unitGroupCreatePermissions = setupManagePermissions;
const unitGroupManagePermissions = setupManagePermissions;
const unitGroupDeletePermissions = setupManagePermissions;
const unitAttributeReadPermissions = setupReadPermissions;
const unitAttributeCreatePermissions = setupManagePermissions;
const unitAttributeDeletePermissions = setupManagePermissions;

const positiveIntegerOptions = {
  minimum: 1,
} as const;
const propertyStatusValues = ["Test", "Live"] as const;
const unitConditionValues = ["Clean", "CleanToBeInspected", "Dirty"] as const;
const maintenanceTypeValues = ["OutOfService", "OutOfOrder", "OutOfInventory"] as const;
const unitListStatusValues = ["Active", "Archived", "All"] as const;
const unitGroupTypeValues = ["BedRoom", "MeetingRoom", "EventSpace", "ParkingLot", "Other"] as const;
const createUnitGroupTypeValues = ["BedRoom", "MeetingRoom", "EventSpace", "ParkingLot"] as const;

interface ApaleoActionDefinition {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: readonly string[];
  providerPermissions?: readonly string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

function localizedTextSchema(description: string) {
  return s.record(s.string("Localized text value."), { description });
}

function integerField(description: string) {
  return s.integer(description);
}

const actionInputSchema = s.object("This action does not require any input fields.", {});
const idField = s.string("The apaleo resource ID.", { minLength: 1 });
const idempotencyKeyField = s.string("Optional idempotency key used to safely retry the request.", {
  minLength: 1,
});
const pageNumberField = s.integer("1-based page number to retrieve.", positiveIntegerOptions);
const pageSizeField = s.integer("Maximum number of items to return per page.", {
  minimum: 1,
  maximum: 500,
});
const alpha2CodeOptions = { minLength: 2, maxLength: 2, pattern: "^[A-Za-z]{2}$" } as const;
const languagesField = s.array(
  "Return all languages or the listed ISO Alpha-2 language codes.",
  s.string("Language code.", alpha2CodeOptions),
);
const propertyStatusField = s.stringEnum("Property status.", [...propertyStatusValues]);
const propertyListStatusField = s.array("Filter results by one or more property statuses.", propertyStatusField);
const includeArchivedField = s.boolean("Whether archived properties should be included.");
const countryCodesField = s.array(
  "Filter results by ISO country code.",
  s.string("ISO country code.", alpha2CodeOptions),
);
const propertyExpandField = s.array(
  "Embedded resources to expand in the property response.",
  s.stringEnum("Property expansion key.", ["actions"]),
);
const unitConditionField = s.stringEnum("Current cleanliness state of the unit.", [...unitConditionValues]);
const maintenanceTypeField = s.stringEnum("Type of scheduled maintenance.", [...maintenanceTypeValues]);
const unitListStatusField = s.stringEnum("Whether to return active units, archived units, or both.", [
  ...unitListStatusValues,
]);
const unitListExpandField = s.array(
  "Embedded resources to expand in the unit response.",
  s.stringEnum("Unit expansion key.", ["property", "unitGroup", "connectedUnits", "actions"]),
);
const unitGroupListExpandField = s.array(
  "Embedded resources to expand in the unit group response.",
  s.stringEnum("Unit group expansion key.", ["property", "connectedUnitGroups"]),
);
const unitGroupTypeField = s.stringEnum("Type of the unit group.", [...unitGroupTypeValues]);
const createUnitGroupTypeField = s.stringEnum("Type of the unit group to create.", [...createUnitGroupTypeValues]);
const locationSchema = s.object(
  "Property address details.",
  {
    addressLine1: s.string("Primary address line."),
    addressLine2: s.string("Secondary address line."),
    postalCode: s.string("Postal or ZIP code."),
    city: s.string("City name."),
    regionCode: s.string("Region or state code."),
    countryCode: s.string("ISO 3166-1 alpha-2 country code."),
  },
  { optional: ["addressLine2", "regionCode"] },
);
const bankAccountSchema = s.object(
  "Property bank account details.",
  {
    iban: s.string("International Bank Account Number."),
    bic: s.string("Bank Identifier Code."),
    bank: s.string("Name of the bank."),
  },
  { optional: ["iban", "bic", "bank"] },
);
const propertyActionReasonSchema = s.object("Reason why a property action may be disallowed.", {
  code: s.string("Machine-readable reason code."),
  message: s.string("Human-readable reason message."),
});
const propertyActionSchema = s.object(
  "Property action availability.",
  {
    action: s.stringEnum("Property action name.", ["Delete", "Archive", "SetLive", "Reset"]),
    isAllowed: s.boolean("Whether the property action is currently allowed."),
    reasons: s.array("Reasons returned when the property action is not allowed.", propertyActionReasonSchema),
  },
  { optional: ["reasons"] },
);
const propertyListItemSchema = s.object(
  "Property summary returned by list endpoints.",
  {
    id: s.string("Property ID."),
    code: s.string("Short property code."),
    propertyTemplateId: s.string("Template property ID used to create this property."),
    isTemplate: s.boolean("Whether this property can be used as a template."),
    name: s.string("Property name in the selected response language."),
    description: s.string("Property description in the selected response language."),
    companyName: s.string("Legal company name for the property."),
    managingDirectors: s.string("Managing directors shown on invoices."),
    commercialRegisterEntry: s.string("Commercial register entry shown on invoices."),
    taxId: s.string("Tax identification number shown on invoices."),
    location: locationSchema,
    bankAccount: bankAccountSchema,
    paymentTerms: localizedTextSchema("Localized payment terms used by the property."),
    timeZone: s.string("IANA time zone name."),
    currencyCode: s.string("ISO 4217 currency code."),
    created: s.string("Property creation timestamp in ISO 8601 format."),
    status: propertyStatusField,
    isArchived: s.boolean("Whether the property is archived."),
    actions: s.array("Available actions for the property.", propertyActionSchema),
  },
  {
    optional: ["propertyTemplateId", "description", "managingDirectors", "bankAccount", "actions"],
  },
);
const propertySchema = s.object(
  "Full property record.",
  {
    id: s.string("Property ID."),
    code: s.string("Short property code."),
    propertyTemplateId: s.string("Template property ID used to create this property."),
    isTemplate: s.boolean("Whether this property can be used as a template."),
    name: localizedTextSchema("Localized property name."),
    description: localizedTextSchema("Localized property description."),
    companyName: s.string("Legal company name for the property."),
    managingDirectors: s.string("Managing directors shown on invoices."),
    commercialRegisterEntry: s.string("Commercial register entry shown on invoices."),
    taxId: s.string("Tax identification number shown on invoices."),
    location: locationSchema,
    bankAccount: bankAccountSchema,
    paymentTerms: localizedTextSchema("Localized payment terms used by the property."),
    timeZone: s.string("IANA time zone name."),
    currencyCode: s.string("ISO 4217 currency code."),
    created: s.string("Property creation timestamp in ISO 8601 format."),
    status: propertyStatusField,
    isArchived: s.boolean("Whether the property is archived."),
    actions: s.array("Available actions for the property.", propertyActionSchema),
  },
  {
    optional: ["propertyTemplateId", "description", "managingDirectors", "bankAccount", "actions"],
  },
);
const embeddedPropertySchema = s.object(
  "Embedded property summary.",
  {
    id: s.string("Property ID."),
    code: s.string("Short property code."),
    name: s.string("Property name in the selected response language."),
    description: s.string("Property description in the selected response language."),
  },
  { optional: ["code", "name", "description"] },
);
const embeddedUnitGroupSchema = s.object(
  "Embedded unit group summary.",
  {
    id: s.string("Unit group ID."),
    code: s.string("Short unit group code."),
    name: s.string("Unit group name in the selected response language."),
    description: s.string("Unit group description in the selected response language."),
    type: unitGroupTypeField,
  },
  { optional: ["code", "name", "description", "type"] },
);
const embeddedConnectingUnitSchema = s.object(
  "Embedded connecting unit data.",
  {
    id: s.string("Unit ID."),
    name: s.string("Unit name."),
    description: s.string("Unit description."),
    unitGroupId: s.string("Unit group ID."),
  },
  { optional: ["name", "description", "unitGroupId"] },
);
const unitAttributeSchema = s.object(
  "Unit attribute attached to a unit.",
  {
    id: s.string("Unit attribute ID."),
    name: s.string("Unit attribute name."),
    description: s.string("Unit attribute description."),
  },
  { optional: ["description"] },
);
const connectedUnitSchema = s.object("Connected unit summary.", {
  id: s.string("Connected unit ID."),
  name: s.string("Connected unit name."),
  description: s.string("Connected unit description."),
  unitGroupId: s.string("Connected unit group ID."),
  condition: unitConditionField,
  maxPersons: integerField("Maximum occupancy of the connected unit."),
});
const unitListMaintenanceSchema = s.object("Scheduled maintenance summary for the unit.", {
  id: s.string("Scheduled maintenance ID."),
  type: maintenanceTypeField,
});
const unitMaintenanceSchema = s.object(
  "Scheduled maintenance details for the unit.",
  {
    id: s.string("Scheduled maintenance ID."),
    from: s.string("Maintenance start timestamp in ISO 8601 format."),
    to: s.string("Maintenance end timestamp in ISO 8601 format."),
    type: maintenanceTypeField,
    description: s.string("Maintenance description."),
  },
  { optional: ["description"] },
);
const unitListStatusSchema = s.object(
  "Current unit status returned by unit list endpoints.",
  {
    isOccupied: s.boolean("Whether the unit is currently occupied."),
    condition: unitConditionField,
    maintenance: unitListMaintenanceSchema,
  },
  { optional: ["maintenance"] },
);
const unitStatusSchema = s.object(
  "Current unit status returned by single-unit reads.",
  {
    isOccupied: s.boolean("Whether the unit is currently occupied."),
    condition: unitConditionField,
    maintenance: unitMaintenanceSchema,
  },
  { optional: ["maintenance"] },
);
const unitActionSchema = s.object(
  "Unit action availability.",
  {
    action: s.stringEnum("Unit action name.", ["Delete", "Archive"]),
    isAllowed: s.boolean("Whether the unit action is currently allowed."),
    reasons: s.array("Reasons returned when the unit action is not allowed.", propertyActionReasonSchema),
  },
  { optional: ["reasons"] },
);
const unitListItemSchema = s.object(
  "Unit summary returned by list endpoints.",
  {
    id: s.string("Unit ID."),
    name: s.string("Unit name."),
    description: s.string("Unit description in the selected response language."),
    property: embeddedPropertySchema,
    unitGroup: embeddedUnitGroupSchema,
    connectingUnit: embeddedConnectingUnitSchema,
    status: unitListStatusSchema,
    maxPersons: integerField("Maximum occupancy of the unit."),
    created: s.string("Unit creation timestamp in ISO 8601 format."),
    archived: s.string("Archive timestamp in ISO 8601 format."),
    isArchived: s.boolean("Whether the unit is archived."),
    attributes: s.array("Unit attributes assigned to the unit.", unitAttributeSchema),
    connectedUnits: s.array("Units that compose this combined unit.", connectedUnitSchema),
    actions: s.array("Available actions for the unit.", unitActionSchema),
  },
  {
    optional: ["unitGroup", "connectingUnit", "archived", "isArchived", "attributes", "connectedUnits", "actions"],
  },
);
const unitSchema = s.object(
  "Full unit record.",
  {
    id: s.string("Unit ID."),
    name: s.string("Unit name."),
    description: localizedTextSchema("Localized unit description."),
    property: embeddedPropertySchema,
    unitGroup: embeddedUnitGroupSchema,
    connectingUnit: embeddedConnectingUnitSchema,
    status: unitStatusSchema,
    maxPersons: integerField("Maximum occupancy of the unit."),
    created: s.string("Unit creation timestamp in ISO 8601 format."),
    archived: s.string("Archive timestamp in ISO 8601 format."),
    isArchived: s.boolean("Whether the unit is archived."),
    attributes: s.array("Unit attributes assigned to the unit.", unitAttributeSchema),
    connectedUnits: s.array("Units that compose this combined unit.", connectedUnitSchema),
    actions: s.array("Available actions for the unit.", unitActionSchema),
  },
  {
    optional: ["unitGroup", "connectingUnit", "archived", "isArchived", "attributes", "connectedUnits", "actions"],
  },
);
const connectedUnitGroupSchema = s.object(
  "Connected unit group summary.",
  {
    id: s.string("Connected unit group ID."),
    name: s.string("Connected unit group name."),
    description: s.string("Connected unit group description."),
    memberCount: integerField("Number of units taken from the connected unit group."),
    maxPersons: integerField("Maximum occupancy of the connected unit group."),
  },
  { optional: ["maxPersons"] },
);
const unitGroupListItemSchema = s.object(
  "Unit group summary returned by list endpoints.",
  {
    id: s.string("Unit group ID."),
    code: s.string("Short unit group code."),
    name: s.string("Unit group name in the selected response language."),
    description: s.string("Unit group description in the selected response language."),
    memberCount: integerField("Number of units in the unit group."),
    maxPersons: integerField("Maximum occupancy of the unit group."),
    rank: integerField("Sort rank of the unit group."),
    type: unitGroupTypeField,
    property: embeddedPropertySchema,
    connectedUnitGroups: s.array("Connected unit groups used by this unit group.", connectedUnitGroupSchema),
  },
  { optional: ["maxPersons", "rank", "connectedUnitGroups"] },
);
const unitGroupSchema = s.object(
  "Full unit group record.",
  {
    id: s.string("Unit group ID."),
    code: s.string("Short unit group code."),
    property: embeddedPropertySchema,
    name: localizedTextSchema("Localized unit group name."),
    memberCount: integerField("Number of units in the unit group."),
    description: localizedTextSchema("Localized unit group description."),
    maxPersons: integerField("Maximum occupancy of the unit group."),
    rank: integerField("Sort rank of the unit group."),
    type: unitGroupTypeField,
    connectedUnitGroups: s.array("Connected unit groups used by this unit group.", connectedUnitGroupSchema),
  },
  { optional: ["rank", "connectedUnitGroups"] },
);
const unitAttributeDefinitionSchema = s.object(
  "Unit attribute definition.",
  {
    id: s.string("Unit attribute definition ID."),
    name: s.string("Unit attribute definition name."),
    description: s.string("Unit attribute definition description."),
  },
  { optional: ["description"] },
);
const idOutputSchema = s.object("Identifier payload returned by a create request.", {
  id: s.string("Identifier returned by the successful create request."),
});
const idsOutputSchema = s.object("Bulk create result.", {
  ids: s.array("Identifiers returned by the bulk create request.", s.string("Created resource ID.")),
});
const successSchema = s.object("Successful no-content operation result.", {
  success: s.boolean("Whether the operation completed successfully."),
});
const existsSchema = s.object("Existence check result.", {
  exists: s.boolean("Whether the requested resource currently exists."),
});
const countSchema = s.object("Count response.", {
  count: integerField("Total count returned by apaleo."),
});
const countryListSchema = s.object("Supported country list.", {
  countryCodes: s.array("Supported ISO country codes.", s.string("Supported ISO country code.")),
});
const propertyListSchema = s.object("Paginated property list.", {
  count: integerField("Total number of matching properties."),
  properties: s.array("Properties returned for the current page.", propertyListItemSchema),
});
const unitListSchema = s.object("Paginated unit list.", {
  count: integerField("Total number of matching units."),
  units: s.array("Units returned for the current page.", unitListItemSchema),
});
const unitGroupListSchema = s.object("Paginated unit group list.", {
  count: integerField("Total number of matching unit groups."),
  unitGroups: s.array("Unit groups returned for the current page.", unitGroupListItemSchema),
});
const unitAttributeListSchema = s.object("Paginated unit attribute list.", {
  count: integerField("Total number of matching unit attributes."),
  unitAttributes: s.array("Unit attributes returned for the current page.", unitAttributeDefinitionSchema),
});
const createPropertyProperties = {
  code: s.string("Property code shown in reports and table views.", {
    minLength: 3,
    maxLength: 10,
  }),
  name: localizedTextSchema("Localized property name."),
  companyName: s.string("Legal company name for the property.", { minLength: 1 }),
  managingDirectors: s.string("Managing directors shown on invoices."),
  commercialRegisterEntry: s.string("Commercial register entry shown on invoices.", {
    minLength: 1,
  }),
  taxId: s.string("Tax identification number shown on invoices.", { minLength: 1 }),
  description: localizedTextSchema("Localized property description."),
  location: s.object(
    "Property address used during creation.",
    {
      addressLine1: s.string("Primary address line.", { minLength: 1 }),
      addressLine2: s.string("Secondary address line."),
      postalCode: s.string("Postal or ZIP code.", { minLength: 1 }),
      city: s.string("City name.", { minLength: 1 }),
      regionCode: s.string("ISO 3166-2 region code.", { minLength: 2, maxLength: 6 }),
      countryCode: s.string("ISO 3166-1 alpha-2 country code.", { minLength: 2, maxLength: 2 }),
    },
    { optional: ["addressLine2", "regionCode"] },
  ),
  bankAccount: bankAccountSchema,
  paymentTerms: localizedTextSchema("Localized payment terms used by the property."),
  timeZone: s.string("IANA time zone name.", { minLength: 1 }),
  defaultCheckInTime: s.string("Default check-in time in ISO 8601 time format."),
  defaultCheckOutTime: s.string("Default check-out time in ISO 8601 time format."),
  currencyCode: s.string("ISO 4217 currency code."),
} satisfies Record<string, JsonSchema>;
const createConnectedUnitSchema = s.object("Connected unit reference used during unit creation.", {
  unitId: s.string("ID of a unit used inside a combined unit."),
});
const createUnitAttributeReferenceSchema = s.object("Unit attribute reference used during unit creation.", {
  id: s.string("Unit attribute definition ID."),
});
const createUnitProperties = {
  propertyId: s.string("Property ID where the unit should be created."),
  name: s.string("Unit name.", { minLength: 1 }),
  description: localizedTextSchema("Localized unit description."),
  unitGroupId: s.string("Unit group ID for the new unit."),
  maxPersons: s.integer("Maximum occupancy of the unit.", positiveIntegerOptions),
  condition: unitConditionField,
  attributes: s.array("Unit attributes assigned to the unit.", createUnitAttributeReferenceSchema),
  connectedUnits: s.array("Units used to compose this combined unit.", createConnectedUnitSchema),
} satisfies Record<string, JsonSchema>;
const createConnectedUnitGroupSchema = s.object(
  "Connected unit group reference used during unit group creation or replacement.",
  {
    unitGroupId: s.string("Connected unit group ID."),
    memberCount: s.integer("Number of units to take from that unit group.", positiveIntegerOptions),
  },
);
const createUnitGroupProperties = {
  code: s.string("Unit group code shown in reports and table views.", {
    minLength: 3,
    maxLength: 10,
  }),
  propertyId: s.string("Property ID where the unit group should be created."),
  name: localizedTextSchema("Localized unit group name."),
  description: localizedTextSchema("Localized unit group description."),
  maxPersons: s.integer("Maximum occupancy of the unit group.", positiveIntegerOptions),
  rank: s.integer("Sort rank of the unit group.", positiveIntegerOptions),
  type: createUnitGroupTypeField,
  connectedUnitGroups: s.array("Connected unit groups used by the new unit group.", createConnectedUnitGroupSchema),
} satisfies Record<string, JsonSchema>;
const replaceUnitGroupBodyProperties = {
  name: localizedTextSchema("Localized unit group name."),
  description: localizedTextSchema("Localized unit group description."),
  maxPersons: integerField("Maximum occupancy of the unit group."),
  rank: s.integer("Sort rank of the unit group.", positiveIntegerOptions),
  connectedUnitGroups: s.array(
    "Connected unit groups used by the replaced unit group.",
    createConnectedUnitGroupSchema,
  ),
} satisfies Record<string, JsonSchema>;
const createUnitAttributeProperties = {
  name: s.string("Name of the unit attribute definition.", { minLength: 1, maxLength: 50 }),
  description: s.string("Description of the unit attribute definition."),
} satisfies Record<string, JsonSchema>;
const listUnitsFilterProperties = {
  propertyId: s.string("Return units for the specified property ID."),
  unitGroupId: s.string("Deprecated single unit group filter kept for compatibility."),
  unitGroupIds: s.array("Return units for the specified unit group IDs.", s.string("Unit group ID.")),
  unitAttributeIds: s.array("Return units that have the specified unit attribute IDs.", s.string("Unit attribute ID.")),
  isOccupied: s.boolean("Filter by occupied or vacant units."),
  maintenanceType: maintenanceTypeField,
  condition: unitConditionField,
  textSearch: s.string("Case-insensitive search term matched against the unit name."),
  status: unitListStatusField,
} satisfies Record<string, JsonSchema>;
const listUnitsFilterSchema = s.object(
  "Common filters accepted by unit list and count actions.",
  listUnitsFilterProperties,
  {
    optional: [
      "propertyId",
      "unitGroupId",
      "unitGroupIds",
      "unitAttributeIds",
      "isOccupied",
      "maintenanceType",
      "condition",
      "textSearch",
      "status",
    ],
  },
);
const idInputSchemas = {
  checkProperty: s.object("Input payload for checking whether a property exists.", { id: idField }),
  archiveProperty: s.object("Input payload for archiving a property.", { id: idField }),
  movePropertyToLive: s.object("Input payload for moving a property to live.", { id: idField }),
  resetPropertyData: s.object("Input payload for resetting a property.", { id: idField }),
  checkUnit: s.object("Input payload for checking whether a unit exists.", { id: idField }),
  deleteUnit: s.object("Input payload for deleting a unit.", { id: idField }),
  checkUnitGroup: s.object("Input payload for checking whether a unit group exists.", {
    id: idField,
  }),
  deleteUnitGroup: s.object("Input payload for deleting a unit group.", { id: idField }),
  getUnitAttribute: s.object("Input payload for retrieving one unit attribute.", { id: idField }),
  checkUnitAttribute: s.object("Input payload for checking whether a unit attribute exists.", {
    id: idField,
  }),
  deleteUnitAttribute: s.object("Input payload for deleting a unit attribute.", { id: idField }),
} as const;

const apaleoActionDefinitions: readonly ApaleoActionDefinition[] = [
  {
    name: "list_properties",
    operationType: "read",
    description:
      "List properties accessible to the connected apaleo account, with optional status, archive, country, and expansion filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for listing properties.",
      {
        status: propertyListStatusField,
        includeArchived: includeArchivedField,
        countryCode: countryCodesField,
        pageNumber: pageNumberField,
        pageSize: pageSizeField,
        expand: propertyExpandField,
      },
      {
        optional: ["status", "includeArchived", "countryCode", "pageNumber", "pageSize", "expand"],
      },
    ),
    outputSchema: propertyListSchema,
  },
  {
    name: "count_properties",
    operationType: "read",
    description: "Return the total number of properties accessible to the connected apaleo account.",
    requiredScopes: [],
    inputSchema: actionInputSchema,
    outputSchema: countSchema,
  },
  {
    name: "get_property",
    operationType: "read",
    description: "Get one property by ID, including optional localized fields and expanded actions.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for retrieving one property.",
      { id: idField, languages: languagesField, expand: propertyExpandField },
      { optional: ["languages", "expand"] },
    ),
    outputSchema: propertySchema,
  },
  {
    name: "check_property_exists",
    operationType: "read",
    description: "Check whether a property exists by ID.",
    requiredScopes: [],
    inputSchema: idInputSchemas.checkProperty,
    outputSchema: existsSchema,
  },
  {
    name: "create_property",
    operationType: "write",
    description: "Create a new property in apaleo.",
    requiredScopes: [apaleoPropertyCreateScope],
    providerPermissions: propertyCreatePermissions,
    inputSchema: s.object(
      "Input payload for creating a property.",
      { ...createPropertyProperties, idempotencyKey: idempotencyKeyField },
      { optional: ["managingDirectors", "description", "bankAccount", "idempotencyKey"] },
    ),
    outputSchema: idOutputSchema,
  },
  {
    name: "clone_property",
    operationType: "write",
    description: "Clone an existing property into a new property with inventory and rate plans.",
    requiredScopes: [apaleoPropertyCreateScope],
    providerPermissions: propertyCreatePermissions,
    inputSchema: s.object(
      "Input payload for cloning a property.",
      { ...createPropertyProperties, id: idField, idempotencyKey: idempotencyKeyField },
      { optional: ["managingDirectors", "description", "bankAccount", "idempotencyKey"] },
    ),
    outputSchema: idOutputSchema,
  },
  {
    name: "archive_property",
    operationType: "destructive",
    description: "Archive a live property by ID.",
    requiredScopes: [apaleoPropertyManageScope],
    providerPermissions: propertyManagePermissions,
    inputSchema: idInputSchemas.archiveProperty,
    outputSchema: successSchema,
  },
  {
    name: "move_property_to_live",
    operationType: "write",
    description: "Move a test property to live status.",
    requiredScopes: [apaleoPropertyManageScope],
    providerPermissions: propertyManagePermissions,
    inputSchema: idInputSchemas.movePropertyToLive,
    outputSchema: successSchema,
  },
  {
    name: "reset_property_data",
    operationType: "destructive",
    description: "Delete all transactional data for a test property.",
    requiredScopes: [apaleoPropertyManageScope],
    providerPermissions: propertyManagePermissions,
    inputSchema: idInputSchemas.resetPropertyData,
    outputSchema: successSchema,
  },
  {
    name: "list_supported_countries",
    operationType: "read",
    description: "List ISO country codes supported by apaleo property creation.",
    requiredScopes: [],
    inputSchema: actionInputSchema,
    outputSchema: countryListSchema,
  },
  {
    name: "list_units",
    operationType: "read",
    description:
      "List units with filters for property, unit group, attributes, occupancy, maintenance state, archive state, and expansions.",
    requiredScopes: [apaleoUnitReadScope],
    providerPermissions: unitReadPermissions,
    inputSchema: s.object(
      "Input payload for listing units.",
      {
        ...listUnitsFilterProperties,
        pageNumber: pageNumberField,
        pageSize: pageSizeField,
        expand: unitListExpandField,
      },
      {
        optional: [
          "propertyId",
          "unitGroupId",
          "unitGroupIds",
          "unitAttributeIds",
          "isOccupied",
          "maintenanceType",
          "condition",
          "textSearch",
          "status",
          "pageNumber",
          "pageSize",
          "expand",
        ],
      },
    ),
    outputSchema: unitListSchema,
  },
  {
    name: "count_units",
    operationType: "read",
    description: "Return the total number of units matching the provided filters.",
    requiredScopes: [apaleoUnitReadScope],
    providerPermissions: unitReadPermissions,
    inputSchema: listUnitsFilterSchema,
    outputSchema: countSchema,
  },
  {
    name: "get_unit",
    operationType: "read",
    description: "Get one unit by ID, including optional localized fields and expansions.",
    requiredScopes: [apaleoUnitReadScope],
    providerPermissions: unitReadPermissions,
    inputSchema: s.object(
      "Input payload for retrieving one unit.",
      { id: idField, languages: languagesField, expand: unitListExpandField },
      { optional: ["languages", "expand"] },
    ),
    outputSchema: unitSchema,
  },
  {
    name: "check_unit_exists",
    operationType: "read",
    description: "Check whether a unit exists by ID.",
    requiredScopes: [apaleoUnitReadScope],
    providerPermissions: unitReadPermissions,
    inputSchema: idInputSchemas.checkUnit,
    outputSchema: existsSchema,
  },
  {
    name: "create_unit",
    operationType: "write",
    description: "Create a new unit.",
    requiredScopes: [apaleoUnitCreateScope],
    providerPermissions: unitCreatePermissions,
    inputSchema: s.object(
      "Input payload for creating a unit.",
      { ...createUnitProperties, idempotencyKey: idempotencyKeyField },
      { optional: ["unitGroupId", "condition", "attributes", "connectedUnits", "idempotencyKey"] },
    ),
    outputSchema: idOutputSchema,
  },
  {
    name: "create_multiple_units",
    operationType: "write",
    description: "Create multiple units in a single bulk request.",
    requiredScopes: [apaleoUnitCreateScope],
    providerPermissions: unitCreatePermissions,
    inputSchema: s.object(
      "Input payload for creating multiple units.",
      {
        units: s.array(
          "Units to create in bulk.",
          s.object("Unit definition accepted by apaleo.", createUnitProperties, {
            optional: ["unitGroupId", "condition", "attributes", "connectedUnits"],
          }),
          { minItems: 1 },
        ),
        idempotencyKey: idempotencyKeyField,
      },
      { optional: ["idempotencyKey"] },
    ),
    outputSchema: idsOutputSchema,
  },
  {
    name: "delete_unit",
    operationType: "destructive",
    description: "Delete a unit by ID.",
    requiredScopes: [apaleoUnitDeleteScope],
    providerPermissions: unitDeletePermissions,
    inputSchema: idInputSchemas.deleteUnit,
    outputSchema: successSchema,
  },
  {
    name: "list_unit_groups",
    operationType: "read",
    description: "List unit groups with filters for property, unit group type, pagination, and embedded resources.",
    requiredScopes: [apaleoUnitGroupReadScope],
    providerPermissions: unitGroupReadPermissions,
    inputSchema: s.object(
      "Input payload for listing unit groups.",
      {
        propertyId: s.string("Return unit groups for the specified property ID."),
        unitGroupTypes: s.array("Filter results by one or more unit group types.", unitGroupTypeField),
        pageNumber: pageNumberField,
        pageSize: pageSizeField,
        expand: unitGroupListExpandField,
      },
      { optional: ["propertyId", "unitGroupTypes", "pageNumber", "pageSize", "expand"] },
    ),
    outputSchema: unitGroupListSchema,
  },
  {
    name: "count_unit_groups",
    operationType: "read",
    description: "Return the total number of unit groups matching the provided filters.",
    requiredScopes: [apaleoUnitGroupReadScope],
    providerPermissions: unitGroupReadPermissions,
    inputSchema: s.object(
      "Input payload for counting unit groups.",
      {
        propertyId: s.string("Return unit groups for the specified property ID."),
        unitGroupTypes: s.array("Filter results by one or more unit group types.", unitGroupTypeField),
      },
      { optional: ["propertyId", "unitGroupTypes"] },
    ),
    outputSchema: countSchema,
  },
  {
    name: "get_unit_group",
    operationType: "read",
    description: "Get one unit group by ID, including optional localized fields and expansions.",
    requiredScopes: [apaleoUnitGroupReadScope],
    providerPermissions: unitGroupReadPermissions,
    inputSchema: s.object(
      "Input payload for retrieving one unit group.",
      { id: idField, languages: languagesField, expand: unitGroupListExpandField },
      { optional: ["languages", "expand"] },
    ),
    outputSchema: unitGroupSchema,
  },
  {
    name: "check_unit_group_exists",
    operationType: "read",
    description: "Check whether a unit group exists by ID.",
    requiredScopes: [apaleoUnitGroupReadScope],
    providerPermissions: unitGroupReadPermissions,
    inputSchema: idInputSchemas.checkUnitGroup,
    outputSchema: existsSchema,
  },
  {
    name: "create_unit_group",
    operationType: "write",
    description: "Create a new unit group.",
    requiredScopes: [apaleoUnitGroupCreateScope],
    providerPermissions: unitGroupCreatePermissions,
    inputSchema: s.object(
      "Input payload for creating a unit group.",
      { ...createUnitGroupProperties, idempotencyKey: idempotencyKeyField },
      { optional: ["rank", "type", "connectedUnitGroups", "idempotencyKey"] },
    ),
    outputSchema: idOutputSchema,
  },
  {
    name: "replace_unit_group",
    operationType: "destructive",
    description: "Completely replace the mutable fields of an existing unit group.",
    requiredScopes: [apaleoUnitGroupManageScope],
    providerPermissions: unitGroupManagePermissions,
    inputSchema: s.object(
      "Input payload for replacing a unit group.",
      { ...replaceUnitGroupBodyProperties, id: idField },
      { optional: ["maxPersons", "rank", "connectedUnitGroups"] },
    ),
    outputSchema: successSchema,
  },
  {
    name: "delete_unit_group",
    operationType: "destructive",
    description: "Delete a unit group by ID.",
    requiredScopes: [apaleoUnitGroupDeleteScope],
    providerPermissions: unitGroupDeletePermissions,
    inputSchema: idInputSchemas.deleteUnitGroup,
    outputSchema: successSchema,
  },
  {
    name: "list_unit_attributes",
    operationType: "read",
    description: "List unit attribute definitions for the current account.",
    requiredScopes: [apaleoUnitAttributeReadScope],
    providerPermissions: unitAttributeReadPermissions,
    inputSchema: s.object(
      "Input payload for listing unit attributes.",
      { pageNumber: pageNumberField, pageSize: pageSizeField },
      { optional: ["pageNumber", "pageSize"] },
    ),
    outputSchema: unitAttributeListSchema,
  },
  {
    name: "get_unit_attribute",
    operationType: "read",
    description: "Get one unit attribute definition by ID.",
    requiredScopes: [apaleoUnitAttributeReadScope],
    providerPermissions: unitAttributeReadPermissions,
    inputSchema: idInputSchemas.getUnitAttribute,
    outputSchema: unitAttributeDefinitionSchema,
  },
  {
    name: "check_unit_attribute_exists",
    operationType: "read",
    description: "Check whether a unit attribute definition exists by ID.",
    requiredScopes: [apaleoUnitAttributeReadScope],
    providerPermissions: unitAttributeReadPermissions,
    inputSchema: idInputSchemas.checkUnitAttribute,
    outputSchema: existsSchema,
  },
  {
    name: "create_unit_attribute",
    operationType: "write",
    description: "Create a new unit attribute definition.",
    requiredScopes: [apaleoUnitAttributeCreateScope],
    providerPermissions: unitAttributeCreatePermissions,
    inputSchema: s.object(
      "Input payload for creating a unit attribute.",
      { ...createUnitAttributeProperties, idempotencyKey: idempotencyKeyField },
      { optional: ["description", "idempotencyKey"] },
    ),
    outputSchema: idOutputSchema,
  },
  {
    name: "delete_unit_attribute",
    operationType: "destructive",
    description: "Delete a unit attribute definition by ID.",
    requiredScopes: [apaleoUnitAttributeDeleteScope],
    providerPermissions: unitAttributeDeletePermissions,
    inputSchema: idInputSchemas.deleteUnitAttribute,
    outputSchema: successSchema,
  },
] as const;

export const apaleoActions: ActionDefinition[] = apaleoActionDefinitions.map(defineApaleoAction);

function defineApaleoAction(definition: ApaleoActionDefinition): ActionDefinition {
  return defineProviderAction(service, {
    name: definition.name,
    operationType: definition.operationType,
    description: definition.description,
    requiredScopes: [...definition.requiredScopes],
    providerPermissions: getProviderPermissions(definition),
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
  });
}

function getProviderPermissions(definition: ApaleoActionDefinition): string[] {
  return hasProviderPermissions(definition) ? [...definition.providerPermissions] : [];
}

function hasProviderPermissions(definition: ApaleoActionDefinition): definition is ApaleoActionDefinition & {
  providerPermissions: readonly string[];
} {
  return "providerPermissions" in definition;
}
