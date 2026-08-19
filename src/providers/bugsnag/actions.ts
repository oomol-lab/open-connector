import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bugsnag";

const paginationSchema = s.object(
  "Pagination metadata normalized from Bugsnag response headers.",
  {
    nextUrl: s.nullableString("The absolute URL for the next page returned by the Bugsnag Link header."),
    totalCount: s.nullableInteger("The total result count returned by the Bugsnag X-Total-Count header."),
  },
  {
    required: ["nextUrl", "totalCount"],
  },
);

const organizationSchema = s.object(
  "A Bugsnag organization object.",
  {
    id: s.nonEmptyString("The Bugsnag organization identifier."),
    name: s.nonEmptyString("The Bugsnag organization name."),
    slug: s.nonEmptyString("The Bugsnag organization slug."),
  },
  {
    optional: ["name", "slug"],
    additionalProperties: true,
  },
);

const projectSchema = s.object(
  "A Bugsnag project object.",
  {
    id: s.nonEmptyString("The Bugsnag project identifier."),
    name: s.nonEmptyString("The Bugsnag project name."),
    slug: s.nonEmptyString("The Bugsnag project slug."),
  },
  {
    optional: ["name", "slug"],
    additionalProperties: true,
  },
);

const errorSchema = s.object(
  "A Bugsnag error object.",
  {
    id: s.nonEmptyString("The Bugsnag error identifier."),
    error_class: s.nonEmptyString("The Bugsnag error class."),
    context: s.nonEmptyString("The application context associated with the error."),
  },
  {
    optional: ["error_class", "context"],
    additionalProperties: true,
  },
);

const eventSchema = s.object(
  "A Bugsnag event object.",
  {
    id: s.nonEmptyString("The Bugsnag event identifier."),
    severity: s.nonEmptyString("The Bugsnag event severity."),
    context: s.nonEmptyString("The application context associated with the event."),
  },
  {
    optional: ["severity", "context"],
    additionalProperties: true,
  },
);

const releaseSchema = s.object(
  "A Bugsnag release object.",
  {
    id: s.nonEmptyString("The Bugsnag release identifier."),
    release_stage: s.nonEmptyString("The release stage reported by Bugsnag."),
    version: s.nonEmptyString("The application version for the release."),
  },
  {
    optional: ["release_stage", "version"],
    additionalProperties: true,
  },
);

const perPageSchema = (description: string, maximum?: number) =>
  s.integer({
    minimum: 1,
    maximum,
    description,
  });

export const bugsnagActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List the organizations accessible to the current Bugsnag user.",
    inputSchema: s.object(
      "The input payload for listing organizations accessible to the current user.",
      {
        admin: s.boolean("Whether to return only organizations where the current user is an admin."),
        perPage: perPageSchema("The number of organizations to return per page."),
      },
      {
        optional: ["admin", "perPage"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the Bugsnag organization list request.",
      {
        organizations: s.array("The organizations accessible to the current Bugsnag user.", organizationSchema),
        pagination: paginationSchema,
      },
      {
        required: ["organizations", "pagination"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get a Bugsnag organization by organization ID.",
    inputSchema: s.object(
      "The input payload for retrieving a Bugsnag organization.",
      {
        organizationId: s.nonEmptyString("The Bugsnag organization identifier to retrieve."),
      },
      {
        required: ["organizationId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the Bugsnag organization detail request.",
      {
        organization: organizationSchema,
      },
      {
        required: ["organization"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_organization_projects",
    description: "List the projects that belong to a Bugsnag organization.",
    inputSchema: s.object(
      "The input payload for listing Bugsnag organization projects.",
      {
        organizationId: s.nonEmptyString("The Bugsnag organization identifier that owns the projects."),
        query: s.nonEmptyString("The project-name search query."),
        sort: s.stringEnum(["created_at", "name", "favorite"], {
          description: "The field used to sort Bugsnag organization projects.",
        }),
        direction: s.stringEnum(["asc", "desc"], {
          description: "The sort direction for the project list.",
        }),
        perPage: perPageSchema("The number of projects to return per page."),
      },
      {
        required: ["organizationId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the Bugsnag organization projects request.",
      {
        projects: s.array("The projects returned for the Bugsnag organization.", projectSchema),
        pagination: paginationSchema,
      },
      {
        required: ["projects", "pagination"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_project_errors",
    description: "List the errors reported on a Bugsnag project.",
    inputSchema: s.object(
      "The input payload for listing Bugsnag project errors.",
      {
        projectId: s.nonEmptyString("The Bugsnag project identifier."),
        base: s.dateTime("The ISO 8601 timestamp used as the time anchor for the error list."),
        sort: s.stringEnum(["last_seen", "first_seen", "users", "events", "unsorted"], {
          description: "The field used to sort the project errors.",
        }),
        direction: s.stringEnum(["asc", "desc"], {
          description: "The sort direction for the project errors.",
        }),
        perPage: perPageSchema("The number of errors to return per page."),
      },
      {
        required: ["projectId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the Bugsnag project errors request.",
      {
        errors: s.array("The errors returned for the Bugsnag project.", errorSchema),
        pagination: paginationSchema,
      },
      {
        required: ["errors", "pagination"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_error_events",
    description: "List the events recorded on a Bugsnag error.",
    inputSchema: s.object(
      "The input payload for listing events on a Bugsnag error.",
      {
        projectId: s.nonEmptyString("The Bugsnag project identifier."),
        errorId: s.nonEmptyString("The Bugsnag error identifier."),
        base: s.dateTime("The ISO 8601 timestamp used as the time anchor for the event list."),
        direction: s.stringEnum(["asc", "desc"], {
          description: "The sort direction for the error events.",
        }),
        perPage: perPageSchema("The number of events to return per page."),
      },
      {
        required: ["projectId", "errorId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the Bugsnag error events request.",
      {
        events: s.array("The events returned for the Bugsnag error.", eventSchema),
        pagination: paginationSchema,
      },
      {
        required: ["events", "pagination"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_latest_error_event",
    description: "Get the latest event recorded on a Bugsnag error.",
    inputSchema: s.object(
      "The input payload for retrieving the latest event on a Bugsnag error.",
      {
        errorId: s.nonEmptyString("The Bugsnag error identifier."),
      },
      {
        required: ["errorId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the latest Bugsnag error event request.",
      {
        event: eventSchema,
      },
      {
        required: ["event"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_project_releases",
    description: "List the releases associated with a Bugsnag project.",
    inputSchema: s.object(
      "The input payload for listing Bugsnag project releases.",
      {
        projectId: s.nonEmptyString("The Bugsnag project identifier."),
        releaseStage: s.nonEmptyString("The release stage used to filter the project releases."),
        base: s.dateTime("The ISO 8601 timestamp used as the upper time bound for the project releases."),
        sort: s.stringEnum(["timestamp", "percent_of_sessions"], {
          description: "The field used to sort the project releases.",
        }),
        offset: s.nonNegativeInteger("The numeric offset used to paginate project releases."),
        perPage: perPageSchema("The number of releases to return per page.", 10),
      },
      {
        required: ["projectId"],
      },
    ),
    outputSchema: s.object(
      "The output payload for the Bugsnag project releases request.",
      {
        releases: s.array("The releases returned for the Bugsnag project.", releaseSchema),
        pagination: paginationSchema,
      },
      {
        required: ["releases", "pagination"],
      },
    ),
  }),
];
