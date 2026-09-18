import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tave";

const linksSchema = s.object("Normalized links associated with one Táve resource.", {
  selfHref: s.nullableString("The API URL for this resource."),
  managerHref: s.nullableString("The manager UI URL for this resource when returned."),
  clientHref: s.nullableString("The client-facing URL for this resource when returned."),
});
const addressSchema = s.object("A normalized Táve address object.", {
  streetAddress: s.nullableString("The street address line."),
  village: s.nullableString("The village or district name."),
  city: s.nullableString("The city value."),
  state: s.nullableString("The state, province, or region value."),
  postalCode: s.nullableString("The postal or ZIP code."),
  country: s.nullableString("The ISO alpha-2 country code when available."),
  latitude: s.nullableNumber("The geocoded latitude value when available."),
  longitude: s.nullableNumber("The geocoded longitude value when available."),
  timezone: s.nullableString("The timezone name attached to the address when available."),
});
const contactSchema = s.object("A normalized Táve contact summary or detail record.", {
  id: s.nullableString("The contact ULID returned by Táve."),
  kind: s.nullable(
    s.stringEnum("The Táve contact kind returned by the API.", ["company", "employee", "location", "person"]),
  ),
  name: s.nullableString("The contact display name."),
  firstName: s.nullableString("The first name for person-like contacts."),
  lastName: s.nullableString("The last name for person-like contacts."),
  companyName: s.nullableString("The company name associated with the contact."),
  displayAs: s.nullableString("The employee display alias when present."),
  email: s.nullableString("The primary email address."),
  secondaryEmail: s.nullableString("The secondary email address."),
  phone: s.nullableString("The main phone value used by company or location contacts."),
  cellPhone: s.nullableString("The mobile phone number."),
  homePhone: s.nullableString("The home phone number."),
  workPhone: s.nullableString("The work phone number."),
  created: s.nullableString("The UTC created timestamp."),
  modified: s.nullableString("The UTC modified timestamp."),
  hidden: s.nullableBoolean("Whether the contact is hidden."),
  pinned: s.nullableBoolean("Whether the contact is pinned or favorited."),
  url: s.nullableString("The website URL associated with the contact."),
  address: s.nullable(addressSchema),
  mailingAddress: s.nullable(addressSchema),
  links: linksSchema,
  raw: s.looseObject("The raw upstream contact object returned by Táve."),
});
const studioSchema = s.object("The current Táve studio profile returned by the API.", {
  id: s.nullableString("The studio ULID."),
  name: s.nullableString("The studio name."),
  email: s.nullableString("The contact email configured on the studio."),
  currencyCode: s.nullableString("The three-letter currency code configured on the studio."),
  dateFormat: s.nullableString("The date format configured on the studio."),
  decimalSeparator: s.nullableString("The decimal separator configured on the studio."),
  defaultBrandId: s.nullableString("The default brand ULID when configured."),
  temperature: s.nullableString("The temperature unit configured on the studio."),
  thousandsSeparator: s.nullableString("The thousands separator configured on the studio."),
  timeFormat: s.nullableString("The time format configured on the studio."),
  timezoneId: s.nullableString("The timezone ULID configured on the studio."),
  weekStartsOn: s.nullableString("The day of week that starts the studio calendar."),
  readonlyEnabled: s.nullableBoolean("Whether readonly mode is enabled on the studio."),
  readonlyEnabledAt: s.nullableString("The UTC timestamp when readonly mode was enabled, when present."),
  created: s.nullableString("The UTC created timestamp."),
  modified: s.nullableString("The UTC modified timestamp."),
  hidden: s.nullableBoolean("Whether the studio resource is marked hidden."),
  links: linksSchema,
  raw: s.looseObject("The raw upstream studio object returned by Táve."),
});

export const taveActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts in the current Táve studio with official pagination, hidden, email, and sort filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        page: s.integer("The page number of contact results to return.", { minimum: 1 }),
        pageSize: s.integer("The number of contacts to return per page. VSCO Workspace accepts 10 through 100.", {
          minimum: 10,
          maximum: 100,
        }),
        includeHidden: s.boolean("Whether hidden contacts should be included in the returned list."),
        email: s.email("Only return contacts matching this email address."),
        sortBy: s.nonEmptyString(
          "The official VSCO Workspace sort expression, such as id, modified desc, or name asc.",
        ),
      },
      [],
      "The input payload for listing Táve contacts.",
    ),
    outputSchema: s.actionOutput(
      {
        pagination: s.object("Pagination metadata returned by Táve contact listings.", {
          currentPage: s.nullableInteger("The current page number returned by Táve."),
          totalPages: s.nullableInteger("The total number of pages available for this query."),
          totalItems: s.nullableInteger("The total number of contacts matching this query."),
          rows: s.nullableInteger("The number of contacts returned in the current page payload."),
        }),
        contacts: s.array("The normalized Táve contacts returned for this page.", contactSchema),
      },
      "The response returned when listing Táve contacts.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Fetch one Táve contact by its official ULID identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The VSCO Workspace contact ULID returned by list_contacts or another upstream workflow."),
      },
      ["id"],
      "The input payload for fetching one Táve contact.",
    ),
    outputSchema: s.actionOutput({ contact: contactSchema }, "The response returned when fetching one Táve contact."),
  }),
  defineProviderAction(service, {
    name: "get_my_studio",
    operationType: "read",
    description: "Fetch the current Táve studio profile for the connected API key.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for fetching the current Táve studio."),
    outputSchema: s.actionOutput(
      { studio: studioSchema },
      "The response returned when fetching the current Táve studio.",
    ),
  }),
];
