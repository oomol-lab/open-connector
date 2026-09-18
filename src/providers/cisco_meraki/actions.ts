import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cisco_meraki";

const paginationFields = {
  startingAfter: s.nonEmptyString("The pagination token that starts the page after this value."),
  endingBefore: s.nonEmptyString("The pagination token that ends the page before this value."),
};
const productTypeSchema = s.stringEnum("The Meraki product type to filter by.", [
  "appliance",
  "camera",
  "campusGateway",
  "cellularGateway",
  "secureConnect",
  "sensor",
  "switch",
  "systemsManager",
  "wireless",
  "wirelessController",
]);
const tagsFilterTypeSchema = s.stringEnum("How tag filters are matched.", ["withAllTags", "withAnyTags"]);
const linkHeaderSchema = s.nullableString("The raw Meraki Link response header for cursor pagination.");
const rawObjectSchema = s.unknownObject("A JSON object returned by the Meraki Dashboard API.");

const organizationSchema = s.looseObject("One Meraki organization.", {
  id: s.string("Organization ID."),
  name: s.string("Organization name."),
  url: s.string("Organization Dashboard URL."),
  api: rawObjectSchema,
  licensing: rawObjectSchema,
  cloud: rawObjectSchema,
  management: rawObjectSchema,
  privacy: rawObjectSchema,
});

const networkSchema = s.looseObject("One Meraki network.", {
  id: s.string("Network ID."),
  organizationId: s.string("Organization ID."),
  name: s.string("Network name."),
  productTypes: s.stringArray("Product types enabled for this network."),
  timeZone: s.string("Network time zone."),
  tags: s.stringArray("Network tags."),
  enrollmentString: s.string("Enrollment string for this network."),
  url: s.string("Network Dashboard URL."),
  notes: s.string("Network notes."),
  isBoundToConfigTemplate: s.boolean("Whether this network is bound to a config template."),
});

const deviceDetailSchema = s.looseObject("One additional device detail.", {
  name: s.string("Additional detail name."),
  value: s.string("Additional detail value."),
});

const inventoryDeviceSchema = s.looseObject("One Meraki inventory device.", {
  mac: s.string("MAC address of the device."),
  serial: s.string("Serial number of the device."),
  name: s.string("Name of the device."),
  model: s.string("Model type of the device."),
  sku: s.string("Full product model SKU of the device."),
  networkId: s.string("Network ID of the device."),
  orderNumber: s.string("Order number of the device."),
  claimedAt: s.dateTime("Claimed time of the device."),
  licenseExpirationDate: s.dateTime("License expiration date of the device."),
  tags: s.stringArray("Device tags."),
  productType: s.string("Product type of the device."),
  countryCode: s.string("Country or region code for the device."),
  details: s.array("Additional device details.", deviceDetailSchema),
  eox: rawObjectSchema,
});

const deviceSchema = s.looseObject("One Meraki device.", {
  name: s.string("Name of the device."),
  lat: s.number("Latitude of the device."),
  lng: s.number("Longitude of the device."),
  address: s.string("Physical address of the device."),
  notes: s.string("Notes for the device."),
  tags: s.stringArray("Device tags."),
  networkId: s.string("Network ID of the device."),
  serial: s.string("Serial number of the device."),
  model: s.string("Model of the device."),
  mac: s.string("MAC address of the device."),
  lanIp: s.string("LAN IP address of the device."),
  firmware: s.string("Firmware version of the device."),
  floorPlanId: s.nullableString("Floor plan ID associated with the device."),
  url: s.string("Device Dashboard URL."),
  details: s.array("Additional device details.", deviceDetailSchema),
  beaconIdParams: rawObjectSchema,
});

export const ciscoMerakiActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List the Meraki organizations available to the connected API key.",
    inputSchema: s.actionInput(
      {
        perPage: s.integer("The number of organizations to return on each page.", {
          minimum: 3,
          maximum: 9000,
        }),
        ...paginationFields,
      },
      [],
      "Pagination options for listing Meraki organizations.",
    ),
    outputSchema: s.actionOutput(
      {
        organizations: s.array("Organizations returned by Meraki.", organizationSchema),
        link: linkHeaderSchema,
        raw: s.array("The raw Meraki organization records.", organizationSchema),
      },
      "The Meraki organizations response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_organization_networks",
    operationType: "read",
    description: "List networks that the API key can access in a Meraki organization.",
    inputSchema: s.actionInput(
      {
        organizationId: s.nonEmptyString("The Meraki organization ID."),
        configTemplateId: s.nonEmptyString("Only return networks bound to this config template ID."),
        isBoundToConfigTemplate: s.boolean("Only return networks by config-template binding state."),
        tags: s.stringArray("Case-sensitive tags used to filter networks.", {
          minItems: 1,
        }),
        tagsFilterType: tagsFilterTypeSchema,
        productTypes: s.array("Product types used to filter networks.", productTypeSchema, { minItems: 1 }),
        perPage: s.integer("The number of networks to return on each page.", {
          minimum: 3,
          maximum: 100000,
        }),
        ...paginationFields,
      },
      ["organizationId"],
      "Filters and pagination options for listing Meraki organization networks.",
    ),
    outputSchema: s.actionOutput(
      {
        networks: s.array("Networks returned by Meraki.", networkSchema),
        link: linkHeaderSchema,
        raw: s.array("The raw Meraki network records.", networkSchema),
      },
      "The Meraki organization networks response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_organization_inventory_devices",
    operationType: "read",
    description: "List inventory devices in a Meraki organization with simple search filters.",
    inputSchema: s.actionInput(
      {
        organizationId: s.nonEmptyString("The Meraki organization ID."),
        perPage: s.integer("The number of inventory devices to return on each page.", { minimum: 3, maximum: 1000 }),
        ...paginationFields,
        usedState: s.stringEnum("Filter inventory by used or unused state.", ["used", "unused"]),
        search: s.nonEmptyString("Search by serial number, MAC address, or model."),
        macs: s.stringArray("MAC addresses to search for.", { minItems: 1 }),
        networkIds: s.stringArray("Network IDs to search for. Use the string value 'null' to find available devices.", {
          minItems: 1,
        }),
        serials: s.stringArray("Serial numbers to search for.", { minItems: 1 }),
        models: s.stringArray("Device models to search for.", { minItems: 1 }),
        orderNumbers: s.stringArray("Order numbers to search for.", {
          minItems: 1,
        }),
        tags: s.stringArray("Case-sensitive tags used to filter devices.", {
          minItems: 1,
        }),
        tagsFilterType: tagsFilterTypeSchema,
        productTypes: s.array("Product types used to filter devices.", productTypeSchema, { minItems: 1 }),
        eoxStatuses: s.array(
          "End-of-sale or end-of-support states used to filter devices.",
          s.stringEnum("One EOX status filter.", ["endOfSale", "endOfSupport", "nearEndOfSupport", "null"]),
          { minItems: 1 },
        ),
      },
      ["organizationId"],
      "Filters and pagination options for listing Meraki organization inventory devices.",
    ),
    outputSchema: s.actionOutput(
      {
        devices: s.array("Inventory devices returned by Meraki.", inventoryDeviceSchema),
        link: linkHeaderSchema,
        raw: s.array("The raw Meraki inventory device records.", inventoryDeviceSchema),
      },
      "The Meraki organization inventory devices response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_device",
    operationType: "read",
    description: "Retrieve one Meraki device by serial number.",
    inputSchema: s.actionInput(
      {
        serial: s.nonEmptyString("The Meraki device serial number."),
      },
      ["serial"],
      "The input for retrieving one Meraki device.",
    ),
    outputSchema: s.actionOutput(
      {
        device: deviceSchema,
        raw: deviceSchema,
      },
      "The Meraki device response.",
    ),
  }),
];
