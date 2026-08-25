import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pilvio";
const rawObject = s.looseObject("The raw object returned by Pilvio.");
const maybeString = (description: string) => s.nullable(s.string(description));
const maybeNumber = (description: string) => s.nullable(s.number(description));
const maybeBoolean = (description: string) => s.nullable(s.boolean(description));
const user = s.object("A normalized Pilvio user profile.", {
  id: maybeNumber("The Pilvio user identifier when returned."),
  name: maybeString("The user name when returned, often the account email address."),
  email: maybeString("The email address from the nested profile data when returned."),
  firstName: maybeString("The first name from the nested profile data when returned."),
  lastName: maybeString("The last name from the nested profile data when returned."),
  raw: rawObject,
});
const location = s.object("A normalized Pilvio data center location.", {
  slug: s.string("The location slug used in location-specific Pilvio API URLs."),
  displayName: maybeString("The human-readable location name when returned."),
  description: maybeString("The location description when returned."),
  countryCode: maybeString("The location country code when returned."),
  orderNumber: maybeNumber("The location ordering number when returned."),
  isDefault: maybeBoolean("Whether this is the default location when returned."),
  isPreferred: maybeBoolean("Whether this is the preferred location when returned."),
  raw: rawObject,
});
const virtualMachine = s.object("A normalized Pilvio virtual machine.", {
  id: maybeNumber("The numeric virtual machine identifier when returned."),
  uuid: maybeString("The virtual machine UUID when returned."),
  name: maybeString("The virtual machine name when returned."),
  hostname: maybeString("The virtual machine hostname when returned."),
  status: maybeString("The virtual machine status when returned."),
  billingAccountId: maybeNumber("The billing account identifier attached to the VM."),
  vcpus: maybeNumber("The number of vCPUs assigned to the VM when returned."),
  memoryMb: maybeNumber("The amount of VM memory in MiB when returned."),
  osName: maybeString("The operating system name when returned."),
  osVersion: maybeString("The operating system version when returned."),
  privateIpv4: maybeString("The private IPv4 address when returned."),
  publicIpv4: maybeString("The public IPv4 address when returned."),
  publicIpv6: maybeString("The public IPv6 address when returned."),
  createdAt: maybeString("The VM creation timestamp when returned."),
  updatedAt: maybeString("The VM last update timestamp when returned."),
  raw: rawObject,
});
const billingAccount = s.object("A normalized Pilvio billing account.", {
  id: maybeNumber("The billing account identifier when returned."),
  title: maybeString("The billing account title when returned."),
  email: maybeString("The billing account email address when returned."),
  companyName: maybeString("The billing account company name when returned."),
  creditAmount: maybeNumber("The billing account credit amount when returned."),
  isActive: maybeBoolean("Whether the billing account is active when returned."),
  isDefault: maybeBoolean("Whether this is the default billing account when returned."),
  raw: rawObject,
});

export const pilvioActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Pilvio user profile.",
    inputSchema: s.object("Input parameters for retrieving the current Pilvio user.", {}),
    outputSchema: s.object("The normalized current Pilvio user response.", {
      user,
      raw: s.unknown("The raw top-level payload returned by Pilvio."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List Pilvio data center locations available for resource operations.",
    inputSchema: s.object("Input parameters for listing Pilvio locations.", {}),
    outputSchema: s.object("The normalized Pilvio locations response.", {
      locations: s.array("The Pilvio locations returned by the API.", location),
      raw: s.unknown("The raw top-level payload returned by Pilvio."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_virtual_machines",
    description: "List Pilvio virtual machines, optionally scoped to a documented location slug.",
    inputSchema: s.object(
      "Input parameters for listing Pilvio virtual machines.",
      {
        locationSlug: s.nonEmptyString("The optional Pilvio location slug to use after /v1 in the API URL."),
      },
      { optional: ["locationSlug"] },
    ),
    outputSchema: s.object("The normalized Pilvio virtual machine list response.", {
      virtualMachines: s.array("The virtual machines returned by Pilvio.", virtualMachine),
      raw: s.unknown("The raw top-level payload returned by Pilvio."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_billing_accounts",
    description: "List Pilvio billing accounts attached to the authenticated user.",
    inputSchema: s.object(
      "Input parameters for listing Pilvio billing accounts.",
      {
        showShadow: s.boolean("Whether to request deleted billing accounts with show_shadow."),
      },
      { optional: ["showShadow"] },
    ),
    outputSchema: s.object("The normalized Pilvio billing account list response.", {
      billingAccounts: s.array("The billing accounts returned by Pilvio.", billingAccount),
      raw: s.unknown("The raw top-level payload returned by Pilvio."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_billing_account",
    description: "Get one Pilvio billing account by numeric identifier.",
    inputSchema: s.object("Input parameters for retrieving one Pilvio billing account.", {
      billingAccountId: s.integer("The Pilvio billing account identifier.", { minimum: 1 }),
    }),
    outputSchema: s.object("The normalized Pilvio billing account response.", {
      billingAccount,
      raw: s.unknown("The raw top-level payload returned by Pilvio."),
    }),
  }),
];
