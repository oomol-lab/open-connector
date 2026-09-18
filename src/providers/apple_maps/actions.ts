import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";

export const appleMapsActions: readonly ProviderActionDefinition[] = [
  {
    service: "apple_maps",
    name: "geocode_address",
    operationType: "read",
    description:
      "Convert an address into coordinates with Apple Maps. Returns the places Apple matched to the address with their coordinate, map region and structured address. Pass limitToCountries, searchLocation, searchRegion or userLocation to steer an ambiguous address toward the right area.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The address to geocode, such as 1 Apple Park Way, Cupertino, CA.",
        },
        limitToCountries: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z]{2}$",
            description: "A two-letter ISO 3166-1 alpha-2 country code, such as US.",
          },
          minItems: 1,
          description:
            "Two-letter ISO 3166-1 country codes that limit the results, such as US and CA. With two or more countries Apple returns the best available results for some or all of them rather than everything related to the query in each.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
        searchLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description: "A location Apple uses as a hint for the address.",
        },
        searchRegion: {
          type: "object",
          properties: {
            northLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The north latitude of the region, from -90 to 90.",
            },
            eastLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The east longitude of the region, from -180 to 180.",
            },
            southLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The south latitude of the region, from -90 to 90.",
            },
            westLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The west longitude of the region, from -180 to 180.",
            },
          },
          required: ["northLatitude", "eastLongitude", "southLatitude", "westLongitude"],
          additionalProperties: false,
          description: "A region Apple uses as a hint for the address.",
        },
        userLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description:
            "The location of the user. Apple may use it as a fallback hint when searchLocation is not given.",
        },
      },
      required: ["query"],
      additionalProperties: false,
      description: "The address to geocode and optional hints that narrow the results.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "An opaque Place ID that identifies the place.",
              },
              alternateIds: {
                type: "array",
                items: {
                  type: "string",
                  description: "One alternate Place ID.",
                },
                description: "Other Place IDs for the same place.",
              },
              name: {
                type: "string",
                description: "A place name for display.",
              },
              coordinate: {
                type: "object",
                properties: {
                  latitude: {
                    type: "number",
                    description: "Latitude in decimal degrees.",
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude in decimal degrees.",
                  },
                },
                additionalProperties: true,
                description: "The latitude and longitude of the place.",
              },
              displayMapRegion: {
                type: "object",
                properties: {
                  northLatitude: {
                    type: "number",
                    description: "The north latitude of the region.",
                  },
                  eastLongitude: {
                    type: "number",
                    description: "The east longitude of the region.",
                  },
                  southLatitude: {
                    type: "number",
                    description: "The south latitude of the region.",
                  },
                  westLongitude: {
                    type: "number",
                    description: "The west longitude of the region.",
                  },
                },
                additionalProperties: true,
                description: "The map region associated with the place.",
              },
              formattedAddressLines: {
                type: "array",
                items: {
                  type: "string",
                  description: "One address line.",
                },
                description: "The address of the place, formatted by the conventions of its country or region.",
              },
              structuredAddress: {
                type: "object",
                properties: {
                  administrativeArea: {
                    type: "string",
                    description: "The state or province.",
                  },
                  administrativeAreaCode: {
                    type: "string",
                    description: "The short code for the state or area.",
                  },
                  subAdministrativeArea: {
                    type: "string",
                    description: "The secondary administrative division, such as a county.",
                  },
                  locality: {
                    type: "string",
                    description: "The city.",
                  },
                  subLocality: {
                    type: "string",
                    description: "The name of the area within the locality.",
                  },
                  postCode: {
                    type: "string",
                    description: "The postal code.",
                  },
                  thoroughfare: {
                    type: "string",
                    description: "The street name.",
                  },
                  subThoroughfare: {
                    type: "string",
                    description: "The number on the street.",
                  },
                  fullThoroughfare: {
                    type: "string",
                    description: "A combination of thoroughfare and subThoroughfare.",
                  },
                  areasOfInterest: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One area name.",
                    },
                    description: "Common names of the area in which the place resides.",
                  },
                  dependentLocalities: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One local area name.",
                    },
                    description: "Common names for the local area or neighborhood.",
                  },
                },
                additionalProperties: true,
                description:
                  "The address of the place broken into components. Apple omits components it has no value for.",
              },
              country: {
                type: "string",
                description: "The country or region of the place.",
              },
              countryCode: {
                type: "string",
                description: "The two-letter country code of the place.",
              },
            },
            additionalProperties: true,
            description: "A place that matches the address. Apple omits fields it has no value for.",
          },
          description: "The places Apple matched to the address.",
        },
      },
      required: ["results"],
      additionalProperties: false,
      description: "The geocoding results.",
    },
  },
  {
    service: "apple_maps",
    name: "reverse_geocode",
    operationType: "read",
    description: "Convert a latitude and longitude into the addresses at that point with Apple Maps.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description: "The coordinate to reverse geocode.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
      },
      required: ["location"],
      additionalProperties: false,
      description: "The coordinate to look up.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "An opaque Place ID that identifies the place.",
              },
              alternateIds: {
                type: "array",
                items: {
                  type: "string",
                  description: "One alternate Place ID.",
                },
                description: "Other Place IDs for the same place.",
              },
              name: {
                type: "string",
                description: "A place name for display.",
              },
              coordinate: {
                type: "object",
                properties: {
                  latitude: {
                    type: "number",
                    description: "Latitude in decimal degrees.",
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude in decimal degrees.",
                  },
                },
                additionalProperties: true,
                description: "The latitude and longitude of the place.",
              },
              displayMapRegion: {
                type: "object",
                properties: {
                  northLatitude: {
                    type: "number",
                    description: "The north latitude of the region.",
                  },
                  eastLongitude: {
                    type: "number",
                    description: "The east longitude of the region.",
                  },
                  southLatitude: {
                    type: "number",
                    description: "The south latitude of the region.",
                  },
                  westLongitude: {
                    type: "number",
                    description: "The west longitude of the region.",
                  },
                },
                additionalProperties: true,
                description: "The map region associated with the place.",
              },
              formattedAddressLines: {
                type: "array",
                items: {
                  type: "string",
                  description: "One address line.",
                },
                description: "The address of the place, formatted by the conventions of its country or region.",
              },
              structuredAddress: {
                type: "object",
                properties: {
                  administrativeArea: {
                    type: "string",
                    description: "The state or province.",
                  },
                  administrativeAreaCode: {
                    type: "string",
                    description: "The short code for the state or area.",
                  },
                  subAdministrativeArea: {
                    type: "string",
                    description: "The secondary administrative division, such as a county.",
                  },
                  locality: {
                    type: "string",
                    description: "The city.",
                  },
                  subLocality: {
                    type: "string",
                    description: "The name of the area within the locality.",
                  },
                  postCode: {
                    type: "string",
                    description: "The postal code.",
                  },
                  thoroughfare: {
                    type: "string",
                    description: "The street name.",
                  },
                  subThoroughfare: {
                    type: "string",
                    description: "The number on the street.",
                  },
                  fullThoroughfare: {
                    type: "string",
                    description: "A combination of thoroughfare and subThoroughfare.",
                  },
                  areasOfInterest: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One area name.",
                    },
                    description: "Common names of the area in which the place resides.",
                  },
                  dependentLocalities: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One local area name.",
                    },
                    description: "Common names for the local area or neighborhood.",
                  },
                },
                additionalProperties: true,
                description:
                  "The address of the place broken into components. Apple omits components it has no value for.",
              },
              country: {
                type: "string",
                description: "The country or region of the place.",
              },
              countryCode: {
                type: "string",
                description: "The two-letter country code of the place.",
              },
            },
            additionalProperties: true,
            description: "A place at the coordinate. Apple omits fields it has no value for.",
          },
          description: "The places Apple found at the coordinate.",
        },
      },
      required: ["results"],
      additionalProperties: false,
      description: "The reverse geocoding results.",
    },
  },
  {
    service: "apple_maps",
    name: "search_places",
    description:
      "Search Apple Maps for places and points of interest by name, address or category. Filter by point of interest category, address category, result type and country, bias the search with a location or region, and page through large result sets with enablePagination and pageToken.",
    operationType: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "What to search for, such as eiffel tower or coffee.",
        },
        includePoiCategories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Airport",
              "AirportGate",
              "AirportTerminal",
              "AmusementPark",
              "AnimalService",
              "Aquarium",
              "ATM",
              "AutomotiveRepair",
              "Bakery",
              "Bank",
              "Baseball",
              "Basketball",
              "Beach",
              "Beauty",
              "Bowling",
              "Brewery",
              "Cafe",
              "Campground",
              "CarRental",
              "Castle",
              "ConventionCenter",
              "Distillery",
              "EVCharger",
              "Fairground",
              "FireStation",
              "Fishing",
              "FitnessCenter",
              "FoodMarket",
              "Fortress",
              "GasStation",
              "GoKart",
              "Golf",
              "Hiking",
              "Hospital",
              "Hotel",
              "Kayaking",
              "Landmark",
              "Laundry",
              "Library",
              "Mailbox",
              "Marina",
              "MiniGolf",
              "MovieTheater",
              "Museum",
              "MusicVenue",
              "NationalMonument",
              "NationalPark",
              "Nightlife",
              "Park",
              "Parking",
              "Pharmacy",
              "Planetarium",
              "Playground",
              "Police",
              "PostOffice",
              "PublicTransport",
              "ReligiousSite",
              "Restaurant",
              "Restroom",
              "RockClimbing",
              "RVPark",
              "School",
              "SkatePark",
              "Skating",
              "Skiing",
              "Soccer",
              "Spa",
              "Stadium",
              "Store",
              "Surfing",
              "Swimming",
              "Tennis",
              "Theater",
              "University",
              "Volleyball",
              "Winery",
              "Zoo",
            ],
            description: "A point of interest category.",
          },
          minItems: 1,
          description: "Point of interest categories to include in the results, such as Restaurant and Cafe.",
        },
        excludePoiCategories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Airport",
              "AirportGate",
              "AirportTerminal",
              "AmusementPark",
              "AnimalService",
              "Aquarium",
              "ATM",
              "AutomotiveRepair",
              "Bakery",
              "Bank",
              "Baseball",
              "Basketball",
              "Beach",
              "Beauty",
              "Bowling",
              "Brewery",
              "Cafe",
              "Campground",
              "CarRental",
              "Castle",
              "ConventionCenter",
              "Distillery",
              "EVCharger",
              "Fairground",
              "FireStation",
              "Fishing",
              "FitnessCenter",
              "FoodMarket",
              "Fortress",
              "GasStation",
              "GoKart",
              "Golf",
              "Hiking",
              "Hospital",
              "Hotel",
              "Kayaking",
              "Landmark",
              "Laundry",
              "Library",
              "Mailbox",
              "Marina",
              "MiniGolf",
              "MovieTheater",
              "Museum",
              "MusicVenue",
              "NationalMonument",
              "NationalPark",
              "Nightlife",
              "Park",
              "Parking",
              "Pharmacy",
              "Planetarium",
              "Playground",
              "Police",
              "PostOffice",
              "PublicTransport",
              "ReligiousSite",
              "Restaurant",
              "Restroom",
              "RockClimbing",
              "RVPark",
              "School",
              "SkatePark",
              "Skating",
              "Skiing",
              "Soccer",
              "Spa",
              "Stadium",
              "Store",
              "Surfing",
              "Swimming",
              "Tennis",
              "Theater",
              "University",
              "Volleyball",
              "Winery",
              "Zoo",
            ],
            description: "A point of interest category.",
          },
          minItems: 1,
          description: "Point of interest categories to leave out of the results, such as Restaurant and Cafe.",
        },
        limitToCountries: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z]{2}$",
            description: "A two-letter ISO 3166-1 alpha-2 country code, such as US.",
          },
          minItems: 1,
          description:
            "Two-letter ISO 3166-1 country codes that limit the results, such as US and CA. With two or more countries Apple returns the best available results for some or all of them rather than everything related to the query in each.",
        },
        resultTypeFilter: {
          type: "array",
          items: {
            type: "string",
            enum: ["poi", "address", "physicalFeature", "pointOfInterest"],
            description: "A result type.",
          },
          minItems: 1,
          description:
            "The kinds of results to include. List address here when includeAddressCategories or excludeAddressCategories is set.",
        },
        includeAddressCategories: {
          type: "array",
          items: {
            type: "string",
            enum: ["Country", "AdministrativeArea", "SubAdministrativeArea", "Locality", "SubLocality", "PostalCode"],
            description: "An address category.",
          },
          minItems: 1,
          description:
            "Address categories to include in the results, such as SubLocality and PostalCode. Apple requires address in resultTypeFilter when this is set.",
        },
        excludeAddressCategories: {
          type: "array",
          items: {
            type: "string",
            enum: ["Country", "AdministrativeArea", "SubAdministrativeArea", "Locality", "SubLocality", "PostalCode"],
            description: "An address category.",
          },
          minItems: 1,
          description:
            "Address categories to leave out of the results, such as Country and AdministrativeArea. Apple requires address in resultTypeFilter when this is set.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
        searchLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description:
            "A location Apple uses as a hint for the query. When it is not given, Apple falls back to userLocation and searchRegion.",
        },
        searchRegion: {
          type: "object",
          properties: {
            northLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The north latitude of the region, from -90 to 90.",
            },
            eastLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The east longitude of the region, from -180 to 180.",
            },
            southLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The south latitude of the region, from -90 to 90.",
            },
            westLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The west longitude of the region, from -180 to 180.",
            },
          },
          required: ["northLatitude", "eastLongitude", "southLatitude", "westLongitude"],
          additionalProperties: false,
          description: "A region Apple uses as a hint for the query.",
        },
        userLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description:
            "The location of the user. Apple may use it as a fallback hint when searchLocation is not given.",
        },
        searchRegionPriority: {
          type: "string",
          enum: ["default", "required"],
          description: "How important searchRegion is to the results. Apple documents the values default and required.",
        },
        enablePagination: {
          type: "boolean",
          description:
            "Set to true to ask Apple for paginated results; the response then carries paginationInfo with the tokens for other pages. Apple defaults to false.",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description:
            "The page to return, taken from nextPageToken or prevPageToken in the paginationInfo of an earlier search_places call.",
        },
      },
      required: ["query"],
      additionalProperties: false,
      description: "What to search for, with optional filters and hints.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "An opaque Place ID that identifies the place.",
              },
              alternateIds: {
                type: "array",
                items: {
                  type: "string",
                  description: "One alternate Place ID.",
                },
                description: "Other Place IDs for the same place.",
              },
              name: {
                type: "string",
                description: "A place name for display.",
              },
              coordinate: {
                type: "object",
                properties: {
                  latitude: {
                    type: "number",
                    description: "Latitude in decimal degrees.",
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude in decimal degrees.",
                  },
                },
                additionalProperties: true,
                description: "The latitude and longitude of the place.",
              },
              displayMapRegion: {
                type: "object",
                properties: {
                  northLatitude: {
                    type: "number",
                    description: "The north latitude of the region.",
                  },
                  eastLongitude: {
                    type: "number",
                    description: "The east longitude of the region.",
                  },
                  southLatitude: {
                    type: "number",
                    description: "The south latitude of the region.",
                  },
                  westLongitude: {
                    type: "number",
                    description: "The west longitude of the region.",
                  },
                },
                additionalProperties: true,
                description: "The map region associated with the place.",
              },
              formattedAddressLines: {
                type: "array",
                items: {
                  type: "string",
                  description: "One address line.",
                },
                description: "The address of the place, formatted by the conventions of its country or region.",
              },
              structuredAddress: {
                type: "object",
                properties: {
                  administrativeArea: {
                    type: "string",
                    description: "The state or province.",
                  },
                  administrativeAreaCode: {
                    type: "string",
                    description: "The short code for the state or area.",
                  },
                  subAdministrativeArea: {
                    type: "string",
                    description: "The secondary administrative division, such as a county.",
                  },
                  locality: {
                    type: "string",
                    description: "The city.",
                  },
                  subLocality: {
                    type: "string",
                    description: "The name of the area within the locality.",
                  },
                  postCode: {
                    type: "string",
                    description: "The postal code.",
                  },
                  thoroughfare: {
                    type: "string",
                    description: "The street name.",
                  },
                  subThoroughfare: {
                    type: "string",
                    description: "The number on the street.",
                  },
                  fullThoroughfare: {
                    type: "string",
                    description: "A combination of thoroughfare and subThoroughfare.",
                  },
                  areasOfInterest: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One area name.",
                    },
                    description: "Common names of the area in which the place resides.",
                  },
                  dependentLocalities: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One local area name.",
                    },
                    description: "Common names for the local area or neighborhood.",
                  },
                },
                additionalProperties: true,
                description:
                  "The address of the place broken into components. Apple omits components it has no value for.",
              },
              country: {
                type: "string",
                description: "The country or region of the place.",
              },
              countryCode: {
                type: "string",
                description: "The two-letter country code of the place.",
              },
              poiCategory: {
                type: "string",
                description: "The point of interest category of the place, such as Cafe.",
              },
            },
            additionalProperties: true,
            description: "A place that matches the search. Apple omits fields it has no value for.",
          },
          description: "The places that match the search.",
        },
        displayMapRegion: {
          type: ["object", "null"],
          properties: {
            northLatitude: {
              type: "number",
              description: "The north latitude of the region.",
            },
            eastLongitude: {
              type: "number",
              description: "The east longitude of the region.",
            },
            southLatitude: {
              type: "number",
              description: "The south latitude of the region.",
            },
            westLongitude: {
              type: "number",
              description: "The west longitude of the region.",
            },
          },
          additionalProperties: true,
          description: "A region that encloses the results, or null when Apple returns none.",
        },
        paginationInfo: {
          type: ["object", "null"],
          properties: {
            nextPageToken: {
              type: "string",
              description: "Pass it as pageToken to get the next page.",
            },
            prevPageToken: {
              type: "string",
              description: "Pass it as pageToken to get the previous page.",
            },
            totalPageCount: {
              type: "number",
              description: "The total number of pages.",
            },
            totalResults: {
              type: "number",
              description: "The total number of results.",
            },
          },
          additionalProperties: true,
          description: "Tokens and totals for paginated results, or null when Apple returns none.",
        },
      },
      required: ["results", "displayMapRegion", "paginationInfo"],
      additionalProperties: false,
      description: "The search results.",
    },
  },
  {
    service: "apple_maps",
    name: "autocomplete_search",
    description:
      "Get autocomplete suggestions for partial search text, such as a place name or address a user is still typing, with the same category, country, result type and location filters as search_places. Each suggestion carries display lines and, when available, a coordinate and structured address. Its completionUrl is a relative /v1/search URL that can be requested through the generic proxy to fetch the full place details.",
    operationType: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The partial text to complete, such as eiffel.",
        },
        includePoiCategories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Airport",
              "AirportGate",
              "AirportTerminal",
              "AmusementPark",
              "AnimalService",
              "Aquarium",
              "ATM",
              "AutomotiveRepair",
              "Bakery",
              "Bank",
              "Baseball",
              "Basketball",
              "Beach",
              "Beauty",
              "Bowling",
              "Brewery",
              "Cafe",
              "Campground",
              "CarRental",
              "Castle",
              "ConventionCenter",
              "Distillery",
              "EVCharger",
              "Fairground",
              "FireStation",
              "Fishing",
              "FitnessCenter",
              "FoodMarket",
              "Fortress",
              "GasStation",
              "GoKart",
              "Golf",
              "Hiking",
              "Hospital",
              "Hotel",
              "Kayaking",
              "Landmark",
              "Laundry",
              "Library",
              "Mailbox",
              "Marina",
              "MiniGolf",
              "MovieTheater",
              "Museum",
              "MusicVenue",
              "NationalMonument",
              "NationalPark",
              "Nightlife",
              "Park",
              "Parking",
              "Pharmacy",
              "Planetarium",
              "Playground",
              "Police",
              "PostOffice",
              "PublicTransport",
              "ReligiousSite",
              "Restaurant",
              "Restroom",
              "RockClimbing",
              "RVPark",
              "School",
              "SkatePark",
              "Skating",
              "Skiing",
              "Soccer",
              "Spa",
              "Stadium",
              "Store",
              "Surfing",
              "Swimming",
              "Tennis",
              "Theater",
              "University",
              "Volleyball",
              "Winery",
              "Zoo",
            ],
            description: "A point of interest category.",
          },
          minItems: 1,
          description: "Point of interest categories to include in the results, such as Restaurant and Cafe.",
        },
        excludePoiCategories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Airport",
              "AirportGate",
              "AirportTerminal",
              "AmusementPark",
              "AnimalService",
              "Aquarium",
              "ATM",
              "AutomotiveRepair",
              "Bakery",
              "Bank",
              "Baseball",
              "Basketball",
              "Beach",
              "Beauty",
              "Bowling",
              "Brewery",
              "Cafe",
              "Campground",
              "CarRental",
              "Castle",
              "ConventionCenter",
              "Distillery",
              "EVCharger",
              "Fairground",
              "FireStation",
              "Fishing",
              "FitnessCenter",
              "FoodMarket",
              "Fortress",
              "GasStation",
              "GoKart",
              "Golf",
              "Hiking",
              "Hospital",
              "Hotel",
              "Kayaking",
              "Landmark",
              "Laundry",
              "Library",
              "Mailbox",
              "Marina",
              "MiniGolf",
              "MovieTheater",
              "Museum",
              "MusicVenue",
              "NationalMonument",
              "NationalPark",
              "Nightlife",
              "Park",
              "Parking",
              "Pharmacy",
              "Planetarium",
              "Playground",
              "Police",
              "PostOffice",
              "PublicTransport",
              "ReligiousSite",
              "Restaurant",
              "Restroom",
              "RockClimbing",
              "RVPark",
              "School",
              "SkatePark",
              "Skating",
              "Skiing",
              "Soccer",
              "Spa",
              "Stadium",
              "Store",
              "Surfing",
              "Swimming",
              "Tennis",
              "Theater",
              "University",
              "Volleyball",
              "Winery",
              "Zoo",
            ],
            description: "A point of interest category.",
          },
          minItems: 1,
          description: "Point of interest categories to leave out of the results, such as Restaurant and Cafe.",
        },
        limitToCountries: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z]{2}$",
            description: "A two-letter ISO 3166-1 alpha-2 country code, such as US.",
          },
          minItems: 1,
          description:
            "Two-letter ISO 3166-1 country codes that limit the results, such as US and CA. With two or more countries Apple returns the best available results for some or all of them rather than everything related to the query in each.",
        },
        resultTypeFilter: {
          type: "array",
          items: {
            type: "string",
            enum: ["poi", "address", "physicalFeature", "pointOfInterest", "query"],
            description: "A result type.",
          },
          minItems: 1,
          description:
            "The kinds of suggestions to include; query returns suggested search strings. List address here when includeAddressCategories or excludeAddressCategories is set.",
        },
        includeAddressCategories: {
          type: "array",
          items: {
            type: "string",
            enum: ["Country", "AdministrativeArea", "SubAdministrativeArea", "Locality", "SubLocality", "PostalCode"],
            description: "An address category.",
          },
          minItems: 1,
          description:
            "Address categories to include in the results, such as SubLocality and PostalCode. Apple requires address in resultTypeFilter when this is set.",
        },
        excludeAddressCategories: {
          type: "array",
          items: {
            type: "string",
            enum: ["Country", "AdministrativeArea", "SubAdministrativeArea", "Locality", "SubLocality", "PostalCode"],
            description: "An address category.",
          },
          minItems: 1,
          description:
            "Address categories to leave out of the results, such as Country and AdministrativeArea. Apple requires address in resultTypeFilter when this is set.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
        searchLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description:
            "A location Apple uses as a hint for the query. When it is not given, Apple falls back to userLocation and searchRegion.",
        },
        searchRegion: {
          type: "object",
          properties: {
            northLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The north latitude of the region, from -90 to 90.",
            },
            eastLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The east longitude of the region, from -180 to 180.",
            },
            southLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The south latitude of the region, from -90 to 90.",
            },
            westLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The west longitude of the region, from -180 to 180.",
            },
          },
          required: ["northLatitude", "eastLongitude", "southLatitude", "westLongitude"],
          additionalProperties: false,
          description: "A region Apple uses as a hint for the query.",
        },
        userLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description:
            "The location of the user. Apple may use it as a fallback hint when searchLocation is not given.",
        },
        searchRegionPriority: {
          type: "string",
          enum: ["default", "required"],
          description: "How important searchRegion is to the results. Apple documents the values default and required.",
        },
      },
      required: ["query"],
      additionalProperties: false,
      description: "The partial text to complete, with optional filters and hints.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              completionUrl: {
                type: "string",
                description:
                  "A relative URL on the /v1/search endpoint that fetches the full result for this suggestion. Request it through the generic proxy, adding lang if the result is needed in a specific language.",
              },
              displayLines: {
                type: "array",
                items: {
                  type: "string",
                  description: "One display line.",
                },
                description: "Lines of text to display for the suggestion.",
              },
              location: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description:
                  "The coordinate of the suggestion. Apple documents latitude and longitude keys but has been observed returning lat and lng.",
              },
              structuredAddress: {
                type: "object",
                properties: {
                  administrativeArea: {
                    type: "string",
                    description: "The state or province.",
                  },
                  administrativeAreaCode: {
                    type: "string",
                    description: "The short code for the state or area.",
                  },
                  subAdministrativeArea: {
                    type: "string",
                    description: "The secondary administrative division, such as a county.",
                  },
                  locality: {
                    type: "string",
                    description: "The city.",
                  },
                  subLocality: {
                    type: "string",
                    description: "The name of the area within the locality.",
                  },
                  postCode: {
                    type: "string",
                    description: "The postal code.",
                  },
                  thoroughfare: {
                    type: "string",
                    description: "The street name.",
                  },
                  subThoroughfare: {
                    type: "string",
                    description: "The number on the street.",
                  },
                  fullThoroughfare: {
                    type: "string",
                    description: "A combination of thoroughfare and subThoroughfare.",
                  },
                  areasOfInterest: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One area name.",
                    },
                    description: "Common names of the area in which the place resides.",
                  },
                  dependentLocalities: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One local area name.",
                    },
                    description: "Common names for the local area or neighborhood.",
                  },
                },
                additionalProperties: true,
                description:
                  "The address of the suggestion broken into components. Apple omits components it has no value for.",
              },
            },
            additionalProperties: true,
            description: "One autocomplete suggestion. Apple omits fields it has no value for.",
          },
          description: "The suggestions Apple returned.",
        },
      },
      required: ["results"],
      additionalProperties: false,
      description: "The autocomplete suggestions.",
    },
  },
  {
    service: "apple_maps",
    name: "get_place",
    operationType: "read",
    description: "Get one place by its Apple Maps Place ID.",
    inputSchema: {
      type: "object",
      properties: {
        placeId: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "An Apple Maps Place ID, such as the id of a place returned by another Apple Maps action.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
      },
      required: ["placeId"],
      additionalProperties: false,
      description: "The place to look up.",
    },
    outputSchema: {
      type: "object",
      properties: {
        place: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "An opaque Place ID that identifies the place.",
            },
            alternateIds: {
              type: "array",
              items: {
                type: "string",
                description: "One alternate Place ID.",
              },
              description: "Other Place IDs for the same place.",
            },
            name: {
              type: "string",
              description: "A place name for display.",
            },
            coordinate: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "Latitude in decimal degrees.",
                },
                longitude: {
                  type: "number",
                  description: "Longitude in decimal degrees.",
                },
              },
              additionalProperties: true,
              description: "The latitude and longitude of the place.",
            },
            displayMapRegion: {
              type: "object",
              properties: {
                northLatitude: {
                  type: "number",
                  description: "The north latitude of the region.",
                },
                eastLongitude: {
                  type: "number",
                  description: "The east longitude of the region.",
                },
                southLatitude: {
                  type: "number",
                  description: "The south latitude of the region.",
                },
                westLongitude: {
                  type: "number",
                  description: "The west longitude of the region.",
                },
              },
              additionalProperties: true,
              description: "The map region associated with the place.",
            },
            formattedAddressLines: {
              type: "array",
              items: {
                type: "string",
                description: "One address line.",
              },
              description: "The address of the place, formatted by the conventions of its country or region.",
            },
            structuredAddress: {
              type: "object",
              properties: {
                administrativeArea: {
                  type: "string",
                  description: "The state or province.",
                },
                administrativeAreaCode: {
                  type: "string",
                  description: "The short code for the state or area.",
                },
                subAdministrativeArea: {
                  type: "string",
                  description: "The secondary administrative division, such as a county.",
                },
                locality: {
                  type: "string",
                  description: "The city.",
                },
                subLocality: {
                  type: "string",
                  description: "The name of the area within the locality.",
                },
                postCode: {
                  type: "string",
                  description: "The postal code.",
                },
                thoroughfare: {
                  type: "string",
                  description: "The street name.",
                },
                subThoroughfare: {
                  type: "string",
                  description: "The number on the street.",
                },
                fullThoroughfare: {
                  type: "string",
                  description: "A combination of thoroughfare and subThoroughfare.",
                },
                areasOfInterest: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "One area name.",
                  },
                  description: "Common names of the area in which the place resides.",
                },
                dependentLocalities: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "One local area name.",
                  },
                  description: "Common names for the local area or neighborhood.",
                },
              },
              additionalProperties: true,
              description:
                "The address of the place broken into components. Apple omits components it has no value for.",
            },
            country: {
              type: "string",
              description: "The country or region of the place.",
            },
            countryCode: {
              type: "string",
              description: "The two-letter country code of the place.",
            },
          },
          additionalProperties: true,
          description: "The place with that Place ID. Apple omits fields it has no value for.",
        },
      },
      required: ["place"],
      additionalProperties: false,
      description: "The requested place.",
    },
  },
  {
    service: "apple_maps",
    name: "get_places",
    description:
      "Get several places at once by their Apple Maps Place IDs. IDs Apple cannot resolve are listed in errors instead of failing the whole call.",
    operationType: "read",
    inputSchema: {
      type: "object",
      properties: {
        placeIds: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            pattern: "\\S",
            description: "An Apple Maps Place ID, such as the id of a place returned by another Apple Maps action.",
          },
          minItems: 1,
          description: "The Place IDs to look up.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
      },
      required: ["placeIds"],
      additionalProperties: false,
      description: "The places to look up.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "An opaque Place ID that identifies the place.",
              },
              alternateIds: {
                type: "array",
                items: {
                  type: "string",
                  description: "One alternate Place ID.",
                },
                description: "Other Place IDs for the same place.",
              },
              name: {
                type: "string",
                description: "A place name for display.",
              },
              coordinate: {
                type: "object",
                properties: {
                  latitude: {
                    type: "number",
                    description: "Latitude in decimal degrees.",
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude in decimal degrees.",
                  },
                },
                additionalProperties: true,
                description: "The latitude and longitude of the place.",
              },
              displayMapRegion: {
                type: "object",
                properties: {
                  northLatitude: {
                    type: "number",
                    description: "The north latitude of the region.",
                  },
                  eastLongitude: {
                    type: "number",
                    description: "The east longitude of the region.",
                  },
                  southLatitude: {
                    type: "number",
                    description: "The south latitude of the region.",
                  },
                  westLongitude: {
                    type: "number",
                    description: "The west longitude of the region.",
                  },
                },
                additionalProperties: true,
                description: "The map region associated with the place.",
              },
              formattedAddressLines: {
                type: "array",
                items: {
                  type: "string",
                  description: "One address line.",
                },
                description: "The address of the place, formatted by the conventions of its country or region.",
              },
              structuredAddress: {
                type: "object",
                properties: {
                  administrativeArea: {
                    type: "string",
                    description: "The state or province.",
                  },
                  administrativeAreaCode: {
                    type: "string",
                    description: "The short code for the state or area.",
                  },
                  subAdministrativeArea: {
                    type: "string",
                    description: "The secondary administrative division, such as a county.",
                  },
                  locality: {
                    type: "string",
                    description: "The city.",
                  },
                  subLocality: {
                    type: "string",
                    description: "The name of the area within the locality.",
                  },
                  postCode: {
                    type: "string",
                    description: "The postal code.",
                  },
                  thoroughfare: {
                    type: "string",
                    description: "The street name.",
                  },
                  subThoroughfare: {
                    type: "string",
                    description: "The number on the street.",
                  },
                  fullThoroughfare: {
                    type: "string",
                    description: "A combination of thoroughfare and subThoroughfare.",
                  },
                  areasOfInterest: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One area name.",
                    },
                    description: "Common names of the area in which the place resides.",
                  },
                  dependentLocalities: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "One local area name.",
                    },
                    description: "Common names for the local area or neighborhood.",
                  },
                },
                additionalProperties: true,
                description:
                  "The address of the place broken into components. Apple omits components it has no value for.",
              },
              country: {
                type: "string",
                description: "The country or region of the place.",
              },
              countryCode: {
                type: "string",
                description: "The two-letter country code of the place.",
              },
            },
            additionalProperties: true,
            description: "A place that was looked up. Apple omits fields it has no value for.",
          },
          description: "The places Apple resolved.",
        },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The Place ID that failed.",
              },
              errorCode: {
                type: "string",
                description:
                  "Why the lookup failed. Apple documents FAILED_INVALID_ID for a malformed ID, FAILED_NOT_FOUND for an ID it does not know and FAILED_INTERNAL_ERROR for any other failure.",
              },
            },
            additionalProperties: true,
            description: "A Place ID that could not be resolved.",
          },
          description: "The Place IDs Apple could not resolve, each with an error code. Empty when every ID resolved.",
        },
      },
      required: ["results", "errors"],
      additionalProperties: false,
      description: "The resolved places and the Place IDs that could not be resolved.",
    },
  },
  {
    service: "apple_maps",
    name: "get_alternate_place_ids",
    description:
      "Get the alternate Place IDs of one or more Apple Maps Place IDs. IDs Apple cannot resolve are listed in errors instead of failing the whole call.",
    operationType: "read",
    inputSchema: {
      type: "object",
      properties: {
        placeIds: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            pattern: "\\S",
            description: "An Apple Maps Place ID, such as the id of a place returned by another Apple Maps action.",
          },
          minItems: 1,
          description: "The Place IDs to look up.",
        },
      },
      required: ["placeIds"],
      additionalProperties: false,
      description: "The Place IDs to look up alternates for.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The Place ID that was looked up.",
              },
              alternateIds: {
                type: "array",
                items: {
                  type: "string",
                  description: "One alternate Place ID.",
                },
                description: "Other Place IDs for the same place.",
              },
            },
            additionalProperties: true,
            description: "The alternate IDs of one Place ID.",
          },
          description: "The alternate IDs of each Place ID Apple resolved.",
        },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The Place ID that failed.",
              },
              errorCode: {
                type: "string",
                description:
                  "Why the lookup failed. Apple documents FAILED_INVALID_ID for a malformed ID, FAILED_NOT_FOUND for an ID it does not know and FAILED_INTERNAL_ERROR for any other failure.",
              },
            },
            additionalProperties: true,
            description: "A Place ID that could not be resolved.",
          },
          description: "The Place IDs Apple could not resolve, each with an error code. Empty when every ID resolved.",
        },
      },
      required: ["results", "errors"],
      additionalProperties: false,
      description: "The alternate Place IDs and the Place IDs that could not be resolved.",
    },
  },
  {
    service: "apple_maps",
    name: "get_directions",
    description:
      "Get driving, walking or cycling directions between two places with Apple Maps. Returns the routes with their distance, duration and toll information, and the steps they reference by index. Step paths, the polyline of every step, can be large, so they are only returned when includeStepPaths is true.",
    operationType: "read",
    inputSchema: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The starting point, as an address or as latitude,longitude such as 37.7857,-122.4011.",
        },
        destination: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The destination, as an address such as San Francisco City Hall, CA, or as latitude,longitude.",
        },
        arrivalDate: {
          type: "string",
          format: "date-time",
          description:
            "When to arrive at the destination, as an ISO 8601 date-time in UTC such as 2023-04-15T16:42:00Z. Cannot be combined with departureDate. A time zone offset is converted to UTC and fractional seconds are dropped before the request, because Apple expects UTC.",
        },
        departureDate: {
          type: "string",
          format: "date-time",
          description:
            "When to leave the origin, as an ISO 8601 date-time in UTC such as 2023-04-15T16:42:00Z. Cannot be combined with arrivalDate. Apple departs now when neither is set. A time zone offset is converted to UTC and fractional seconds are dropped before the request, because Apple expects UTC.",
        },
        avoid: {
          type: "array",
          items: {
            type: "string",
            enum: ["Tolls"],
            description: "A feature to avoid.",
          },
          minItems: 1,
          description:
            "Features to avoid. Routes without them rank higher, but Apple can still return a route with tolls when no reasonable toll-free route exists, so check hasTolls on each route.",
        },
        lang: {
          type: "string",
          minLength: 1,
          pattern: "\\S",
          description: "The BCP 47 language code Apple uses for the response, such as en-US. Apple defaults to en-US.",
        },
        requestsAlternateRoutes: {
          type: "boolean",
          description: "Set to true to get additional routes when available. Apple defaults to false.",
        },
        searchLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description: "A location Apple uses as a hint when resolving an address given as origin or destination.",
        },
        searchRegion: {
          type: "object",
          properties: {
            northLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The north latitude of the region, from -90 to 90.",
            },
            eastLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The east longitude of the region, from -180 to 180.",
            },
            southLatitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "The south latitude of the region, from -90 to 90.",
            },
            westLongitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "The west longitude of the region, from -180 to 180.",
            },
          },
          required: ["northLatitude", "eastLongitude", "southLatitude", "westLongitude"],
          additionalProperties: false,
          description: "A region Apple uses as a hint when resolving an address given as origin or destination.",
        },
        userLocation: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description:
            "The location of the user. Apple may use it as a fallback hint when searchLocation is not given.",
        },
        transportType: {
          type: "string",
          enum: ["Automobile", "Walking", "Cycling"],
          description: "The mode of transportation. Apple defaults to Automobile.",
        },
        includeStepPaths: {
          type: "boolean",
          default: false,
          description:
            "Set to true to include stepPaths, the polyline of every step. Defaults to false, which returns stepPaths as null because the polylines can be large.",
        },
      },
      required: ["origin", "destination"],
      additionalProperties: false,
      description: "The trip to get directions for.",
    },
    outputSchema: {
      type: "object",
      properties: {
        origin: {
          type: ["object", "null"],
          properties: {
            id: {
              type: "string",
              description: "An opaque Place ID that identifies the place.",
            },
            alternateIds: {
              type: "array",
              items: {
                type: "string",
                description: "One alternate Place ID.",
              },
              description: "Other Place IDs for the same place.",
            },
            name: {
              type: "string",
              description: "A place name for display.",
            },
            coordinate: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "Latitude in decimal degrees.",
                },
                longitude: {
                  type: "number",
                  description: "Longitude in decimal degrees.",
                },
              },
              additionalProperties: true,
              description: "The latitude and longitude of the place.",
            },
            displayMapRegion: {
              type: "object",
              properties: {
                northLatitude: {
                  type: "number",
                  description: "The north latitude of the region.",
                },
                eastLongitude: {
                  type: "number",
                  description: "The east longitude of the region.",
                },
                southLatitude: {
                  type: "number",
                  description: "The south latitude of the region.",
                },
                westLongitude: {
                  type: "number",
                  description: "The west longitude of the region.",
                },
              },
              additionalProperties: true,
              description: "The map region associated with the place.",
            },
            formattedAddressLines: {
              type: "array",
              items: {
                type: "string",
                description: "One address line.",
              },
              description: "The address of the place, formatted by the conventions of its country or region.",
            },
            structuredAddress: {
              type: "object",
              properties: {
                administrativeArea: {
                  type: "string",
                  description: "The state or province.",
                },
                administrativeAreaCode: {
                  type: "string",
                  description: "The short code for the state or area.",
                },
                subAdministrativeArea: {
                  type: "string",
                  description: "The secondary administrative division, such as a county.",
                },
                locality: {
                  type: "string",
                  description: "The city.",
                },
                subLocality: {
                  type: "string",
                  description: "The name of the area within the locality.",
                },
                postCode: {
                  type: "string",
                  description: "The postal code.",
                },
                thoroughfare: {
                  type: "string",
                  description: "The street name.",
                },
                subThoroughfare: {
                  type: "string",
                  description: "The number on the street.",
                },
                fullThoroughfare: {
                  type: "string",
                  description: "A combination of thoroughfare and subThoroughfare.",
                },
                areasOfInterest: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "One area name.",
                  },
                  description: "Common names of the area in which the place resides.",
                },
                dependentLocalities: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "One local area name.",
                  },
                  description: "Common names for the local area or neighborhood.",
                },
              },
              additionalProperties: true,
              description:
                "The address of the place broken into components. Apple omits components it has no value for.",
            },
            country: {
              type: "string",
              description: "The country or region of the place.",
            },
            countryCode: {
              type: "string",
              description: "The two-letter country code of the place.",
            },
            center: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "Latitude in decimal degrees.",
                },
                longitude: {
                  type: "number",
                  description: "Longitude in decimal degrees.",
                },
              },
              additionalProperties: true,
              description:
                "The coordinate of the place. Apple has been observed returning it here instead of in coordinate.",
            },
            telephone: {
              type: "string",
              description: "The telephone number of the place.",
            },
            urls: {
              type: "array",
              items: {
                type: "string",
                description: "One URL.",
              },
              description: "Web pages of the place.",
            },
          },
          additionalProperties: true,
          description: "The place Apple resolved the origin to, or null when Apple returns none.",
        },
        destination: {
          type: ["object", "null"],
          properties: {
            id: {
              type: "string",
              description: "An opaque Place ID that identifies the place.",
            },
            alternateIds: {
              type: "array",
              items: {
                type: "string",
                description: "One alternate Place ID.",
              },
              description: "Other Place IDs for the same place.",
            },
            name: {
              type: "string",
              description: "A place name for display.",
            },
            coordinate: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "Latitude in decimal degrees.",
                },
                longitude: {
                  type: "number",
                  description: "Longitude in decimal degrees.",
                },
              },
              additionalProperties: true,
              description: "The latitude and longitude of the place.",
            },
            displayMapRegion: {
              type: "object",
              properties: {
                northLatitude: {
                  type: "number",
                  description: "The north latitude of the region.",
                },
                eastLongitude: {
                  type: "number",
                  description: "The east longitude of the region.",
                },
                southLatitude: {
                  type: "number",
                  description: "The south latitude of the region.",
                },
                westLongitude: {
                  type: "number",
                  description: "The west longitude of the region.",
                },
              },
              additionalProperties: true,
              description: "The map region associated with the place.",
            },
            formattedAddressLines: {
              type: "array",
              items: {
                type: "string",
                description: "One address line.",
              },
              description: "The address of the place, formatted by the conventions of its country or region.",
            },
            structuredAddress: {
              type: "object",
              properties: {
                administrativeArea: {
                  type: "string",
                  description: "The state or province.",
                },
                administrativeAreaCode: {
                  type: "string",
                  description: "The short code for the state or area.",
                },
                subAdministrativeArea: {
                  type: "string",
                  description: "The secondary administrative division, such as a county.",
                },
                locality: {
                  type: "string",
                  description: "The city.",
                },
                subLocality: {
                  type: "string",
                  description: "The name of the area within the locality.",
                },
                postCode: {
                  type: "string",
                  description: "The postal code.",
                },
                thoroughfare: {
                  type: "string",
                  description: "The street name.",
                },
                subThoroughfare: {
                  type: "string",
                  description: "The number on the street.",
                },
                fullThoroughfare: {
                  type: "string",
                  description: "A combination of thoroughfare and subThoroughfare.",
                },
                areasOfInterest: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "One area name.",
                  },
                  description: "Common names of the area in which the place resides.",
                },
                dependentLocalities: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "One local area name.",
                  },
                  description: "Common names for the local area or neighborhood.",
                },
              },
              additionalProperties: true,
              description:
                "The address of the place broken into components. Apple omits components it has no value for.",
            },
            country: {
              type: "string",
              description: "The country or region of the place.",
            },
            countryCode: {
              type: "string",
              description: "The two-letter country code of the place.",
            },
            center: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "Latitude in decimal degrees.",
                },
                longitude: {
                  type: "number",
                  description: "Longitude in decimal degrees.",
                },
              },
              additionalProperties: true,
              description:
                "The coordinate of the place. Apple has been observed returning it here instead of in coordinate.",
            },
            telephone: {
              type: "string",
              description: "The telephone number of the place.",
            },
            urls: {
              type: "array",
              items: {
                type: "string",
                description: "One URL.",
              },
              description: "Web pages of the place.",
            },
          },
          additionalProperties: true,
          description: "The place Apple resolved the destination to, or null when Apple returns none.",
        },
        routes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "A route name for display.",
              },
              distanceMeters: {
                type: "integer",
                description: "The total distance of the route in meters.",
              },
              durationSeconds: {
                type: "integer",
                description:
                  "The estimated time to travel the route in seconds, including traffic at the requested departure or arrival time, or current traffic when neither was given.",
              },
              transportType: {
                type: "string",
                description:
                  "The mode of transportation of the route. Apple has been observed returning it in upper case, such as AUTOMOBILE.",
              },
              stepIndexes: {
                type: "array",
                items: {
                  type: "integer",
                  description: "An index into steps.",
                },
                description: "The steps of this route, as indexes into steps.",
              },
              hasTolls: {
                type: "boolean",
                description: "Whether the route has tolls. When Apple omits it, the route may or may not have tolls.",
              },
            },
            additionalProperties: true,
            description: "One route from the origin to the destination.",
          },
          description:
            "The routes from the origin to the destination. Each route lists its steps as indexes into steps.",
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              stepPathIndex: {
                type: "integer",
                description: "The path of this step, as an index into stepPaths.",
              },
              distanceMeters: {
                type: "integer",
                description: "The distance of the step in meters.",
              },
              durationSeconds: {
                type: "integer",
                description: "The estimated time to travel the step in seconds.",
              },
              instructions: {
                type: "string",
                description: "The localized instruction for the step, in the language set by lang.",
              },
              transportType: {
                type: "string",
                description: "The mode of transportation of this step, present when it differs from the route.",
              },
            },
            additionalProperties: true,
            description: "One step of a route.",
          },
          description: "All steps across all routes. Each step references its polyline as an index into stepPaths.",
        },
        stepPaths: {
          type: ["array", "null"],
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "Latitude in decimal degrees.",
                },
                longitude: {
                  type: "number",
                  description: "Longitude in decimal degrees.",
                },
              },
              additionalProperties: true,
              description: "One point of the step path.",
            },
            description: "One step path, as an ordered list of coordinates.",
          },
          description:
            "The polyline of every step, referenced by stepPathIndex, when includeStepPaths is true; otherwise null. The last point of one step path is the first point of the next.",
        },
      },
      required: ["origin", "destination", "routes", "steps", "stepPaths"],
      additionalProperties: false,
      description: "The directions between the origin and the destination.",
    },
  },
  {
    service: "apple_maps",
    name: "get_etas",
    description:
      "Estimate the travel time and distance from one origin to up to 10 destinations with Apple Maps, by car, public transit, on foot or by bicycle.",
    operationType: "read",
    inputSchema: {
      type: "object",
      properties: {
        origin: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude in decimal degrees, from -90 to 90.",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude in decimal degrees, from -180 to 180.",
            },
          },
          required: ["latitude", "longitude"],
          additionalProperties: false,
          description: "The starting point.",
        },
        destinations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              latitude: {
                type: "number",
                minimum: -90,
                maximum: 90,
                description: "Latitude in decimal degrees, from -90 to 90.",
              },
              longitude: {
                type: "number",
                minimum: -180,
                maximum: 180,
                description: "Longitude in decimal degrees, from -180 to 180.",
              },
            },
            required: ["latitude", "longitude"],
            additionalProperties: false,
            description: "One destination.",
          },
          minItems: 1,
          maxItems: 10,
          description: "The destinations to estimate, from 1 to 10.",
        },
        transportType: {
          type: "string",
          enum: ["Automobile", "Transit", "Walking", "Cycling"],
          description: "The mode of transportation. Apple defaults to Automobile.",
        },
        departureDate: {
          type: "string",
          format: "date-time",
          description:
            "When to leave the origin, as an ISO 8601 date-time in UTC such as 2020-09-15T16:42:00Z. Apple uses the current time when it is not set. A time zone offset is converted to UTC and fractional seconds are dropped before the request, because Apple expects UTC.",
        },
        arrivalDate: {
          type: "string",
          format: "date-time",
          description:
            "The intended arrival time, as an ISO 8601 date-time in UTC such as 2020-09-15T16:42:00Z. A time zone offset is converted to UTC and fractional seconds are dropped before the request, because Apple expects UTC.",
        },
      },
      required: ["origin", "destinations"],
      additionalProperties: false,
      description: "The origin and the destinations to estimate.",
    },
    outputSchema: {
      type: "object",
      properties: {
        etas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              destination: {
                type: "object",
                properties: {
                  latitude: {
                    type: "number",
                    description: "Latitude in decimal degrees.",
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude in decimal degrees.",
                  },
                },
                additionalProperties: true,
                description: "The destination this estimate is for.",
              },
              transportType: {
                type: "string",
                description:
                  "The mode of transportation Apple estimated for. Apple has been observed returning it in upper case, such as AUTOMOBILE.",
              },
              distanceMeters: {
                type: "integer",
                description: "The distance to the destination in meters.",
              },
              expectedTravelTimeSeconds: {
                type: "integer",
                description: "The estimated travel time in seconds, including delays due to traffic.",
              },
              staticTravelTimeSeconds: {
                type: "integer",
                description: "The expected travel time in seconds without traffic.",
              },
            },
            additionalProperties: true,
            description: "The estimate for one destination.",
          },
          description: "One estimate per destination.",
        },
      },
      required: ["etas"],
      additionalProperties: false,
      description: "The travel estimates.",
    },
  },
].map((action) =>
  defineProviderAction(action.service, {
    name: action.name,
    operationType: "read",
    description: action.description,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  }),
);
