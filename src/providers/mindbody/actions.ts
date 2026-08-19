import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mindbody";

const businessIdSchema = s.nonEmptyString("A Mindbody business ID to filter the Business Directory.");

const businessLocationSchema = s.looseObject("One Mindbody business location.", {
  id: s.unknown("The ID of the business location."),
  name: s.nullableString("The name of the business location."),
  addressLine1: s.nullableString("The first line of the business location's street address."),
  addressLine2: s.nullableString("The second line of the business location's street address, if returned."),
  city: s.nullableString("The business location's city."),
  stateProvCode: s.nullableString("The business location's state or province code."),
  postalCode: s.nullableString("The business location's postal code."),
  countryCode: s.nullableString("The business location's country code."),
  bookingUrl: s.nullableString("The booking URL for the business location."),
});

const businessSchema = s.looseObject("One Mindbody Business Directory business.", {
  id: s.unknown("The ID of the business."),
  name: s.nullableString("The name of the business."),
  websiteUrl: s.nullableString("The website URL of the business."),
  locations: s.array("The locations of the business.", businessLocationSchema),
});

export const mindbodyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_businesses",
    description:
      "List businesses from the Mindbody Consumer API Business Directory, optionally filtered by business IDs.",
    inputSchema: s.object(
      "Input parameters for listing Mindbody Business Directory businesses.",
      {
        pageNumber: s.positiveInteger(
          "The Mindbody Business Directory page number to request. Mindbody defaults this to 1.",
        ),
        businessIds: s.array("Mindbody business IDs to restrict results to.", businessIdSchema, {
          minItems: 1,
        }),
      },
      { optional: ["pageNumber", "businessIds"] },
    ),
    outputSchema: s.object("The normalized Mindbody Business Directory response.", {
      pageCount: s.nullableNumber("The total number of result pages returned by Mindbody."),
      businesses: s.array("The businesses returned by Mindbody.", businessSchema),
    }),
  }),
];
