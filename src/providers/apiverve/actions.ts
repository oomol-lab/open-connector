import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apiverve";

const wordField = s.nonEmptyString("The word to look up in the APIVerve endpoint.");
const currencyCodeField = s.stringPattern("^[A-Za-z]{3}$", {
  description: "The ISO 4217 currency code used by APIVerve.",
});
const iataCodeField = s.stringPattern("^[A-Za-z]{3}$", {
  description: "The IATA code used by APIVerve.",
});
const airlineIataCodeField = s.stringPattern("^[A-Za-z]{2}$", {
  description: "The airline IATA code used by APIVerve.",
});

const airportDistanceAirportSchema = s.object("Airport details returned by the APIVerve airport distance endpoint.", {
  name: s.string("Airport name returned by APIVerve."),
  iata: s.string("Airport IATA code returned by APIVerve."),
  icao: s.string("Airport ICAO code returned by APIVerve."),
  city: s.string("Airport city returned by APIVerve."),
  state: s.nullable(s.string("Airport state or region returned by APIVerve.")),
  country: s.string("Airport country code returned by APIVerve."),
  elevation: s.nullable(s.number("Airport elevation returned by APIVerve.")),
  latitude: s.number("Airport latitude returned by APIVerve."),
  longitude: s.number("Airport longitude returned by APIVerve."),
  timezone: s.nullable(s.string("Airport timezone returned by APIVerve.")),
});

const lookupAirportCityInfoSchema = s.object("City information returned by APIVerve for an airport.", {
  name: s.string("City name returned by APIVerve."),
  altName: s.nullable(s.string("Alternative city name returned by APIVerve.")),
  country: s.string("City country code returned by APIVerve."),
});

const lookupAirportSchema = s.object("Normalized airport information returned by APIVerve.", {
  icao: s.string("Airport ICAO code returned by APIVerve."),
  iata: s.string("Airport IATA code returned by APIVerve."),
  name: s.string("Airport name returned by APIVerve."),
  city: s.string("Airport city returned by APIVerve."),
  state: s.nullable(s.string("Airport state or region returned by APIVerve.")),
  country: s.string("Airport country code returned by APIVerve."),
  elevation: s.nullable(s.number("Airport elevation returned by APIVerve.")),
  latitude: s.number("Airport latitude returned by APIVerve."),
  longitude: s.number("Airport longitude returned by APIVerve."),
  timezone: s.nullable(s.string("Airport timezone returned by APIVerve.")),
  cityInfo: s.nullable(lookupAirportCityInfoSchema),
  raw: s.record("The raw airport object returned by APIVerve.", s.unknown("Raw airport field value.")),
});

const airlineSchema = s.object("Normalized airline information returned by APIVerve.", {
  name: s.string("Airline name returned by APIVerve."),
  alias: s.nullable(s.string("Airline alias returned by APIVerve when present.")),
  iata: s.nullable(s.string("Airline IATA code returned by APIVerve.")),
  icao: s.nullable(s.string("Airline ICAO code returned by APIVerve.")),
  callsign: s.nullable(s.string("Airline callsign returned by APIVerve.")),
  country: s.nullable(s.string("Airline country returned by APIVerve.")),
  id: s.nullable(s.string("Airline identifier returned by APIVerve.")),
  isLowCost: s.nullable(s.boolean("Whether APIVerve marks the airline as low cost.")),
  logoUrl: s.nullable(s.string("Airline logo URL returned by APIVerve when present.")),
  raw: s.record("The raw airline object returned by APIVerve.", s.unknown("Raw airline field value.")),
});

const numericBreakdownSchema = s.object("Numeric age duration fields returned by APIVerve.", {
  years: s.number("The number of years returned by APIVerve."),
  months: s.number("The number of months returned by APIVerve."),
  weeks: s.number("The number of weeks returned by APIVerve."),
  days: s.number("The number of days returned by APIVerve."),
  hours: s.number("The number of hours returned by APIVerve."),
  minutes: s.number("The number of minutes returned by APIVerve."),
  seconds: s.number("The number of seconds returned by APIVerve."),
});

const nextBirthdayBreakdownSchema = s.object("The time remaining until the next birthday returned by APIVerve.", {
  months: s.number("The number of months until the next birthday."),
  weeks: s.number("The number of weeks until the next birthday."),
  days: s.number("The number of days until the next birthday."),
  hours: s.number("The number of hours until the next birthday."),
  minutes: s.number("The number of minutes until the next birthday."),
  seconds: s.number("The number of seconds until the next birthday."),
});

const airQualityInputSchema = s.object(
  "The input payload for getting APIVerve air quality data.",
  {
    city: s.nonEmptyString("The city name for which you want to get air quality data."),
    zip: s.nonEmptyString("The ZIP code for which you want to get air quality data."),
  },
  { optional: ["city", "zip"] },
);
airQualityInputSchema.oneOf = [{ required: ["city"] }, { required: ["zip"] }];

const lookupAirlinesInputSchema = s.object(
  "The input payload for looking up APIVerve airlines.",
  {
    name: s.nonEmptyString("The airline name to search for."),
    iata: airlineIataCodeField,
  },
  { optional: ["name", "iata"] },
);
lookupAirlinesInputSchema.oneOf = [{ required: ["name"] }, { required: ["iata"] }];

export const apiverveActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_word_definition",
    description: "Get definitions for a word using APIVerve Dictionary.",
    inputSchema: s.object("The input payload for getting APIVerve word definitions.", {
      word: wordField,
    }),
    outputSchema: s.object("The response returned by APIVerve Dictionary.", {
      word: s.string("The word that was defined."),
      definitionCount: s.integer("The number of definitions returned."),
      definitions: s.array("The definitions returned by APIVerve.", s.string("One definition for the word.")),
    }),
  }),
  defineProviderAction(service, {
    name: "find_antonyms",
    description: "Find antonyms for a word using APIVerve Antonym Finder.",
    inputSchema: s.object("The input payload for finding APIVerve antonyms.", {
      word: wordField,
    }),
    outputSchema: s.object("The response returned by APIVerve Antonym Finder.", {
      word: s.string("The queried word returned by APIVerve."),
      language: s.nullable(s.string("The language code returned by APIVerve.")),
      antonyms: s.array("The antonyms returned by APIVerve.", s.string("One antonym returned by APIVerve.")),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_advice",
    description: "Generate a random piece of advice using APIVerve Advice Generator.",
    inputSchema: s.object("The input payload for generating APIVerve advice.", {}),
    outputSchema: s.object("The response returned by APIVerve Advice Generator.", {
      id: s.string("The APIVerve advice identifier."),
      advice: s.string("The advice text returned by APIVerve."),
      lang: s.string("The language code of the advice."),
    }),
  }),
  defineProviderAction(service, {
    name: "convert_currency",
    description: "Convert an amount between currencies using APIVerve Currency Converter.",
    inputSchema: s.object("The input payload for converting currency with APIVerve.", {
      value: s.number("The amount to convert.", { minimum: 0 }),
      from: currencyCodeField,
      to: currencyCodeField,
    }),
    outputSchema: s.object("The response returned by APIVerve Currency Converter.", {
      from: s.string("The source currency code returned by APIVerve."),
      to: s.string("The destination currency code returned by APIVerve."),
      value: s.number("The source amount returned by APIVerve."),
      convertedValue: s.number("The converted amount returned by APIVerve."),
      rate: s.number("The exchange rate returned by APIVerve."),
      change24h: s.nullable(s.number("The 24-hour rate change returned by APIVerve.")),
      change24hPct: s.nullable(s.number("The 24-hour percentage rate change returned by APIVerve.")),
      changeDirection: s.nullable(s.string("The 24-hour change direction returned by APIVerve.")),
      high24h: s.nullable(s.number("The 24-hour high rate returned by APIVerve.")),
      low24h: s.nullable(s.number("The 24-hour low rate returned by APIVerve.")),
    }),
  }),
  defineProviderAction(service, {
    name: "calculate_age",
    description: "Calculate age details from a date of birth using APIVerve Age Calculator.",
    inputSchema: s.object("The input payload for calculating age with APIVerve.", {
      dob: s.date("The date of birth to calculate from in YYYY-MM-DD format."),
    }),
    outputSchema: s.object("The response returned by APIVerve Age Calculator.", {
      dob: s.string("The date of birth returned by APIVerve."),
      ageBreakdown: numericBreakdownSchema,
      ageWords: s.object("Age wording returned by APIVerve.", {
        years: s.string("The age in words returned by APIVerve."),
        ordinal: s.string("The ordinal age in words returned by APIVerve."),
        full: s.string("The full age phrase returned by APIVerve."),
        locale: s.string("The locale used by APIVerve for age words."),
      }),
      timezone: s.string("The timezone used by APIVerve."),
      locale: s.string("The locale used by APIVerve."),
      nextBirthday: nextBirthdayBreakdownSchema,
      insights: s.object("Age insight fields returned by APIVerve.", {
        generation: s.nullable(s.string("The generation returned by APIVerve.")),
        zodiacSign: s.nullable(s.string("The zodiac sign returned by APIVerve.")),
        chineseZodiac: s.nullable(s.string("The Chinese zodiac sign returned by APIVerve.")),
        birthstone: s.nullable(s.string("The birthstone returned by APIVerve.")),
        dayOfWeekBorn: s.nullable(s.string("The day of week born returned by APIVerve.")),
        isLeapYearBirth: s.nullable(s.boolean("Whether the birth year is a leap year according to APIVerve.")),
        milestones: s.object("Age milestone flags returned by APIVerve.", {
          canVoteUS: s.nullable(s.boolean("Whether the age can vote in the US.")),
          canDrinkUS: s.nullable(s.boolean("Whether the age can drink in the US.")),
          canRentCarUS: s.nullable(s.boolean("Whether the age can rent a car in the US.")),
          seniorDiscount: s.nullable(s.boolean("Whether the age qualifies for senior discounts.")),
        }),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_air_quality",
    description: "Get current air quality by city or ZIP code using APIVerve Air Quality.",
    inputSchema: airQualityInputSchema,
    outputSchema: s.object("The response returned by APIVerve Air Quality.", {
      pm25: s.number("PM2.5 value returned by APIVerve."),
      pm10: s.number("PM10 value returned by APIVerve."),
      carbonMonoxide: s.number("Carbon monoxide value returned by APIVerve."),
      ozone: s.number("Ozone value returned by APIVerve."),
      nitrogenDioxide: s.number("Nitrogen dioxide value returned by APIVerve."),
      sulfurDioxide: s.number("Sulfur dioxide value returned by APIVerve."),
      usEpaIndex: s.number("US EPA air quality index returned by APIVerve."),
      gbDefraIndex: s.number("GB DEFRA air quality index returned by APIVerve."),
      recommendation: s.string("Health recommendation returned by APIVerve."),
      city: s.nullable(s.string("City name returned by APIVerve when present.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_airport_distance",
    description: "Get distance and flight estimates between two airports using IATA codes.",
    inputSchema: s.object("The input payload for getting APIVerve airport distance by IATA codes.", {
      iata1: iataCodeField,
      iata2: iataCodeField,
    }),
    outputSchema: s.object("The response returned by APIVerve Airport Distance.", {
      distanceMiles: s.number("Distance in miles returned by APIVerve."),
      distanceKm: s.number("Distance in kilometers returned by APIVerve."),
      distanceNauticalMiles: s.number("Distance in nautical miles returned by APIVerve."),
      estimatedFlightTime: s.string("Estimated flight time returned by APIVerve."),
      timezoneDiffHours: s.nullable(s.number("Timezone difference in hours returned by APIVerve.")),
      bearing: s.nullable(s.number("Bearing in degrees returned by APIVerve.")),
      direction: s.nullable(s.string("Compass direction returned by APIVerve.")),
      isInternational: s.nullable(s.boolean("Whether APIVerve marks the route as international.")),
      carbonEstimateKg: s.nullable(s.number("Estimated carbon emissions in kilograms returned by APIVerve.")),
      airport1: airportDistanceAirportSchema,
      airport2: airportDistanceAirportSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_airport",
    description: "Look up airport information by IATA code using APIVerve Airports Lookup.",
    inputSchema: s.object("The input payload for looking up an APIVerve airport by IATA code.", {
      iata: iataCodeField,
    }),
    outputSchema: lookupAirportSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_airlines",
    description: "Look up airlines by name or IATA code using APIVerve Airline Lookup.",
    inputSchema: lookupAirlinesInputSchema,
    outputSchema: s.object("The response returned by APIVerve Airline Lookup.", {
      airlines: s.array("The airlines returned by APIVerve.", airlineSchema),
    }),
  }),
];

export type ApiverveActionName = (typeof apiverveActions)[number]["name"];
