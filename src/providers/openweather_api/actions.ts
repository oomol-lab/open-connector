import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openweather_api";

const unitValues = ["standard", "metric", "imperial"];
const tileLayerValues = [
  "clouds",
  "clouds_new",
  "precipitation",
  "precipitation_new",
  "pressure",
  "pressure_new",
  "wind",
  "wind_new",
  "temp",
  "temp_new",
];

const looseObjectSchema = s.unknownObject("A JSON-like object returned by OpenWeather.");

function latitudeField(description: string): JsonSchema {
  return s.number(description, { minimum: -90, maximum: 90 });
}

function longitudeField(description: string): JsonSchema {
  return s.number(description, { minimum: -180, maximum: 180 });
}

function unixTimestampField(description: string): JsonSchema {
  return s.nonNegativeInteger(description);
}

function unitsField(): JsonSchema {
  return s.stringEnum(unitValues, { description: "The units of measurement for the response." });
}

function languageField(): JsonSchema {
  return s.nonEmptyString("The response language code in ISO 639-1 format.");
}

function jsonOnlyModeField(): JsonSchema {
  return s.literal("json", { description: "The upstream response mode. Only json is supported." });
}

const coordSchema = s.looseRequiredObject("A coordinate pair returned by OpenWeather.", {
  lon: s.number("The longitude in decimal degrees."),
  lat: s.number("The latitude in decimal degrees."),
});

const weatherConditionSchema = s.looseRequiredObject("A weather condition entry returned by OpenWeather.", {
  id: s.integer("The weather condition identifier."),
  main: s.string("The group of weather parameters."),
  description: s.string("The localized condition description."),
  icon: s.string("The weather icon code."),
});

const mainWeatherSchema = s.looseRequiredObject(
  "The main weather metrics returned by OpenWeather.",
  {
    temp: s.number("The measured temperature."),
    feels_like: s.number("The human-perceived temperature."),
    temp_min: s.number("The minimum observed temperature."),
    temp_max: s.number("The maximum observed temperature."),
    pressure: s.number("The atmospheric pressure in hPa."),
    humidity: s.number("The humidity percentage."),
    sea_level: s.number("The sea-level pressure in hPa."),
    grnd_level: s.number("The ground-level pressure in hPa."),
    temp_kf: s.number("The internal forecast temperature correction."),
  },
  { optional: ["sea_level", "grnd_level", "temp_kf"] },
);

const windSchema = s.looseRequiredObject(
  "The wind metrics returned by OpenWeather.",
  {
    speed: s.number("The wind speed."),
    deg: s.number("The wind direction in degrees."),
    gust: s.number("The wind gust speed."),
  },
  { optional: ["deg", "gust"] },
);

const precipitationSchema = s.looseObject("A precipitation summary returned by OpenWeather.", {
  "1h": s.number("The precipitation volume for the last hour."),
  "3h": s.number("The precipitation volume for the last three hours."),
});

const cloudsSchema = s.looseRequiredObject("The cloud coverage summary returned by OpenWeather.", {
  all: s.number("The cloudiness percentage."),
});

const currentWeatherSysSchema = s.looseRequiredObject(
  "The system metadata returned by the current weather endpoint.",
  {
    type: s.integer("The internal system type."),
    id: s.integer("The internal system identifier."),
    country: s.string("The ISO 3166 country code."),
    sunrise: unixTimestampField("The sunrise time as a Unix UTC timestamp."),
    sunset: unixTimestampField("The sunset time as a Unix UTC timestamp."),
  },
  { optional: ["type", "id"] },
);

const forecastSysSchema = s.looseRequiredObject("The forecast system metadata returned by OpenWeather.", {
  pod: s.string("The part-of-day flag returned by the forecast endpoint."),
});

const geocodingLocationSchema = s.looseRequiredObject(
  "A place result returned by the OpenWeather Geocoding API.",
  {
    name: s.string("The localized place name."),
    local_names: {
      ...looseObjectSchema,
      description: "Localized names keyed by language code.",
    },
    lat: s.number("The latitude in decimal degrees."),
    lon: s.number("The longitude in decimal degrees."),
    country: s.string("The ISO 3166 country code."),
    state: s.string("The state or region name when available."),
    zip: s.string("The ZIP or postal code when available."),
  },
  { optional: ["local_names", "state", "zip"] },
);

const currentWeatherOutputSchema = s.looseRequiredObject(
  "The current weather payload returned by OpenWeather.",
  {
    coord: { ...coordSchema, description: "The coordinates for the requested place." },
    weather: s.array("The weather conditions for the requested place.", weatherConditionSchema),
    base: s.string("The internal base parameter returned by OpenWeather."),
    main: { ...mainWeatherSchema, description: "The main weather metrics." },
    visibility: s.number("The visibility distance in metres."),
    wind: { ...windSchema, description: "The wind metrics." },
    rain: { ...precipitationSchema, description: "The rain volume summary." },
    snow: { ...precipitationSchema, description: "The snow volume summary." },
    clouds: { ...cloudsSchema, description: "The cloud coverage summary." },
    dt: unixTimestampField("The calculation time as a Unix UTC timestamp."),
    sys: { ...currentWeatherSysSchema, description: "The current weather system metadata." },
    timezone: s.integer("The shift in seconds from UTC."),
    id: s.integer("The OpenWeather city identifier."),
    name: s.string("The place name returned by OpenWeather."),
    cod: s.integer("The internal response code returned on success."),
  },
  { optional: ["visibility", "rain", "snow"] },
);

const circleCityWeatherItemSchema = s.looseRequiredObject(
  "A current weather entry returned by the circle city weather endpoint.",
  {
    id: s.integer("The OpenWeather city identifier."),
    name: s.string("The city name."),
    coord: { ...coordSchema, description: "The city coordinates." },
    main: { ...mainWeatherSchema, description: "The main weather metrics." },
    dt: unixTimestampField("The calculation time as a Unix UTC timestamp."),
    wind: { ...windSchema, description: "The wind metrics." },
    sys: s.looseObject("The city-level system metadata.", {
      country: s.string("The ISO 3166 country code."),
      sunrise: unixTimestampField("The sunrise time as a Unix UTC timestamp."),
      sunset: unixTimestampField("The sunset time as a Unix UTC timestamp."),
      timezone: s.integer("The shift in seconds from UTC."),
    }),
    clouds: { ...cloudsSchema, description: "The cloud coverage summary." },
    weather: s.array("The weather conditions for the city.", weatherConditionSchema),
    rain: { ...precipitationSchema, description: "The rain volume summary." },
    snow: { ...precipitationSchema, description: "The snow volume summary." },
  },
  { optional: ["rain", "snow"] },
);

const forecastItemSchema = s.looseRequiredObject(
  "A 3-hour forecast entry returned by OpenWeather.",
  {
    dt: unixTimestampField("The forecast time as a Unix UTC timestamp."),
    main: { ...mainWeatherSchema, description: "The forecast main weather metrics." },
    weather: s.array("The forecast weather conditions.", weatherConditionSchema),
    clouds: { ...cloudsSchema, description: "The forecast cloud coverage summary." },
    wind: { ...windSchema, description: "The forecast wind metrics." },
    visibility: s.number("The visibility distance in metres."),
    pop: s.number("The precipitation probability from 0 to 1."),
    rain: { ...precipitationSchema, description: "The rain volume summary." },
    snow: { ...precipitationSchema, description: "The snow volume summary." },
    sys: { ...forecastSysSchema, description: "The forecast system metadata." },
    dt_txt: s.string("The forecast time in UTC text format."),
  },
  { optional: ["visibility", "pop", "rain", "snow"] },
);

const forecastCitySchema = s.looseRequiredObject(
  "The city metadata returned by the 5-day forecast endpoint.",
  {
    id: s.integer("The OpenWeather city identifier."),
    name: s.string("The city name."),
    coord: { ...coordSchema, description: "The city coordinates." },
    country: s.string("The ISO 3166 country code."),
    population: s.integer("The population when available."),
    timezone: s.integer("The shift in seconds from UTC."),
    sunrise: unixTimestampField("The sunrise time as a Unix UTC timestamp."),
    sunset: unixTimestampField("The sunset time as a Unix UTC timestamp."),
  },
  { optional: ["population"] },
);

const responseCodeSchema = s.anyOf("The internal response code.", [
  s.string("The internal response code as text."),
  s.number("The internal response code as a number."),
]);

const forecastOutputSchema = s.looseRequiredObject("The 5-day weather forecast payload returned by OpenWeather.", {
  cod: responseCodeSchema,
  message: s.number("The internal message value returned by OpenWeather."),
  cnt: s.integer("The number of forecast entries returned."),
  list: s.array("The ordered 3-hour forecast entries.", forecastItemSchema),
  city: { ...forecastCitySchema, description: "The city metadata for the forecast." },
});

const circleCityWeatherOutputSchema = s.looseRequiredObject(
  "The current weather payload for nearby cities returned by OpenWeather.",
  {
    cod: responseCodeSchema,
    message: s.number("The internal message value returned by OpenWeather."),
    count: s.integer("The number of city entries returned."),
    list: s.array("The current weather entries for nearby cities.", circleCityWeatherItemSchema),
  },
);

const airPollutionComponentsSchema = s.looseRequiredObject(
  "The pollutant concentration metrics returned by OpenWeather.",
  {
    co: s.number("The carbon monoxide concentration in ug/m3."),
    no: s.number("The nitric oxide concentration in ug/m3."),
    no2: s.number("The nitrogen dioxide concentration in ug/m3."),
    o3: s.number("The ozone concentration in ug/m3."),
    so2: s.number("The sulphur dioxide concentration in ug/m3."),
    pm2_5: s.number("The PM2.5 concentration in ug/m3."),
    pm10: s.number("The PM10 concentration in ug/m3."),
    nh3: s.number("The ammonia concentration in ug/m3."),
  },
);

const airPollutionListItemSchema = s.looseRequiredObject(
  "A current, forecast, or historical air-pollution data point.",
  {
    main: s.looseRequiredObject("The air quality index block.", {
      aqi: s.integer("The OpenWeather Air Quality Index from 1 to 5."),
    }),
    components: {
      ...airPollutionComponentsSchema,
      description: "The pollutant concentration metrics.",
    },
    dt: unixTimestampField("The calculation time as a Unix UTC timestamp."),
  },
);

const airPollutionOutputSchema = s.looseRequiredObject("The air-pollution payload returned by OpenWeather.", {
  coord: { ...coordSchema, description: "The coordinates for the requested place." },
  list: s.array("The ordered air-pollution data points returned by OpenWeather.", airPollutionListItemSchema),
});

const uvIndexPointSchema = s.object(
  "A UV index point synthesized from OpenWeather One Call 3.0.",
  {
    lat: s.number("The latitude used for the UV lookup."),
    lon: s.number("The longitude used for the UV lookup."),
    date: unixTimestampField("The sampled Unix UTC timestamp."),
    dateIso: s.string("The sampled timestamp encoded in ISO 8601 format."),
    value: s.number("The UV index value sampled from One Call 3.0."),
  },
  { required: ["lat", "lon", "date", "dateIso", "value"] },
);

const weatherMapTileOutputSchema = s.object(
  "The weather map tile payload returned by OpenWeather.",
  {
    tileBase64: s.string("The requested weather tile encoded as Base64 PNG bytes."),
    contentType: s.string("The content type returned by OpenWeather."),
  },
  { required: ["tileBase64", "contentType"] },
);

const weatherStationSchema = s.looseRequiredObject(
  "A weather station object returned by OpenWeather.",
  {
    id: s.string("The OpenWeather weather-station identifier."),
    external_id: s.string("The caller-supplied external weather-station identifier."),
    name: s.string("The weather-station display name."),
    latitude: s.number("The station latitude in decimal degrees."),
    longitude: s.number("The station longitude in decimal degrees."),
    altitude: s.number("The station altitude in metres."),
    rank: s.integer("The station rank when available."),
    created_at: s.string("The station creation time in ISO 8601 format."),
    updated_at: s.string("The station update time in ISO 8601 format."),
    user_id: s.string("The owner identifier when returned by OpenWeather."),
    source_type: s.integer("The internal source type value."),
  },
  {
    optional: ["external_id", "altitude", "rank", "created_at", "updated_at", "user_id", "source_type"],
  },
);

const stationMeasurementSummarySchema = s.looseRequiredObject(
  "An aggregated weather-station measurement record returned by OpenWeather.",
  {
    date: unixTimestampField("The aggregated measurement time as a Unix UTC timestamp."),
    type: s.string("The aggregation granularity returned by OpenWeather."),
    station_id: s.string("The weather-station identifier."),
    temp: { ...looseObjectSchema, description: "The aggregated temperature metrics." },
    humidity: { ...looseObjectSchema, description: "The aggregated humidity metrics." },
    pressure: { ...looseObjectSchema, description: "The aggregated pressure metrics." },
    wind: { ...looseObjectSchema, description: "The aggregated wind metrics." },
    precipitation: { ...looseObjectSchema, description: "The aggregated precipitation metrics." },
  },
  { optional: ["temp", "humidity", "pressure", "wind", "precipitation"] },
);

const triggerDefinitionSchema = s.object(
  "A weather-trigger definition kept for compatibility.",
  {
    type: s.nonEmptyString("The trigger type, such as temperature or wind."),
    condition: s.stringEnum([">", "<", "=", "between"], {
      description: "The comparison operator used by the trigger.",
    }),
    value: s.union(
      [
        s.number("A single threshold value for the trigger."),
        s.array("The lower and upper threshold bounds for the trigger.", s.number("A numeric bound."), {
          minItems: 2,
          maxItems: 2,
        }),
      ],
      { description: "The numeric threshold or threshold range for the trigger." },
    ),
    location: s.object(
      "The location monitored by the trigger.",
      {
        lat: latitudeField("The trigger latitude in decimal degrees."),
        lon: longitudeField("The trigger longitude in decimal degrees."),
      },
      { required: ["lat", "lon"] },
    ),
  },
  { required: ["type", "condition", "value", "location"] },
);

const stationCreateInputSchema = s.object(
  "The input payload for creating a weather station.",
  {
    external_id: s.nonEmptyString("The caller-defined external weather-station identifier."),
    name: s.nonEmptyString("The weather-station display name."),
    latitude: latitudeField("The station latitude in decimal degrees."),
    longitude: longitudeField("The station longitude in decimal degrees."),
    altitude: s.number("The station altitude in metres."),
  },
  { required: ["external_id", "name", "latitude", "longitude", "altitude"] },
);

const stationUpdateInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for updating a weather station.",
    {
      station_id: s.nonEmptyString("The weather-station identifier to update."),
      external_id: s.nonEmptyString("The updated external weather-station identifier."),
      name: s.nonEmptyString("The updated weather-station display name."),
      latitude: latitudeField("The updated station latitude in decimal degrees."),
      longitude: longitudeField("The updated station longitude in decimal degrees."),
      altitude: s.number("The updated station altitude in metres."),
    },
    {
      required: ["station_id"],
      optional: ["external_id", "name", "latitude", "longitude", "altitude"],
    },
  ),
  anyOf: [
    { required: ["external_id"] },
    { required: ["name"] },
    { required: ["latitude"] },
    { required: ["longitude"] },
    { required: ["altitude"] },
  ],
};

const locationSelectorShape: Record<string, JsonSchema> = {
  q: s.nonEmptyString("The city name, optionally followed by state code and country code, such as London,GB."),
  id: s.nonNegativeInteger("The OpenWeather city identifier."),
  zip: s.nonEmptyString("The ZIP or postal code followed by country code, such as 94040,US."),
  lat: latitudeField("The latitude in decimal degrees."),
  lon: longitudeField("The longitude in decimal degrees."),
};

const singleLocationSelectorRule: JsonSchema = {
  oneOf: [
    {
      required: ["q"],
      not: { anyOf: [{ required: ["id"] }, { required: ["zip"] }, { required: ["lat"] }, { required: ["lon"] }] },
    },
    {
      required: ["id"],
      not: { anyOf: [{ required: ["q"] }, { required: ["zip"] }, { required: ["lat"] }, { required: ["lon"] }] },
    },
    {
      required: ["zip"],
      not: { anyOf: [{ required: ["q"] }, { required: ["id"] }, { required: ["lat"] }, { required: ["lon"] }] },
    },
    {
      required: ["lat", "lon"],
      not: { anyOf: [{ required: ["q"] }, { required: ["id"] }, { required: ["zip"] }] },
    },
  ],
};

function withSingleLocationSelector(
  shape: Record<string, JsonSchema>,
  description: string,
  optionalFields: string[],
): JsonSchema {
  return {
    ...s.object(
      description,
      { ...locationSelectorShape, ...shape },
      {
        optional: ["q", "id", "zip", "lat", "lon", ...optionalFields],
      },
    ),
    ...singleLocationSelectorRule,
  };
}

const geocodingDirectInputSchema = s.object(
  "The input payload for direct geocoding.",
  {
    q: s.nonEmptyString("The location name to geocode."),
    limit: s.integer("The maximum number of place matches to return.", { minimum: 1, maximum: 5 }),
  },
  { required: ["q"], optional: ["limit"] },
);

const geocodingReverseInputSchema = s.object(
  "The input payload for reverse geocoding.",
  {
    lat: latitudeField("The latitude in decimal degrees."),
    lon: longitudeField("The longitude in decimal degrees."),
    limit: s.integer("The maximum number of place matches to return.", { minimum: 1, maximum: 5 }),
  },
  { required: ["lat", "lon"], optional: ["limit"] },
);

const geocodingByZipInputSchema = s.object(
  "The input payload for ZIP or postal-code geocoding.",
  {
    zip: s.nonEmptyString("The ZIP or postal code followed by country code, such as 94040,US."),
  },
  { required: ["zip"] },
);

const currentWeatherInputSchema = withSingleLocationSelector(
  {
    units: unitsField(),
    lang: languageField(),
  },
  "The input payload for current weather data.",
  ["units", "lang"],
);

const fiveDayForecastInputSchema = withSingleLocationSelector(
  {
    mode: jsonOnlyModeField(),
    units: unitsField(),
    lang: languageField(),
  },
  "The input payload for 5-day, 3-hour forecast data.",
  ["mode", "units", "lang"],
);

const circleCityWeatherInputSchema = s.object(
  "The input payload for nearby-city weather data.",
  {
    lat: latitudeField("The latitude of the circle centre in decimal degrees."),
    lon: longitudeField("The longitude of the circle centre in decimal degrees."),
    cnt: s.integer("The maximum number of nearby cities to return.", { minimum: 1, maximum: 50 }),
    mode: jsonOnlyModeField(),
    units: unitsField(),
    lang: languageField(),
  },
  { required: ["lat", "lon"], optional: ["cnt", "mode", "units", "lang"] },
);

const airPollutionCoordinatesInputSchema = s.object(
  "The input payload for air-pollution data.",
  {
    lat: latitudeField("The latitude in decimal degrees."),
    lon: longitudeField("The longitude in decimal degrees."),
  },
  { required: ["lat", "lon"] },
);

const airPollutionHistoryInputSchema = s.object(
  "The input payload for historical air-pollution data.",
  {
    lat: latitudeField("The latitude in decimal degrees."),
    lon: longitudeField("The longitude in decimal degrees."),
    start: unixTimestampField("The start time as a Unix UTC timestamp."),
    end: unixTimestampField("The end time as a Unix UTC timestamp."),
  },
  { required: ["lat", "lon", "start", "end"] },
);

const uvCurrentInputSchema = s.object(
  "The input payload for the current UV index compatibility helper.",
  {
    lat: latitudeField("The latitude in decimal degrees."),
    lon: longitudeField("The longitude in decimal degrees."),
    units: unitsField(),
    lang: languageField(),
  },
  { required: ["lat", "lon"], optional: ["units", "lang"] },
);

const uvForecastInputSchema = s.object(
  "The input payload for the UV forecast compatibility helper.",
  {
    lat: latitudeField("The latitude in decimal degrees."),
    lon: longitudeField("The longitude in decimal degrees."),
    cnt: s.integer("The maximum number of daily UV forecast points to return.", { minimum: 1, maximum: 8 }),
    units: unitsField(),
    lang: languageField(),
  },
  { required: ["lat", "lon"], optional: ["cnt", "units", "lang"] },
);

const uvHistoryInputSchema = s.object(
  "The input payload for the UV history compatibility helper.",
  {
    lat: latitudeField("The latitude in decimal degrees."),
    lon: longitudeField("The longitude in decimal degrees."),
    start: unixTimestampField("The start time as a Unix UTC timestamp."),
    end: unixTimestampField("The end time as a Unix UTC timestamp."),
    units: unitsField(),
    lang: languageField(),
  },
  { required: ["lat", "lon", "start", "end"], optional: ["units", "lang"] },
);

const weatherMapTileInputSchema = s.object(
  "The input payload for fetching a weather map tile.",
  {
    layer: s.stringEnum(tileLayerValues, { description: "The weather tile layer name." }),
    z: s.nonNegativeInteger("The tile zoom level."),
    x: s.nonNegativeInteger("The tile X coordinate."),
    y: s.nonNegativeInteger("The tile Y coordinate."),
    palette: s.nonEmptyString("The custom palette string sent to the upstream tile API."),
    opacity: s.number("The tile opacity sent to the upstream tile API.", { minimum: 0, maximum: 1 }),
    color: s.nonEmptyString("The upstream tile colour schema."),
    fill: s.nonEmptyString("The upstream empty-area fill colour."),
    fill_bound: s.boolean("Whether to request upstream fill outside the data boundary."),
    scale: s.oneOf([s.literal(1), s.literal(2)], { description: "The upstream tile scale factor." }),
    format: s.literal("png", { description: "The requested tile format." }),
  },
  {
    required: ["layer", "z", "x", "y"],
    optional: ["palette", "opacity", "color", "fill", "fill_bound", "scale", "format"],
  },
);

const weatherStationIdentifierInputSchema = s.object(
  "The input payload for selecting a weather station.",
  {
    station_id: s.nonEmptyString("The weather-station identifier."),
  },
  { required: ["station_id"] },
);

const stationMeasurementsInputSchema = s.object(
  "The input payload for listing aggregated station measurements.",
  {
    station_id: s.nonEmptyString("The weather-station identifier."),
    type: s.stringEnum(["m", "h", "d"], { description: "The aggregation granularity: minute, hour, or day." }),
    limit: s.positiveInteger("The maximum number of aggregated records."),
    from: unixTimestampField("The interval start as a Unix UTC timestamp."),
    to: unixTimestampField("The interval end as a Unix UTC timestamp."),
  },
  { required: ["station_id", "type", "limit", "from", "to"] },
);

const submittedMeasurementSchema = s.object(
  "One weather-station measurement submitted to OpenWeather.",
  {
    station_id: s.nonEmptyString("The weather-station identifier."),
    dt: unixTimestampField("The measurement time as a Unix UTC timestamp."),
    temperature: s.number("The air temperature in Celsius."),
    humidity: s.number("The humidity percentage.", { minimum: 0, maximum: 100 }),
    pressure: s.number("The atmospheric pressure in hPa."),
    wind_speed: s.number("The wind speed in metres per second."),
    wind_deg: s.integer("The wind direction in degrees.", { minimum: 0, maximum: 360 }),
    wind_gust: s.number("The wind gust speed in metres per second."),
    rain_1h: s.number("The rainfall for the previous hour in millimetres."),
    rain_6h: s.number("The rainfall for the previous six hours in millimetres."),
    rain_24h: s.number("The rainfall for the previous twenty-four hours in millimetres."),
    snow_1h: s.number("The snowfall for the previous hour in millimetres."),
    snow_6h: s.number("The snowfall for the previous six hours in millimetres."),
    snow_24h: s.number("The snowfall for the previous twenty-four hours in millimetres."),
    dew_point: s.number("The dew-point temperature in Celsius."),
    humidex: s.number("The humidex value."),
    heat_index: s.number("The heat index value."),
    visibility_distance: s.number("The visibility distance in metres."),
    visibility_prefix: s.nonEmptyString("The visibility prefix string."),
    clouds: s.array("The cloud-layer measurements.", s.unknownObject("One cloud-layer measurement object.")),
    weather: s.array("The observed weather phenomena.", s.unknownObject("One observed weather phenomenon object.")),
  },
  {
    required: ["station_id", "dt"],
    optional: [
      "temperature",
      "humidity",
      "pressure",
      "wind_speed",
      "wind_deg",
      "wind_gust",
      "rain_1h",
      "rain_6h",
      "rain_24h",
      "snow_1h",
      "snow_6h",
      "snow_24h",
      "dew_point",
      "humidex",
      "heat_index",
      "visibility_distance",
      "visibility_prefix",
      "clouds",
      "weather",
    ],
  },
);

const submitStationMeasurementsInputSchema = s.object(
  "The input payload for submitting station measurements.",
  {
    measurements: s.array("The list of weather-station measurements to submit.", submittedMeasurementSchema, {
      minItems: 1,
    }),
  },
  { required: ["measurements"] },
);

export const openweatherApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_geocoding_direct",
    description: "Resolve one place name into one or more OpenWeather geocoding matches.",
    requiredScopes: [],
    inputSchema: geocodingDirectInputSchema,
    outputSchema: s.object(
      "The direct geocoding results.",
      {
        locations: s.array("The geocoding matches returned by OpenWeather.", geocodingLocationSchema),
      },
      { required: ["locations"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_geocoding_reverse",
    description: "Resolve one latitude and longitude pair into one or more named places.",
    requiredScopes: [],
    inputSchema: geocodingReverseInputSchema,
    outputSchema: s.object(
      "The reverse geocoding results.",
      {
        locations: s.array("The reverse-geocoding matches returned by OpenWeather.", geocodingLocationSchema),
      },
      { required: ["locations"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_geocoding_by_zip",
    description: "Resolve one ZIP or postal code into a named OpenWeather location.",
    requiredScopes: [],
    inputSchema: geocodingByZipInputSchema,
    outputSchema: s.object(
      "The ZIP or postal-code geocoding result.",
      {
        location: {
          ...geocodingLocationSchema,
          description: "The ZIP or postal-code geocoding result.",
        },
      },
      { required: ["location"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_current_weather",
    description: "Retrieve the current weather for exactly one OpenWeather location selector.",
    requiredScopes: [],
    inputSchema: currentWeatherInputSchema,
    outputSchema: currentWeatherOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_5_day_forecast",
    description: "Retrieve the OpenWeather 5-day forecast in 3-hour steps for exactly one location selector.",
    requiredScopes: [],
    inputSchema: fiveDayForecastInputSchema,
    outputSchema: forecastOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_circle_city_weather",
    description:
      "Retrieve current weather for nearby cities around one latitude and longitude by using OpenWeather's compatibility city-search endpoint.",
    requiredScopes: [],
    inputSchema: circleCityWeatherInputSchema,
    outputSchema: circleCityWeatherOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_air_pollution_current",
    description: "Retrieve the current air-pollution snapshot for one latitude and longitude.",
    requiredScopes: [],
    inputSchema: airPollutionCoordinatesInputSchema,
    outputSchema: airPollutionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_air_pollution_forecast",
    description: "Retrieve the air-pollution forecast for one latitude and longitude.",
    requiredScopes: [],
    inputSchema: airPollutionCoordinatesInputSchema,
    outputSchema: airPollutionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_air_pollution_history",
    description: "Retrieve historical air-pollution data for one latitude and longitude over a time range.",
    requiredScopes: [],
    inputSchema: airPollutionHistoryInputSchema,
    outputSchema: airPollutionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_uv_index",
    description:
      "Return the current UV index by sampling OpenWeather One Call 3.0, because the legacy UV Index API is retired.",
    requiredScopes: [],
    inputSchema: uvCurrentInputSchema,
    outputSchema: uvIndexPointSchema,
  }),
  defineProviderAction(service, {
    name: "get_uv_index_forecast",
    description:
      "Return daily UV forecast points by sampling OpenWeather One Call 3.0, because the legacy UV Index API is retired.",
    requiredScopes: [],
    inputSchema: uvForecastInputSchema,
    outputSchema: s.object(
      "The UV forecast compatibility results.",
      {
        list: s.array("The ordered daily UV forecast points synthesized from One Call 3.0.", uvIndexPointSchema),
      },
      { required: ["list"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_uv_index_history",
    description:
      "Return sampled historical UV index points by querying OpenWeather One Call 3.0 timemachine once per day in the requested range, because the legacy UV Index API is retired.",
    requiredScopes: [],
    inputSchema: uvHistoryInputSchema,
    outputSchema: s.object(
      "The UV history compatibility results.",
      {
        list: s.array("The sampled historical UV index points synthesized from One Call 3.0.", uvIndexPointSchema),
      },
      { required: ["list"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_weather_map_tile",
    description: "Fetch one OpenWeather weather-map tile and return it as Base64 PNG bytes.",
    requiredScopes: [],
    inputSchema: weatherMapTileInputSchema,
    outputSchema: weatherMapTileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_weather_station",
    description: "Create one OpenWeather weather station under the current account.",
    requiredScopes: [],
    inputSchema: stationCreateInputSchema,
    outputSchema: weatherStationSchema,
  }),
  defineProviderAction(service, {
    name: "update_weather_station",
    description: "Update one existing OpenWeather weather station.",
    requiredScopes: [],
    inputSchema: stationUpdateInputSchema,
    outputSchema: weatherStationSchema,
  }),
  defineProviderAction(service, {
    name: "delete_weather_station",
    description: "Delete one OpenWeather weather station by identifier.",
    requiredScopes: [],
    inputSchema: weatherStationIdentifierInputSchema,
    outputSchema: s.object(
      "The weather-station deletion result.",
      {
        message: s.string("The confirmation message returned by the connector."),
      },
      { required: ["message"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_weather_stations",
    description: "List all OpenWeather weather stations available to the current account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing weather stations.", {}),
    outputSchema: s.object(
      "The weather-station list.",
      {
        stations: s.array("The weather stations returned by OpenWeather.", weatherStationSchema),
      },
      { required: ["stations"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_weather_station",
    description: "Retrieve one OpenWeather weather station by identifier.",
    requiredScopes: [],
    inputSchema: weatherStationIdentifierInputSchema,
    outputSchema: weatherStationSchema,
  }),
  defineProviderAction(service, {
    name: "submit_station_measurements",
    description: "Submit one or more measurements for existing OpenWeather weather stations.",
    requiredScopes: [],
    inputSchema: submitStationMeasurementsInputSchema,
    outputSchema: s.object(
      "The station-measurement submission result.",
      {
        message: s.string("The confirmation message returned by the connector."),
        success: s.boolean("Whether the measurement submission succeeded."),
      },
      { required: ["message", "success"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_station_measurements",
    description: "List aggregated historical measurements for one OpenWeather weather station.",
    requiredScopes: [],
    inputSchema: stationMeasurementsInputSchema,
    outputSchema: s.object(
      "The weather-station measurement list.",
      {
        measurements: s.array(
          "The aggregated station measurements returned by OpenWeather.",
          stationMeasurementSummarySchema,
        ),
      },
      { required: ["measurements"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_weather_triggers",
    description:
      "Compatibility action for the retired OpenWeather Weather Triggers API. Execution always returns a deprecation error.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for the retired weather-trigger compatibility action.",
      {
        triggers: s.array("The trigger definitions requested for compatibility.", triggerDefinitionSchema, {
          minItems: 1,
        }),
      },
      { required: ["triggers"] },
    ),
    outputSchema: s.object(
      "The weather-trigger compatibility result.",
      {
        triggers: s.array(
          "The trigger results returned by the compatibility action.",
          s.object(
            "One weather-trigger compatibility result.",
            {
              id: s.string("The trigger identifier."),
              status: s.string("The trigger status."),
              details: {
                ...looseObjectSchema,
                description: "Additional trigger details.",
              },
            },
            { required: ["id", "status", "details"] },
          ),
        ),
      },
      { required: ["triggers"] },
    ),
  }),
];
