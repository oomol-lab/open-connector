import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "google_routes";

const fieldMaskSchema = s.nonEmptyString("The response field mask sent as the `X-Goog-FieldMask` header.");

function upstreamObject(description: string): JsonSchema {
  return s.record(description, s.unknown("A nested Google Routes API JSON property value."));
}

const computeRoutesInputSchema = s.looseRequiredObject("Input payload for Google Routes `computeRoutes`.", {
  fieldMask: fieldMaskSchema,
  origin: upstreamObject("The route origin waypoint."),
  destination: upstreamObject("The route destination waypoint."),
});
const computeRouteMatrixInputSchema = s.looseRequiredObject("Input payload for Google Routes `computeRouteMatrix`.", {
  fieldMask: fieldMaskSchema,
  origins: s.array(
    "The route matrix origin route matrix waypoints.",
    upstreamObject("One origin route matrix waypoint."),
    {
      minItems: 1,
    },
  ),
  destinations: s.array(
    "The route matrix destination route matrix waypoints.",
    upstreamObject("One destination route matrix waypoint."),
    { minItems: 1 },
  ),
});
const computeRoutesOutputSchema = s.looseObject(
  {
    routes: s.array("The routes returned by Google Routes.", upstreamObject("One route.")),
    fallbackInfo: upstreamObject("Fallback information returned by Google Routes."),
    geocodingResults: upstreamObject("Geocoding results returned by Google Routes."),
  },
  { description: "The Google Routes `computeRoutes` response." },
);
const routeMatrixElementSchema = s.looseObject(
  {
    originIndex: s.integer("The zero-based origin index for this matrix element."),
    destinationIndex: s.integer("The zero-based destination index for this matrix element."),
    status: upstreamObject("The per-element status returned by Google Routes."),
    condition: s.string("The route condition for this matrix element."),
    distanceMeters: s.integer("The route distance in meters."),
    duration: s.string("The route duration."),
    staticDuration: s.string("The route static duration without traffic."),
  },
  { description: "One Google Routes route matrix element." },
);
const computeRouteMatrixOutputSchema = s.array(
  "The Google Routes `computeRouteMatrix` response elements.",
  routeMatrixElementSchema,
);

export const googleRoutesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "compute_routes",
    description: "Compute one or more routes between an origin and destination with Google Routes.",
    requiredScopes: [],
    inputSchema: computeRoutesInputSchema,
    outputSchema: computeRoutesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "compute_route_matrix",
    description: "Compute route matrix elements for origin and destination waypoint combinations with Google Routes.",
    requiredScopes: [],
    inputSchema: computeRouteMatrixInputSchema,
    outputSchema: computeRouteMatrixOutputSchema,
  }),
];
