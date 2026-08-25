import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "juniper_mist";

function nonEmptyString(description: string) {
  return s.nonEmptyString(description);
}

function nullableString(description: string) {
  return s.nullable(s.string(description));
}

const paginationInputFields = {
  limit: s.positiveInteger("Maximum number of records to return."),
  page: s.positiveInteger("One-based page number to request."),
};

const organizationSummarySchema = s.object("Juniper Mist organization access summary.", {
  id: s.string("Juniper Mist organization ID."),
  name: nullableString("Juniper Mist organization name, when available."),
  privilege: nullableString("Privilege granted to the authenticated administrator."),
  role: nullableString("Role granted to the authenticated administrator."),
  raw: s.looseObject("Raw organization privilege object returned by Juniper Mist."),
});

const siteSummarySchema = s.object("Juniper Mist site access summary.", {
  id: s.string("Juniper Mist site ID."),
  name: nullableString("Juniper Mist site name, when available."),
  orgId: nullableString("Juniper Mist organization ID that owns the site, when available."),
  privilege: nullableString("Privilege granted to the authenticated administrator."),
  role: nullableString("Role granted to the authenticated administrator."),
  raw: s.looseObject("Raw site privilege object returned by Juniper Mist."),
});

const selfSchema = s.object("Juniper Mist authenticated administrator profile.", {
  id: nullableString("Juniper Mist administrator ID."),
  email: nullableString("Administrator email address."),
  firstName: nullableString("Administrator first name."),
  lastName: nullableString("Administrator last name."),
  name: nullableString("Administrator display name."),
  privileges: s.array(
    "Organization and site privileges for the administrator.",
    s.looseObject("Raw privilege object returned by Juniper Mist."),
  ),
  organizations: s.array("Organizations available to the administrator.", organizationSummarySchema),
  sites: s.array("Sites available to the administrator.", siteSummarySchema),
  raw: s.looseObject("Raw self profile returned by Juniper Mist."),
});

const orgSiteSchema = s.object("Juniper Mist organization site.", {
  id: s.string("Juniper Mist site ID."),
  name: nullableString("Site name."),
  orgId: nullableString("Juniper Mist organization ID that owns the site, when available."),
  timezone: nullableString("Site timezone."),
  countryCode: nullableString("Site country code."),
  address: nullableString("Site street address."),
  latlng: s.nullable(s.looseObject("Site latitude and longitude object returned by Juniper Mist.")),
  raw: s.looseObject("Raw site object returned by Juniper Mist."),
});

const siteDeviceSchema = s.object("Juniper Mist site device.", {
  id: nullableString("Juniper Mist device ID."),
  name: nullableString("Device name."),
  mac: nullableString("Device MAC address."),
  serial: nullableString("Device serial number."),
  model: nullableString("Device model."),
  type: nullableString("Device type."),
  siteId: nullableString("Juniper Mist site ID for the device."),
  orgId: nullableString("Juniper Mist organization ID for the device."),
  status: nullableString("Device status, when returned by Juniper Mist."),
  raw: s.looseObject("Raw device object returned by Juniper Mist."),
});

const deviceTypeSchema = s.stringEnum("Juniper Mist device type filter.", ["all", "ap", "switch", "gateway"]);

export const juniperMistActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_self",
    description: "Get the authenticated Juniper Mist administrator profile and accessible organizations or sites.",
    inputSchema: s.object("This action does not require input fields.", {}),
    outputSchema: s.object("Juniper Mist self profile response.", {
      self: selfSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_org_sites",
    description: "List sites in a Juniper Mist organization with optional pagination.",
    inputSchema: s.object(
      "Input parameters for listing Juniper Mist organization sites.",
      {
        orgId: nonEmptyString("Juniper Mist organization ID."),
        ...paginationInputFields,
      },
      { optional: ["limit", "page"] },
    ),
    outputSchema: s.object("Juniper Mist organization sites response.", {
      sites: s.array("Sites returned by Juniper Mist.", orgSiteSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_site_devices",
    description: "List devices in a Juniper Mist site with optional type, name, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for listing Juniper Mist site devices.",
      {
        siteId: nonEmptyString("Juniper Mist site ID."),
        type: deviceTypeSchema,
        name: nonEmptyString("Device name filter."),
        ...paginationInputFields,
      },
      { optional: ["type", "name", "limit", "page"] },
    ),
    outputSchema: s.object("Juniper Mist site devices response.", {
      devices: s.array("Devices returned by Juniper Mist.", siteDeviceSchema),
    }),
  }),
];
