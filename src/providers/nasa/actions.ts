import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nasa";

const isoDateSchema = (description: string) => s.date(description);
const nonEmptyString = (description: string) => s.nonEmptyString(description);
const looseNasaObject = s.record("A JSON-like object returned by NASA.", s.unknown("Any JSON value returned by NASA."));

const apodOutputSchema = s.object(
  "Normalized Astronomy Picture of the Day metadata.",
  {
    date: s.string("The APOD entry date in YYYY-MM-DD format."),
    title: s.string("The title of the astronomy picture or video."),
    explanation: s.string("The explanatory text describing the APOD entry."),
    url: s.string("The URL of the APOD image or video."),
    mediaType: s.stringEnum("The media type returned by the APOD API.", ["image", "video"]),
    serviceVersion: s.string("The APOD API service version reported by NASA."),
    hdUrl: s.string("The high-resolution image URL when NASA provides one."),
    thumbnailUrl: s.string("The thumbnail URL returned for video APOD entries when thumbs=true."),
    copyright: s.string("The copyright notice when the APOD entry is not in the public domain."),
    concepts: looseNasaObject,
  },
  { optional: ["hdUrl", "thumbnailUrl", "copyright", "concepts"] },
);

const linksSchema = s.object(
  "Pagination links returned by NASA.",
  {
    self: s.string("The link for the current NASA response."),
    next: s.string("The link for the next page of results."),
    previous: s.string("The link for the previous page of results."),
    prev: s.string("The link for the previous page of results."),
  },
  { optional: ["next", "previous", "prev"] },
);

const diameterRangeSchema = s.requiredObject("Estimated diameter range for a specific unit.", {
  estimatedDiameterMin: s.number("The minimum estimated diameter for the unit."),
  estimatedDiameterMax: s.number("The maximum estimated diameter for the unit."),
});

const estimatedDiameterSchema = s.requiredObject("Estimated asteroid diameter ranges across standard units.", {
  kilometers: diameterRangeSchema,
  meters: diameterRangeSchema,
  miles: diameterRangeSchema,
  feet: diameterRangeSchema,
});

const relativeVelocitySchema = s.requiredObject("Relative velocity metrics for a close approach event.", {
  kilometersPerSecond: s.string("Relative velocity in kilometers per second."),
  kilometersPerHour: s.string("Relative velocity in kilometers per hour."),
  milesPerHour: s.string("Relative velocity in miles per hour."),
});

const missDistanceSchema = s.requiredObject("Miss distance metrics for a close approach event.", {
  astronomical: s.string("The miss distance in astronomical units."),
  lunar: s.string("The miss distance in lunar distances."),
  kilometers: s.string("The miss distance in kilometers."),
  miles: s.string("The miss distance in miles."),
});

const neoCloseApproachSchema = s.object(
  "A single close approach event for a near-Earth object.",
  {
    closeApproachDate: s.string("The close approach date in YYYY-MM-DD format."),
    closeApproachDateFull: s.string("The close approach timestamp in NASA's detailed string format."),
    epochDateCloseApproach: s.integer("The close approach timestamp as Unix time in milliseconds."),
    relativeVelocity: relativeVelocitySchema,
    missDistance: missDistanceSchema,
    orbitingBody: s.string("The body the asteroid is approaching."),
  },
  { optional: ["closeApproachDateFull", "epochDateCloseApproach", "relativeVelocity", "missDistance"] },
);

const neoSchema = s.object(
  "Normalized near-Earth object metadata.",
  {
    id: s.string("The NASA asteroid identifier."),
    neoReferenceId: s.string("The NASA near-Earth object reference identifier."),
    name: s.string("The official NASA asteroid name."),
    nameLimited: s.string("The shortened asteroid name when NASA provides one."),
    designation: s.string("The asteroid designation reported by NASA."),
    nasaJplUrl: s.string("The NASA JPL reference URL for the asteroid."),
    absoluteMagnitudeH: s.number("The asteroid absolute magnitude."),
    estimatedDiameter: estimatedDiameterSchema,
    isPotentiallyHazardousAsteroid: s.boolean("Whether NASA marks the asteroid as potentially hazardous."),
    closeApproachData: s.array("The asteroid close approach history returned by NASA.", neoCloseApproachSchema),
    orbitalData: looseNasaObject,
    links: linksSchema,
    isSentryObject: s.boolean("Whether the asteroid is present in NASA's Sentry risk table."),
    sentryDataUrl: s.string("The NASA Sentry URL for the asteroid."),
  },
  { optional: ["nameLimited", "designation", "orbitalData", "links", "isSentryObject", "sentryDataUrl"] },
);

const neoBrowseOutputSchema = s.requiredObject("A paginated browse response for NASA's near-Earth object catalog.", {
  links: linksSchema,
  page: s.requiredObject("Pagination metadata for the browse response.", {
    size: s.integer("The page size returned by NASA."),
    totalElements: s.integer("The total number of near-Earth objects."),
    totalPages: s.integer("The total number of pages in the catalog."),
    number: s.integer("The current zero-based page number."),
  }),
  nearEarthObjects: s.array("The near-Earth objects returned for the requested browse page.", neoSchema),
});

const neoLookupOutputSchema = s.requiredObject("The detailed NASA near-Earth object lookup response.", {
  nearEarthObject: neoSchema,
});

const neoSearchOutputSchema = s.requiredObject("A date-grouped near-Earth object search response.", {
  links: linksSchema,
  elementCount: s.integer("The total number of asteroid close approaches returned."),
  nearEarthObjectsByDate: s.record(
    "Near-Earth objects grouped by close approach date.",
    s.array("The near-Earth objects for the given date.", neoSchema),
  ),
});

const epicCoordinateSchema = s.requiredObject("A geographic centroid coordinate pair.", {
  lat: s.number("The latitude of the EPIC image centroid."),
  lon: s.number("The longitude of the EPIC image centroid."),
});

const epicPositionSchema = s.requiredObject("A three-dimensional J2000 position vector.", {
  x: s.number("The X coordinate in the J2000 reference frame."),
  y: s.number("The Y coordinate in the J2000 reference frame."),
  z: s.number("The Z coordinate in the J2000 reference frame."),
});

const epicAttitudeSchema = s.requiredObject("Attitude quaternions describing the DSCOVR orientation.", {
  q0: s.number("The q0 attitude quaternion component."),
  q1: s.number("The q1 attitude quaternion component."),
  q2: s.number("The q2 attitude quaternion component."),
  q3: s.number("The q3 attitude quaternion component."),
});

const epicCoordsSchema = s.object(
  "The optional nested coords block returned by EPIC.",
  {
    centroidCoordinates: epicCoordinateSchema,
    dscovrJ2000Position: epicPositionSchema,
    lunarJ2000Position: epicPositionSchema,
    sunJ2000Position: epicPositionSchema,
    attitudeQuaternions: epicAttitudeSchema,
  },
  {
    optional: [
      "centroidCoordinates",
      "dscovrJ2000Position",
      "lunarJ2000Position",
      "sunJ2000Position",
      "attitudeQuaternions",
    ],
  },
);

const epicImageSchema = s.object(
  "Normalized metadata for a single EPIC image.",
  {
    identifier: s.string("The EPIC image identifier."),
    caption: s.string("The caption for the EPIC image."),
    image: s.string("The EPIC image filename stem."),
    version: s.string("The EPIC product version."),
    date: s.string("The EPIC image capture timestamp."),
    archivePath: s.string("The unauthenticated NASA EPIC archive path constructed from the image metadata."),
    centroidCoordinates: epicCoordinateSchema,
    dscovrJ2000Position: epicPositionSchema,
    lunarJ2000Position: epicPositionSchema,
    sunJ2000Position: epicPositionSchema,
    attitudeQuaternions: epicAttitudeSchema,
    coords: epicCoordsSchema,
  },
  {
    optional: [
      "version",
      "centroidCoordinates",
      "dscovrJ2000Position",
      "lunarJ2000Position",
      "sunJ2000Position",
      "attitudeQuaternions",
      "coords",
    ],
  },
);

const epicImagesOutputSchema = s.requiredObject("An EPIC image metadata response.", {
  images: s.array("The EPIC images returned by NASA.", epicImageSchema),
});

const epicDateListOutputSchema = s.requiredObject("A listing of EPIC imagery dates.", {
  dates: s.array(s.string("A date with available EPIC imagery in YYYY-MM-DD format."), {
    description: "The dates with available EPIC imagery.",
  }),
});

function buildDonkiArrayOutputSchema(label: string, description: string) {
  return s.requiredObject(description, {
    items: s.array(label, looseNasaObject),
  });
}

const getApodInputSchema = s.object(
  "Input parameters for retrieving NASA's Astronomy Picture of the Day.",
  {
    date: isoDateSchema("The APOD date to retrieve in YYYY-MM-DD format."),
    hd: s.boolean("Whether to request the high-resolution APOD image URL when NASA provides one."),
    thumbs: s.boolean("Whether to request a video thumbnail URL when the APOD entry is a video."),
  },
  { optional: ["date", "hd", "thumbs"] },
);

const browseNeoInputSchema = s.object(
  "Input parameters for browsing NASA's near-Earth object catalog.",
  {
    page: s.nonNegativeInteger("The zero-based page number to browse."),
    size: s.positiveInteger("The number of near-Earth objects to return per page."),
  },
  { optional: ["page", "size"] },
);

const getNeoLookupInputSchema = s.requiredObject(
  "Input parameters for looking up a single near-Earth object by asteroid id.",
  {
    asteroidId: nonEmptyString("The NASA JPL SPK-ID of the asteroid to look up."),
  },
);

const searchNearEarthObjectsInputSchema = s.object(
  "Input parameters for searching near-Earth objects by close approach date.",
  {
    startDate: isoDateSchema("The start date for the close approach search in YYYY-MM-DD format."),
    endDate: isoDateSchema("The end date for the close approach search in YYYY-MM-DD format."),
  },
  { optional: ["endDate"] },
);

const donkiDateRangeShape = {
  startDate: isoDateSchema("The inclusive start date in YYYY-MM-DD format."),
  endDate: isoDateSchema("The inclusive end date in YYYY-MM-DD format."),
};

const getDonkiCmeInputSchema = s.object("Input parameters for retrieving DONKI CME events.", donkiDateRangeShape, {
  optional: ["startDate", "endDate"],
});

const getDonkiCmeAnalysisInputSchema = s.object(
  "Input parameters for retrieving DONKI CME analysis entries.",
  {
    ...donkiDateRangeShape,
    mostAccurateOnly: s.boolean("Whether to return only the most accurate CME analysis entries."),
    completeEntryOnly: s.boolean("Whether to return only complete CME analysis entries when NASA supports the filter."),
    speed: s.nonNegativeInteger("The minimum CME speed in kilometers per second."),
    halfAngle: s.integer({ minimum: 0, maximum: 180, description: "The minimum CME half-angle in degrees." }),
    catalog: s.stringEnum("The DONKI CME analysis catalog filter.", ["ALL", "SWRC_CATALOG", "JANG_ET_AL_CATALOG"]),
    keyword: nonEmptyString("The optional DONKI keyword filter for CME analysis."),
  },
  {
    optional: [
      "startDate",
      "endDate",
      "mostAccurateOnly",
      "completeEntryOnly",
      "speed",
      "halfAngle",
      "catalog",
      "keyword",
    ],
  },
);

const getDonkiIpsInputSchema = s.object(
  "Input parameters for retrieving DONKI IPS events.",
  {
    ...donkiDateRangeShape,
    location: s.stringEnum("The DONKI IPS location filter.", ["ALL", "Earth", "MESSENGER", "STEREO A", "STEREO B"]),
    catalog: s.stringEnum("The DONKI IPS catalog filter.", ["ALL", "SWRC_CATALOG", "WINSLOW_MESSENGER_ICME_CATALOG"]),
  },
  { optional: ["startDate", "endDate", "location", "catalog"] },
);

const getDonkiNotificationsInputSchema = s.object(
  "Input parameters for retrieving DONKI notifications.",
  {
    ...donkiDateRangeShape,
    type: s.stringEnum("The DONKI notification type filter.", [
      "all",
      "FLR",
      "SEP",
      "CME",
      "IPS",
      "MPC",
      "GST",
      "RBE",
      "report",
    ]),
  },
  { optional: ["startDate", "endDate", "type"] },
);

const epicDateInputSchema = s.requiredObject("Input parameters for retrieving EPIC imagery by date.", {
  date: isoDateSchema("The EPIC imagery date to retrieve in YYYY-MM-DD format."),
});

const emptyInputSchema = s.object({}, { description: "This action does not require input parameters." });

export type NasaActionName =
  | "get_apod"
  | "browse_neo"
  | "get_neo_lookup"
  | "search_near_earth_objects"
  | "get_donki_cme"
  | "get_donki_cme_analysis"
  | "get_donki_gst"
  | "get_donki_ips"
  | "get_donki_solar_flares"
  | "get_donki_sep"
  | "get_donki_mpc"
  | "get_donki_rbe"
  | "get_donki_hss"
  | "get_donki_wsa_enlil"
  | "get_donki_notifications"
  | "get_epic_natural"
  | "get_epic_natural_date"
  | "list_epic_natural_dates"
  | "get_epic_enhanced"
  | "get_epic_enhanced_date"
  | "list_epic_enhanced_dates"
  | "get_epic_aerosol"
  | "get_epic_aerosol_date"
  | "list_epic_aerosol_dates"
  | "get_epic_cloud"
  | "get_epic_cloud_date"
  | "list_epic_cloud_dates";

function defineNasaAction(
  name: NasaActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: ActionDefinition["inputSchema"],
  outputSchema: ActionDefinition["outputSchema"],
) {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema,
    outputSchema,
  });
}

const donkiDateRangeInputSchema = (description: string) =>
  s.object(description, donkiDateRangeShape, { optional: ["startDate", "endDate"] });

export const nasaActions: ActionDefinition[] = [
  defineNasaAction(
    "get_apod",
    "read",
    "Retrieve NASA's Astronomy Picture of the Day metadata for a specific date or the current day.",
    getApodInputSchema,
    apodOutputSchema,
  ),
  defineNasaAction(
    "browse_neo",
    "read",
    "Browse NASA's near-Earth object catalog with pagination support.",
    browseNeoInputSchema,
    neoBrowseOutputSchema,
  ),
  defineNasaAction(
    "get_neo_lookup",
    "read",
    "Lookup a specific NASA near-Earth object by asteroid id.",
    getNeoLookupInputSchema,
    neoLookupOutputSchema,
  ),
  defineNasaAction(
    "search_near_earth_objects",
    "read",
    "Search NASA near-Earth objects by closest approach date within a maximum 7-day window.",
    searchNearEarthObjectsInputSchema,
    neoSearchOutputSchema,
  ),
  defineNasaAction(
    "get_donki_cme",
    "read",
    "Retrieve DONKI coronal mass ejection events for a date range.",
    getDonkiCmeInputSchema,
    buildDonkiArrayOutputSchema("The DONKI coronal mass ejection events returned by NASA.", "A DONKI CME response."),
  ),
  defineNasaAction(
    "get_donki_cme_analysis",
    "read",
    "Retrieve DONKI coronal mass ejection analysis entries with optional accuracy and catalog filters.",
    getDonkiCmeAnalysisInputSchema,
    buildDonkiArrayOutputSchema("The DONKI CME analysis entries returned by NASA.", "A DONKI CME analysis response."),
  ),
  defineNasaAction(
    "get_donki_gst",
    "read",
    "Retrieve DONKI geomagnetic storm events for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI GST events."),
    buildDonkiArrayOutputSchema("The DONKI geomagnetic storm events returned by NASA.", "A DONKI GST response."),
  ),
  defineNasaAction(
    "get_donki_ips",
    "read",
    "Retrieve DONKI interplanetary shock events with optional location and catalog filters.",
    getDonkiIpsInputSchema,
    buildDonkiArrayOutputSchema("The DONKI interplanetary shock events returned by NASA.", "A DONKI IPS response."),
  ),
  defineNasaAction(
    "get_donki_solar_flares",
    "read",
    "Retrieve DONKI solar flare events for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI solar flare events."),
    buildDonkiArrayOutputSchema("The DONKI solar flare events returned by NASA.", "A DONKI solar flare response."),
  ),
  defineNasaAction(
    "get_donki_sep",
    "read",
    "Retrieve DONKI solar energetic particle events for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI SEP events."),
    buildDonkiArrayOutputSchema("The DONKI solar energetic particle events returned by NASA.", "A DONKI SEP response."),
  ),
  defineNasaAction(
    "get_donki_mpc",
    "read",
    "Retrieve DONKI magnetopause crossing events for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI MPC events."),
    buildDonkiArrayOutputSchema("The DONKI magnetopause crossing events returned by NASA.", "A DONKI MPC response."),
  ),
  defineNasaAction(
    "get_donki_rbe",
    "read",
    "Retrieve DONKI radiation belt enhancement events for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI RBE events."),
    buildDonkiArrayOutputSchema(
      "The DONKI radiation belt enhancement events returned by NASA.",
      "A DONKI RBE response.",
    ),
  ),
  defineNasaAction(
    "get_donki_hss",
    "read",
    "Retrieve DONKI high-speed solar wind stream events for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI HSS events."),
    buildDonkiArrayOutputSchema("The DONKI high-speed stream events returned by NASA.", "A DONKI HSS response."),
  ),
  defineNasaAction(
    "get_donki_wsa_enlil",
    "read",
    "Retrieve DONKI WSA-Enlil simulation runs for a date range.",
    donkiDateRangeInputSchema("Input parameters for retrieving DONKI WSA-Enlil simulations."),
    buildDonkiArrayOutputSchema(
      "The DONKI WSA-Enlil simulation entries returned by NASA.",
      "A DONKI WSA-Enlil response.",
    ),
  ),
  defineNasaAction(
    "get_donki_notifications",
    "read",
    "Retrieve DONKI space weather notifications with optional type filtering.",
    getDonkiNotificationsInputSchema,
    buildDonkiArrayOutputSchema(
      "The DONKI space weather notifications returned by NASA.",
      "A DONKI notifications response.",
    ),
  ),
  defineNasaAction(
    "get_epic_natural",
    "read",
    "Retrieve the most recent EPIC natural color image metadata.",
    emptyInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "get_epic_natural_date",
    "read",
    "Retrieve EPIC natural color image metadata for a specific date.",
    epicDateInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "list_epic_natural_dates",
    "read",
    "List the dates with available EPIC natural color imagery.",
    emptyInputSchema,
    epicDateListOutputSchema,
  ),
  defineNasaAction(
    "get_epic_enhanced",
    "read",
    "Retrieve the most recent EPIC enhanced color image metadata.",
    emptyInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "get_epic_enhanced_date",
    "read",
    "Retrieve EPIC enhanced color image metadata for a specific date.",
    epicDateInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "list_epic_enhanced_dates",
    "read",
    "List the dates with available EPIC enhanced color imagery.",
    emptyInputSchema,
    epicDateListOutputSchema,
  ),
  defineNasaAction(
    "get_epic_aerosol",
    "read",
    "Retrieve the most recent EPIC aerosol imagery metadata.",
    emptyInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "get_epic_aerosol_date",
    "read",
    "Retrieve EPIC aerosol imagery metadata for a specific date.",
    epicDateInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "list_epic_aerosol_dates",
    "read",
    "List the dates with available EPIC aerosol imagery.",
    emptyInputSchema,
    epicDateListOutputSchema,
  ),
  defineNasaAction(
    "get_epic_cloud",
    "read",
    "Retrieve the most recent EPIC cloud fraction imagery metadata.",
    emptyInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "get_epic_cloud_date",
    "read",
    "Retrieve EPIC cloud fraction imagery metadata for a specific date.",
    epicDateInputSchema,
    epicImagesOutputSchema,
  ),
  defineNasaAction(
    "list_epic_cloud_dates",
    "read",
    "List the dates with available EPIC cloud fraction imagery.",
    emptyInputSchema,
    epicDateListOutputSchema,
  ),
];
