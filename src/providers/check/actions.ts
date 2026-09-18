import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "check";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const agencySchema = s.object("A normalized Check agency.", {
  id: s.string("The unique Check agency identifier."),
  label: s.string("The human-readable agency name."),
  jurisdiction: s.string("The lowercase jurisdiction code for the agency."),
  raw: s.looseObject("The raw agency object returned by Check."),
});

export const checkActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_address",
    operationType: "read",
    description: "Validate a US address using Check's address validation endpoint.",
    inputSchema: s.actionInput(
      {
        line1: nonEmptyString("A street address line to validate with Check."),
        line2: nonEmptyString("A second street address line to validate with Check."),
        city: nonEmptyString("The city for the address to validate."),
        state: nonEmptyString("The US state code for the address to validate."),
        postalCode: nonEmptyString("The postal code for the address to validate."),
        country: nonEmptyString("The country code for the address to validate."),
      },
      ["line1", "city", "state", "postalCode"],
      "Input parameters for validating an address with Check.",
    ),
    outputSchema: s.actionOutput({
      result: s.looseObject("The raw Check address validation result."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_agencies",
    operationType: "read",
    description: "List Check tax agencies with optional ID, jurisdiction, label, and page size filters.",
    inputSchema: s.object(
      "Input parameters for listing Check agencies.",
      {
        ids: s.stringArray("The Check agency IDs to look up. Check accepts repeated id query parameters.", {
          minItems: 1,
          maxItems: 500,
          itemDescription: "One Check agency ID.",
        }),
        jurisdictions: s.stringArray("The lowercase jurisdiction codes used to filter agencies.", {
          minItems: 1,
          itemDescription: "One Check jurisdiction code.",
        }),
        labelContains: nonEmptyString("A case-insensitive substring filter applied to the agency label."),
        limit: s.positiveInteger("The number of agencies to return per page. Check allows up to 500.", {
          maximum: 500,
        }),
      },
      { optional: ["ids", "jurisdictions", "labelContains", "limit"] },
    ),
    outputSchema: s.actionOutput({
      next: s.nullableString("The URL of the next page, or null if there is no next page."),
      previous: s.nullableString("The URL of the previous page, or null if there is no previous page."),
      agencies: s.array("The agencies returned by Check.", agencySchema),
      raw: s.looseObject("The raw paginated agency list response returned by Check."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_agency",
    operationType: "read",
    description: "Get one Check tax agency by ID.",
    inputSchema: s.actionInput(
      {
        id: nonEmptyString("The Check agency ID."),
      },
      ["id"],
      "Input parameters for reading a Check agency.",
    ),
    outputSchema: s.actionOutput({
      agency: agencySchema,
    }),
  }),
] satisfies Array<ProviderActionDefinition<"validate_address" | "list_agencies" | "get_agency">>;
