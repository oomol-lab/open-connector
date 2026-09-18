import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "calendarific";

const countryCodeSchema = s.string("The ISO 3166-1 alpha-2 country code used by Calendarific.", {
  pattern: "^\\s*[A-Za-z]{2}\\s*$",
});
const yearSchema = s.integer("The holiday year to query. Calendarific supports years up to 2049.", {
  minimum: 1900,
  maximum: 2049,
});
const monthSchema = s.integer("The month number used to limit holiday results.", {
  minimum: 1,
  maximum: 12,
});
const daySchema = s.integer("The day of month used to limit holiday results.", {
  minimum: 1,
  maximum: 31,
});
const locationSchema = s.string("The state, county, or region code used to narrow holiday results.", {
  minLength: 1,
  pattern: "\\S",
});
const languageSchema = s.string("The ISO 639 language code used to localize holiday names.", {
  minLength: 1,
  pattern: "\\S",
});
const uuidSchema = s.boolean("Whether Calendarific should include UUID values in each holiday record.");
const holidayTypeSchema = s.array(
  "The holiday types used to filter Calendarific holiday results.",
  s.string("One Calendarific holiday type such as national, local, or religious.", {
    minLength: 1,
    pattern: "\\S",
  }),
  { minItems: 1 },
);

const responseMetaSchema = s.object("The top-level metadata returned by Calendarific.", {
  code: s.integer("The HTTP-like status code reported by Calendarific."),
});

const countrySchema = s.object("A normalized Calendarific supported country.", {
  name: s.string("The country name returned by Calendarific."),
  isoCode: s.string("The ISO 3166-1 alpha-2 country code."),
  totalHolidays: s.nullableInteger("The number of holidays Calendarific reports for the country when present."),
  supportedLanguages: s.nullableInteger("The number of languages Calendarific reports for the country when present."),
  raw: s.looseObject("The raw country object returned by Calendarific."),
});

const supportedLanguageSchema = s.object("A normalized Calendarific supported language.", {
  code: s.string("The language code returned by Calendarific."),
  name: s.string("The display name of the language."),
  raw: s.looseObject("The raw language object returned by Calendarific."),
});

const holidayDateSchema = s.object("The holiday date object returned by Calendarific.", {
  iso: s.nullableString("The ISO date string returned by Calendarific."),
  datetime: s.object("The split date fields returned by Calendarific.", {
    year: s.nullableInteger("The holiday year."),
    month: s.nullableInteger("The holiday month."),
    day: s.nullableInteger("The holiday day."),
  }),
});

const holidaySchema = s.object("A normalized Calendarific holiday.", {
  name: s.string("The holiday name."),
  description: s.nullableString("The holiday description when provided."),
  dateIso: s.nullableString("The ISO date string extracted from the holiday date object."),
  date: holidayDateSchema,
  type: s.array(
    "The holiday type list returned by Calendarific.",
    s.string("One holiday type returned by Calendarific."),
  ),
  primaryType: s.nullableString("The first holiday type when available."),
  locations: s.nullableString("The locations string returned by Calendarific."),
  states: s.nullableString("The states string returned by Calendarific."),
  uuid: s.nullableString("The holiday UUID when requested and available."),
  raw: s.looseObject("The raw holiday object returned by Calendarific."),
});

export const calendarificActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_supported_countries",
    operationType: "read",
    description: "List countries currently supported by Calendarific.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Calendarific supported countries.", {}),
    outputSchema: s.object("The response returned when listing Calendarific supported countries.", {
      meta: responseMetaSchema,
      countries: s.array("The countries returned by Calendarific.", countrySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_supported_languages",
    operationType: "read",
    description: "List languages currently supported by Calendarific.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Calendarific supported languages.", {}),
    outputSchema: s.object("The response returned when listing Calendarific supported languages.", {
      meta: responseMetaSchema,
      languages: s.array("The languages returned by Calendarific.", supportedLanguageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_holidays",
    operationType: "read",
    description: "List Calendarific holidays for a given country and year with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Calendarific holidays.",
      {
        country: countryCodeSchema,
        year: yearSchema,
        month: monthSchema,
        day: daySchema,
        location: locationSchema,
        type: holidayTypeSchema,
        language: languageSchema,
        uuid: uuidSchema,
      },
      { optional: ["month", "day", "location", "type", "language", "uuid"] },
    ),
    outputSchema: s.object("The response returned when listing Calendarific holidays.", {
      meta: responseMetaSchema,
      holidays: s.array("The holidays returned by Calendarific.", holidaySchema),
    }),
  }),
];
