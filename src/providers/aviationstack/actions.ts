import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aviationstack";

const flightStatusSchema = s.stringEnum("Flight status used to filter Aviationstack flights.", [
  "scheduled",
  "active",
  "landed",
  "cancelled",
  "incident",
  "diverted",
]);

const paginationSchema = s.object("Pagination information returned by Aviationstack.", {
  limit: s.integer("Requested page size returned by Aviationstack."),
  offset: s.integer("Number of skipped records before the current page."),
  count: s.integer("Number of records returned on the current page."),
  total: s.integer("Total number of matching records available."),
});

const rawObjectSchema = s.looseObject("The raw Aviationstack object.");
const optionalPositiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const optionalNonNegativeInteger = (description: string) => s.nonNegativeInteger(description);

const airportEndpointSchema = s.object("Normalized airport timing details returned by Aviationstack.", {
  airport: s.nullableString("Airport name returned by Aviationstack."),
  timezone: s.nullableString("Airport timezone returned by Aviationstack."),
  iata: s.nullableString("Airport IATA code returned by Aviationstack."),
  icao: s.nullableString("Airport ICAO code returned by Aviationstack."),
  terminal: s.nullableString("Terminal returned by Aviationstack."),
  gate: s.nullableString("Gate returned by Aviationstack."),
  baggage: s.nullableString("Baggage claim or belt returned by Aviationstack."),
  delay: s.nullable(s.integer("Delay in minutes returned by Aviationstack.")),
  scheduled: s.nullableString("Scheduled timestamp returned by Aviationstack."),
  estimated: s.nullableString("Estimated timestamp returned by Aviationstack."),
  actual: s.nullableString("Actual timestamp returned by Aviationstack."),
  estimatedRunway: s.nullableString("Estimated runway timestamp returned by Aviationstack."),
  actualRunway: s.nullableString("Actual runway timestamp returned by Aviationstack."),
});

const flightSchema = s.object("Normalized flight returned by Aviationstack.", {
  flightDate: s.nullableString("Flight date returned by Aviationstack."),
  flightStatus: s.nullableString("Flight status returned by Aviationstack."),
  departure: airportEndpointSchema,
  arrival: airportEndpointSchema,
  airline: s.looseObject("Normalized airline summary returned inside a flight."),
  flight: s.looseObject("Normalized flight number details returned by Aviationstack."),
  aircraft: s.nullable(s.looseObject("Normalized aircraft details returned inside a flight.")),
  live: s.nullable(s.looseObject("Normalized live aircraft position returned by Aviationstack.")),
  raw: rawObjectSchema,
});

const routeSchema = s.looseObject("Normalized airline route returned by Aviationstack.");
const airportSchema = s.looseObject("Normalized airport returned by Aviationstack.");
const airlineSchema = s.looseObject("Normalized airline returned by Aviationstack.");
const airplaneSchema = s.looseObject("Normalized airplane returned by Aviationstack.");
const aircraftTypeSchema = s.looseObject("Normalized aircraft type returned by Aviationstack.");
const taxSchema = s.looseObject("Normalized aviation tax returned by Aviationstack.");
const citySchema = s.looseObject("Normalized city returned by Aviationstack.");
const countrySchema = s.looseObject("Normalized country returned by Aviationstack.");

const commonListInput = {
  limit: optionalPositiveInteger("Maximum number of records to return."),
  offset: optionalNonNegativeInteger("Number of leading records to skip."),
};

const searchListInput = {
  ...commonListInput,
  search: s.nonEmptyString("Free-text search or autocomplete query supported by Aviationstack."),
};

export const aviationstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_flights",
    description: "Search real-time or recent historical Aviationstack flights with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Aviationstack flights.",
      {
        ...commonListInput,
        flightDate: s.date("Historical flight date in YYYY-MM-DD format."),
        flightStatus: flightStatusSchema,
        depIata: s.nonEmptyString("Departure airport IATA code such as SFO."),
        arrIata: s.nonEmptyString("Arrival airport IATA code such as DFW."),
        depIcao: s.nonEmptyString("Departure airport ICAO code such as KSFO."),
        arrIcao: s.nonEmptyString("Arrival airport ICAO code such as KDFW."),
        airlineName: s.nonEmptyString("Airline name used to filter flights."),
        airlineIata: s.nonEmptyString("Airline IATA code used to filter flights."),
        airlineIcao: s.nonEmptyString("Airline ICAO code used to filter flights."),
        flightNumber: s.nonEmptyString("Flight number used to filter flights."),
        flightIata: s.nonEmptyString("Flight IATA identifier used to filter flights."),
        flightIcao: s.nonEmptyString("Flight ICAO identifier used to filter flights."),
        minDelayDep: optionalNonNegativeInteger("Minimum departure delay in minutes."),
        minDelayArr: optionalNonNegativeInteger("Minimum arrival delay in minutes."),
        maxDelayDep: optionalNonNegativeInteger("Maximum departure delay in minutes."),
        maxDelayArr: optionalNonNegativeInteger("Maximum arrival delay in minutes."),
      },
      {
        optional: [
          "limit",
          "offset",
          "flightDate",
          "flightStatus",
          "depIata",
          "arrIata",
          "depIcao",
          "arrIcao",
          "airlineName",
          "airlineIata",
          "airlineIcao",
          "flightNumber",
          "flightIata",
          "flightIcao",
          "minDelayDep",
          "minDelayArr",
          "maxDelayDep",
          "maxDelayArr",
        ],
      },
    ),
    outputSchema: s.object("Flight search response returned by Aviationstack.", {
      flights: s.array("Flights returned by Aviationstack.", flightSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_routes",
    description: "Search Aviationstack airline routes with airport, airline, flight, and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Aviationstack routes.",
      {
        ...commonListInput,
        depIata: s.nonEmptyString("Departure airport IATA code such as SFO."),
        arrIata: s.nonEmptyString("Arrival airport IATA code such as DFW."),
        depIcao: s.nonEmptyString("Departure airport ICAO code such as KSFO."),
        arrIcao: s.nonEmptyString("Arrival airport ICAO code such as KDFW."),
        airlineIata: s.nonEmptyString("Airline IATA code used to filter routes."),
        airlineIcao: s.nonEmptyString("Airline ICAO code used to filter routes."),
        flightNumber: s.nonEmptyString("Flight number used to filter routes."),
      },
      {
        optional: ["limit", "offset", "depIata", "arrIata", "depIcao", "arrIcao", "airlineIata", "airlineIcao", "flightNumber"],
      },
    ),
    outputSchema: s.object("Route search response returned by Aviationstack.", {
      routes: s.array("Routes returned by Aviationstack.", routeSchema),
      pagination: paginationSchema,
    }),
  }),
  collectionAction("list_airports", "List or search Aviationstack airports with pagination.", searchListInput, "airports", airportSchema),
  collectionAction("list_airlines", "List or search Aviationstack airlines with pagination.", searchListInput, "airlines", airlineSchema),
  collectionAction("list_airplanes", "List or search Aviationstack airplanes with pagination.", searchListInput, "airplanes", airplaneSchema),
  collectionAction("list_aircraft_types", "List or search Aviationstack aircraft types with pagination.", searchListInput, "aircraftTypes", aircraftTypeSchema),
  collectionAction("list_taxes", "List or search Aviationstack aviation taxes with pagination.", searchListInput, "taxes", taxSchema),
  collectionAction("list_cities", "List or search Aviationstack cities with pagination.", searchListInput, "cities", citySchema),
  collectionAction("list_countries", "List or search Aviationstack countries with pagination.", searchListInput, "countries", countrySchema),
];

export type AviationstackActionName = (typeof aviationstackActions)[number]["name"];

function collectionAction(
  name: string,
  description: string,
  inputProperties: Record<string, ReturnType<typeof s.string>>,
  outputKey: string,
  itemSchema: ReturnType<typeof s.looseObject>,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema: s.object(`Input parameters for ${name}.`, inputProperties, {
      optional: ["limit", "offset", "search"],
    }),
    outputSchema: s.object(`${name} response returned by Aviationstack.`, {
      [outputKey]: s.array(`${outputKey} returned by Aviationstack.`, itemSchema),
      pagination: paginationSchema,
    }),
  });
}
