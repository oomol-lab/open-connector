import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lumos";

const pageInputFields = {
  page: s.integer({
    minimum: 1,
    description: "The 1-based page number to request from Lumos.",
  }),
  size: s.integer({
    minimum: 1,
    maximum: 100,
    description: "The number of items per page. Lumos caps this value at 100.",
  }),
};

const appExpandSchema = s.array(
  "App fields to expand. Lumos currently supports custom_attributes.",
  s.stringEnum(["custom_attributes"], {
    description: "An AppStore app expansion field.",
  }),
);

const accessRequestExpandSchema = s.array(
  "Access request fields to expand. Lumos currently supports tasks and custom_fields.",
  s.stringEnum(["tasks", "custom_fields"], {
    description: "An access request expansion field.",
  }),
);

const appSchema = s.looseObject("An AppStore app returned by Lumos.", {
  id: s.string("The ID of this app."),
  app_class_id: s.string("The non-unique ID of the service associated with this requestable permission."),
  instance_id: s.string("The non-unique ID of the instance associated with this app."),
  user_friendly_label: s.string("The user-friendly label of this app."),
  status: s.string("The status of this app."),
  logo_url: s.nullableString("The URL of the logo of this app."),
  website_url: s.nullableString("The URL of the website of this app."),
  description: s.nullableString("The user-facing description of the app."),
  category: s.nullableString("The category of the app, as shown in the AppStore."),
});

const accessRequestSchema = s.looseObject("An access request returned by Lumos.", {
  id: s.string("The ID of the access request."),
  app_id: s.string("The ID of the app the request is for."),
  app_name: s.string("The name of the app the request is for."),
  status: s.string("The current status of the request."),
  expires_at: s.nullableString("When the access request expires, if it has an expiration."),
  expiration_in_seconds: s.nullableInteger("The lifetime of time-based access after provisioning, in seconds."),
  requested_at: s.nullableString("When the access request was created."),
});

const pageMetadataSchema = {
  page: s.integer("The page number returned by Lumos."),
  size: s.integer("The page size returned by Lumos."),
  total: s.nullableInteger("The total number of items when Lumos returns it."),
};

const pagedAppsOutputSchema = s.object("A normalized page of Lumos AppStore apps.", {
  apps: s.array("The AppStore apps returned by Lumos.", appSchema),
  ...pageMetadataSchema,
  raw: s.looseObject("The raw Lumos response payload."),
});

const pagedAccessRequestsOutputSchema = s.object("A normalized page of Lumos access requests.", {
  accessRequests: s.array("The access requests returned by Lumos.", accessRequestSchema),
  ...pageMetadataSchema,
  raw: s.looseObject("The raw Lumos response payload."),
});

export const lumosActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_appstore_apps",
    description: "List AppStore apps in Lumos with optional search and visibility filters.",
    inputSchema: s.object(
      "Input parameters for listing Lumos AppStore apps.",
      {
        app_id: s.nonEmptyString("Filter apps by the ID of the app."),
        name_search: s.nonEmptyString("Search against name, app instance identifier, and app class ID."),
        exact_match: s.boolean("Whether the name_search filter should be an exact match."),
        all_visibilities: s.boolean(
          "Whether to include apps regardless of AppStore visibility. Only available to admins.",
        ),
        expand: appExpandSchema,
        ...pageInputFields,
      },
      {
        optional: ["app_id", "name_search", "exact_match", "all_visibilities", "expand", "page", "size"],
      },
    ),
    outputSchema: pagedAppsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_appstore_app",
    description: "Get a single AppStore app from Lumos by app ID.",
    inputSchema: s.object(
      "Input parameters for getting a Lumos AppStore app.",
      {
        app_id: s.nonEmptyString("The ID of the AppStore app to retrieve."),
        expand: appExpandSchema,
      },
      { optional: ["expand"] },
    ),
    outputSchema: s.object("The normalized Lumos AppStore app response.", {
      app: appSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_access_requests",
    description: "List access requests in Lumos with optional user and status filters.",
    inputSchema: s.object(
      "Input parameters for listing Lumos access requests.",
      {
        target_user_id: s.nonEmptyString("Filter requests by the ID of the target user."),
        requester_user_id: s.nonEmptyString("Filter requests by the ID of the requesting user."),
        user_id: s.nonEmptyString("Filter requests by the ID of the user."),
        statuses: s.array(
          "Filter requests by their Lumos status values.",
          s.nonEmptyString("A Lumos access request status."),
        ),
        sort: s.stringEnum(["ASC", "DESC"], {
          description: "Sort access requests by created date.",
        }),
        expand: accessRequestExpandSchema,
        ...pageInputFields,
      },
      {
        optional: ["target_user_id", "requester_user_id", "user_id", "statuses", "sort", "expand", "page", "size"],
      },
    ),
    outputSchema: pagedAccessRequestsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_access_request",
    description: "Get a single Lumos access request by ID.",
    inputSchema: s.object(
      "Input parameters for getting a Lumos access request.",
      {
        id: s.nonEmptyString("The ID of the access request to retrieve."),
        expand: accessRequestExpandSchema,
      },
      { optional: ["expand"] },
    ),
    outputSchema: s.object("The normalized Lumos access request response.", {
      accessRequest: accessRequestSchema,
    }),
  }),
];
