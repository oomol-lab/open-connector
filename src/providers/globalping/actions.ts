import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "globalping";

const measurementTypeSchema = s.stringEnum("The Globalping measurement type.", [
  "ping",
  "traceroute",
  "dns",
  "mtr",
  "http",
]);
const ipVersionSchema = s.union([s.literal(4, { description: "IPv4." }), s.literal(6, { description: "IPv6." })], {
  description: "The IP version used by the measurement.",
});

const continentCodeSchema = s.stringEnum("A continent code used to select probes.", [
  "AF",
  "AN",
  "AS",
  "EU",
  "NA",
  "OC",
  "SA",
]);
const countryCodeSchema = s.string({
  minLength: 2,
  maxLength: 2,
  description: "An ISO 3166-1 alpha-2 country code used to select probes.",
});
const positiveAsnSchema = s.integer("An autonomous system number used to select probes.", {
  minimum: 1,
});
const probeSelectionSchema = s.object(
  "A Globalping probe selection filter. Include at least one selector such as country, city, ASN, tags, or magic.",
  {
    continent: continentCodeSchema,
    region: s.nonEmptyString("A UN M49 region name used to select probes."),
    country: countryCodeSchema,
    state: s.nonEmptyString("A state identifier used to select probes when available."),
    city: s.nonEmptyString("A city name used to select probes."),
    asn: positiveAsnSchema,
    network: s.nonEmptyString("A network or ISP name used to select probes."),
    tags: s.stringArray("Additional Globalping tags used to select probes.", {
      minItems: 1,
      itemDescription: "A Globalping tag used to narrow probe selection.",
    }),
    magic: s.nonEmptyString("A fuzzy Globalping location string such as `Berlin+Germany` or `aws-us-east-1`."),
    limit: s.integer("The maximum number of probes to pick for this location filter.", {
      minimum: 1,
      maximum: 200,
    }),
  },
  {
    optional: ["continent", "region", "country", "state", "city", "asn", "network", "tags", "magic", "limit"],
  },
);

const pingOptionsInputSchema = s.object(
  "The Globalping ping measurement options.",
  {
    packets: s.integer("The number of packets to send.", { minimum: 1, maximum: 16 }),
    protocol: s.stringEnum("The transport protocol used by the ping test.", ["ICMP", "TCP"]),
    port: s.integer("The destination port used when the ping protocol is TCP.", { minimum: 0, maximum: 65535 }),
    ip_version: ipVersionSchema,
  },
  { optional: ["packets", "protocol", "port", "ip_version"] },
);

const tracerouteOptionsInputSchema = s.object(
  "The Globalping traceroute measurement options.",
  {
    protocol: s.stringEnum("The transport protocol used by the traceroute test.", ["ICMP", "TCP", "UDP"]),
    port: s.integer("The destination port used when the traceroute protocol is TCP.", {
      minimum: 0,
      maximum: 65535,
    }),
    ip_version: ipVersionSchema,
  },
  { optional: ["protocol", "port", "ip_version"] },
);

const dnsRecordTypeSchema = s.stringEnum("The DNS record type requested by the measurement.", [
  "A",
  "AAAA",
  "ANY",
  "CNAME",
  "DNSKEY",
  "DS",
  "HTTPS",
  "MX",
  "NS",
  "NSEC",
  "PTR",
  "RRSIG",
  "SOA",
  "TXT",
  "SRV",
  "SVCB",
]);
const dnsQueryInputSchema = s.object(
  "The DNS query configuration.",
  {
    type: dnsRecordTypeSchema,
  },
  { optional: ["type"] },
);
const dnsOptionsInputSchema = s.object(
  "The Globalping DNS measurement options.",
  {
    query: dnsQueryInputSchema,
    resolver: s.nonEmptyString("The DNS resolver hostname or IP address used for the measurement."),
    protocol: s.stringEnum("The transport protocol used by the DNS test.", ["TCP", "UDP"]),
    port: s.integer("The port number used by the DNS test.", { minimum: 0, maximum: 65535 }),
    ip_version: ipVersionSchema,
    trace: s.boolean("Whether Globalping should trace the DNS delegation path from the root servers."),
  },
  { optional: ["query", "resolver", "protocol", "port", "ip_version", "trace"] },
);

const mtrOptionsInputSchema = s.object(
  "The Globalping MTR measurement options.",
  {
    packets: s.integer("The number of packets to send to each hop.", { minimum: 1, maximum: 16 }),
    protocol: s.stringEnum("The transport protocol used by the MTR test.", ["ICMP", "TCP", "UDP"]),
    port: s.integer("The destination port used when the MTR protocol is TCP or UDP.", {
      minimum: 0,
      maximum: 65535,
    }),
    ip_version: ipVersionSchema,
  },
  { optional: ["packets", "protocol", "port", "ip_version"] },
);

const httpRequestHeadersInputSchema = s.record(
  "Additional HTTP request headers except Host and User-Agent.",
  s.string("One HTTP header value."),
);
const httpRequestInputSchema = s.object(
  "The HTTP request configuration.",
  {
    host: s.nonEmptyString("An optional override for the HTTP Host header."),
    path: s.nonEmptyString("The HTTP request path."),
    query: s.string("The HTTP request query string."),
    method: s.stringEnum("The HTTP request method.", ["HEAD", "GET", "OPTIONS"]),
    headers: httpRequestHeadersInputSchema,
  },
  { optional: ["host", "path", "query", "method", "headers"] },
);
const httpOptionsInputSchema = s.object(
  "The Globalping HTTP measurement options.",
  {
    request: httpRequestInputSchema,
    resolver: s.nonEmptyString("The DNS resolver hostname or IP address used for the HTTP test."),
    protocol: s.stringEnum("The HTTP transport protocol.", ["HTTP", "HTTPS", "HTTP2"]),
    port: s.integer("The port used for the HTTP request.", { minimum: 0, maximum: 65535 }),
    ip_version: ipVersionSchema,
  },
  { optional: ["request", "resolver", "protocol", "port", "ip_version"] },
);

const measurementOptionsInputSchema = s.union(
  [
    pingOptionsInputSchema,
    tracerouteOptionsInputSchema,
    dnsOptionsInputSchema,
    mtrOptionsInputSchema,
    httpOptionsInputSchema,
  ],
  { description: "The type-specific Globalping measurement options." },
);

const rateLimitCreateSchema = s.object("The rate limit details for creating measurements.", {
  type: s.stringEnum("The rate limit bucket type returned by Globalping.", ["ip", "user"]),
  limit: s.integer("The number of limit points available in the current window."),
  remaining: s.integer("The number of limit points remaining in the current window."),
  reset: s.integer("The number of seconds until the rate limit resets."),
});
const limitsSchema = s.object(
  "The Globalping limits response.",
  {
    rateLimit: s.object("The rate limit groups returned by Globalping.", {
      measurements: s.object("The measurement rate limit groups returned by Globalping.", {
        create: rateLimitCreateSchema,
      }),
    }),
    credits: s.object("The Globalping credits information for authenticated requests.", {
      remaining: s.integer("The remaining Globalping user credits."),
    }),
  },
  { optional: ["credits"] },
);

const probeLocationSchema = s.object(
  "The location metadata attached to an online Globalping probe.",
  {
    continent: s.string("The probe continent code."),
    region: s.string("The probe region name."),
    country: s.string("The probe country code."),
    state: s.string("The probe state identifier when available."),
    city: s.string("The probe city name when available."),
    network: s.string("The probe network name when available."),
    asn: s.integer("The probe autonomous system number when available."),
    latitude: s.number("The probe latitude when available."),
    longitude: s.number("The probe longitude when available."),
  },
  { optional: ["state", "city", "network", "asn", "latitude", "longitude"] },
);
const probeSchema = s.object("An online Globalping probe.", {
  version: s.string("The Globalping probe software version."),
  location: probeLocationSchema,
  tags: s.stringArray("The probe tags.", { itemDescription: "A Globalping probe tag." }),
  resolvers: s.stringArray("The probe resolvers.", { itemDescription: "A DNS resolver configured for the probe." }),
});

const createMeasurementAcceptedSchema = s.object("The accepted Globalping measurement payload.", {
  id: s.string("The accepted Globalping measurement identifier."),
  probesCount: s.integer("The number of probes accepted for the measurement."),
});
const measurementProbeSchema = s.object(
  "The probe metadata returned for a Globalping measurement result.",
  {
    continent: s.string("The probe continent code."),
    country: s.string("The probe country code."),
    region: s.string("The probe region name when available."),
    state: s.string("The probe state identifier when available."),
    city: s.string("The probe city name when available."),
    network: s.string("The probe network name when available."),
    asn: s.integer("The probe autonomous system number when available."),
    latitude: s.number("The probe latitude when available."),
    longitude: s.number("The probe longitude when available."),
    tags: s.stringArray("The probe tags.", { itemDescription: "A Globalping probe tag." }),
    resolvers: s.stringArray("The probe resolvers.", {
      itemDescription: "A DNS resolver used by the probe.",
    }),
  },
  { optional: ["region", "state", "city", "network", "asn", "latitude", "longitude", "tags", "resolvers"] },
);
const measurementResultSchema = s.looseObject(
  {
    status: s.string("The current test status for this measurement result."),
    rawOutput: s.string("The raw output returned by the finished measurement result."),
  },
  {
    description: "The type-specific Globalping result payload.",
  },
);
const measurementResponseSchema = s.object(
  "The Globalping measurement response.",
  {
    id: s.string("The Globalping measurement identifier."),
    type: measurementTypeSchema,
    status: s.string("The current Globalping measurement status."),
    createdAt: s.dateTime("The ISO timestamp when the measurement was created."),
    updatedAt: s.dateTime("The ISO timestamp when the measurement was last updated."),
    target: s.string("The measurement target."),
    probesCount: s.integer("The number of probes that ran the measurement."),
    locations: s.array("The effective probe filters attached to the measurement.", probeSelectionSchema),
    limit: s.integer("The effective probe limit for the measurement."),
    measurementOptions: s.looseObject("The type-specific Globalping measurement options attached to the measurement."),
    results: s.array(
      "The results returned by Globalping for the measurement.",
      s.object("A single Globalping measurement result item.", {
        probe: measurementProbeSchema,
        result: measurementResultSchema,
      }),
    ),
  },
  { optional: ["locations", "limit", "measurementOptions"] },
);

const createMeasurementInputSchema = s.object(
  "The input payload for creating a Globalping measurement.",
  {
    type: measurementTypeSchema,
    target: s.nonEmptyString("A publicly reachable measurement target such as a hostname or an IP address."),
    in_progress_updates: s.boolean(
      "Whether Globalping should include partial in-progress updates while the measurement runs.",
    ),
    locations: s.array("The location filters used to pick probes.", probeSelectionSchema),
    limit: s.integer("The maximum number of probes to use for the measurement.", {
      minimum: 1,
      maximum: 500,
    }),
    measurement_options: measurementOptionsInputSchema,
  },
  { optional: ["in_progress_updates", "locations", "limit", "measurement_options"] },
);

function noInput(description: string): JsonSchema {
  return s.object(description, {});
}

export const globalpingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_limits",
    description: "Get the current Globalping authenticated rate limits and remaining user credits.",
    requiredScopes: [],
    inputSchema: noInput("The input payload for retrieving Globalping limits."),
    outputSchema: s.actionOutput(
      {
        limits: limitsSchema,
      },
      "The Globalping limits action output.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_probes",
    description: "List the Globalping probes that are currently online with their location metadata.",
    requiredScopes: [],
    inputSchema: noInput("The input payload for listing online Globalping probes."),
    outputSchema: s.actionOutput(
      {
        probes: s.array("The currently online Globalping probes.", probeSchema),
      },
      "The Globalping list probes action output.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_measurement",
    description: "Create a Globalping measurement and return the accepted measurement ID and headers.",
    requiredScopes: [],
    inputSchema: createMeasurementInputSchema,
    outputSchema: s.actionOutput(
      {
        measurement: createMeasurementAcceptedSchema,
        location: s.url("The absolute measurement URL returned by the Globalping Location response header."),
        rate_limit: s.object("The rate limit headers returned by the accepted measurement request.", {
          limit: s.integer("The accepted request rate limit quota."),
          consumed: s.integer("The rate limit points consumed by this request."),
          remaining: s.integer("The rate limit points remaining after this request."),
          reset: s.integer("The seconds until the rate limit resets."),
        }),
        credits: s.object(
          "The credit headers returned by the accepted measurement request.",
          {
            consumed: s.integer("The user credits consumed by this request."),
            remaining: s.integer("The user credits remaining after this request."),
          },
          { optional: ["consumed", "remaining"] },
        ),
        request_cost: s.integer("The request cost reported by Globalping."),
      },
      "The output payload for creating a Globalping measurement.",
      ["measurement", "location"],
    ),
    followUpActions: ["globalping.get_measurement"],
  }),
  defineProviderAction(service, {
    name: "get_measurement",
    description: "Get the current status and results of a Globalping measurement by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Globalping measurement.", {
      measurement_id: s.nonEmptyString("The Globalping measurement identifier to retrieve."),
    }),
    outputSchema: s.actionOutput(
      {
        measurement: measurementResponseSchema,
      },
      "The output payload for retrieving a Globalping measurement.",
    ),
  }),
];
