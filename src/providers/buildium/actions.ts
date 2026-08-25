import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "buildium";

const positiveInteger = (description: string) => s.positiveInteger(description);

const optionalListFields = {
  limit: positiveInteger("Maximum number of records to return."),
  offset: s.nonNegativeInteger("Zero-based record offset used for pagination."),
  orderBy: s.nonEmptyString("Buildium orderby expression used to sort returned records."),
};

const propertyIdField = positiveInteger("The Buildium rental property identifier.");
const unitIdField = positiveInteger("The Buildium rental unit identifier.");
const ownerIdField = positiveInteger("The Buildium rental owner identifier.");

const integerArray = (description: string) =>
  s.array(description, positiveInteger("One Buildium identifier."), { minItems: 1 });

const rawResourceSchema = s.looseObject("The normalized Buildium resource payload.");

const listOutputSchema = (description: string, itemDescription: string) =>
  s.object(
    description,
    {
      count: s.integer("The number of returned records."),
      items: s.array("The returned records.", s.looseObject(itemDescription)),
    },
    {
      required: ["count", "items"],
    },
  );

export const buildiumActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_properties",
    description: "List Buildium rental properties.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental properties and units: View"],
    inputSchema: s.object(
      "The input payload for listing Buildium rental properties.",
      {
        ...optionalListFields,
        propertyIds: integerArray("Rental property identifiers to include."),
      },
      {
        optional: ["limit", "offset", "orderBy", "propertyIds"],
      },
    ),
    outputSchema: listOutputSchema("A list of Buildium rental properties.", "One Buildium rental property."),
  }),
  defineProviderAction(service, {
    name: "get_property",
    description: "Retrieve one Buildium rental property by identifier.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental properties and units: View"],
    inputSchema: s.object(
      "The input payload for retrieving one rental property.",
      {
        propertyId: propertyIdField,
      },
      {
        required: ["propertyId"],
      },
    ),
    outputSchema: s.object(
      "A Buildium rental property response.",
      {
        property: rawResourceSchema,
      },
      {
        required: ["property"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_units",
    description: "List Buildium rental units.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental properties and units: View"],
    inputSchema: s.object(
      "The input payload for listing Buildium rental units.",
      {
        ...optionalListFields,
        propertyIds: integerArray("Rental property identifiers used to filter units."),
        unitIds: integerArray("Rental unit identifiers to include."),
      },
      {
        optional: ["limit", "offset", "orderBy", "propertyIds", "unitIds"],
      },
    ),
    outputSchema: listOutputSchema("A list of Buildium rental units.", "One Buildium rental unit."),
  }),
  defineProviderAction(service, {
    name: "get_unit",
    description: "Retrieve one Buildium rental unit by identifier.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental properties and units: View"],
    inputSchema: s.object(
      "The input payload for retrieving one rental unit.",
      {
        unitId: unitIdField,
      },
      {
        required: ["unitId"],
      },
    ),
    outputSchema: s.object(
      "A Buildium rental unit response.",
      {
        unit: rawResourceSchema,
      },
      {
        required: ["unit"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_owners",
    description: "List Buildium rental owners.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental owners: View"],
    inputSchema: s.object(
      "The input payload for listing Buildium rental owners.",
      {
        ...optionalListFields,
        rentalOwnerIds: integerArray("Rental owner identifiers to include."),
      },
      {
        optional: ["limit", "offset", "orderBy", "rentalOwnerIds"],
      },
    ),
    outputSchema: listOutputSchema("A list of Buildium rental owners.", "One Buildium rental owner."),
  }),
  defineProviderAction(service, {
    name: "get_owner",
    description: "Retrieve one Buildium rental owner by identifier.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental owners: View"],
    inputSchema: s.object(
      "The input payload for retrieving one rental owner.",
      {
        rentalOwnerId: ownerIdField,
      },
      {
        required: ["rentalOwnerId"],
      },
    ),
    outputSchema: s.object(
      "A Buildium rental owner response.",
      {
        owner: rawResourceSchema,
      },
      {
        required: ["owner"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_property_notes",
    description: "List notes attached to one Buildium rental property.",
    requiredScopes: [],
    providerPermissions: ["Rentals > Rental properties and units: View"],
    inputSchema: s.object(
      "The input payload for listing notes on one Buildium rental property.",
      {
        propertyId: propertyIdField,
        updatedDateTimeFrom: s.nonEmptyString("Filter to notes updated at or after this Buildium date-time value."),
        updatedDateTimeTo: s.nonEmptyString("Filter to notes updated at or before this Buildium date-time value."),
        lastUpdatedByUserId: positiveInteger("Filter to notes last updated by this user identifier."),
        ...optionalListFields,
      },
      {
        required: ["propertyId"],
      },
    ),
    outputSchema: listOutputSchema("A list of Buildium rental property notes.", "One Buildium rental property note."),
  }),
];
