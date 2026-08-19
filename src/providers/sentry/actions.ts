import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sentry";

const stringId = (description: string): JsonSchema => s.string({ minLength: 1, description });
const integerArray = (description: string): JsonSchema =>
  s.array(s.integer({ description: "A numeric Sentry project id." }), { description });
const stringArray = (description: string): JsonSchema => s.stringArray(description);
const looseRecord = (description: string): JsonSchema => s.record(true, { description });
const looseItem = (description: string): JsonSchema => s.looseObject({}, { description });
const pagination = {
  nextCursor: s.nullable(
    s.string({
      description:
        "The opaque Sentry cursor from the Link header for the next page, or null when there are no more results.",
    }),
  ),
  previousCursor: s.nullable(
    s.string({
      description:
        "The opaque Sentry cursor from the Link header for the previous page, or null when there are no earlier results.",
    }),
  ),
};

const integration = looseItem("An installed integration within a Sentry organization.");
const provider = looseItem("A Sentry integration provider summary.");
const sentryApp = looseItem("A Sentry App with integration and OAuth settings details.");
const project = looseItem("A Sentry project returned by project list or detail endpoints.");
const issue = looseItem("A Sentry issue summary or detail payload.");
const event = looseItem("A normalized event associated with a Sentry issue.");
const release = looseItem("A Sentry release payload.");
const replay = looseItem("A Sentry replay payload.");
const alert = looseItem("A Sentry alert workflow payload.");

export const sentryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organization_integrations",
    description: "List installed integrations for a Sentry organization, with optional provider and feature filters.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId(
          "The Sentry organization id or slug whose installed integrations should be listed.",
        ),
        providerKey: stringId("Optional provider key filter such as slack, github, or jira."),
        includeConfig: s.boolean({
          description: "Whether to ask Sentry to include expanded third-party configuration details.",
        }),
        features: stringArray("Optional provider feature filters such as alert-rule or issue-sync."),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing installed Sentry integrations.",
    ),
    outputSchema: s.actionOutput({
      integrations: s.array(integration, { description: "The installed integrations returned for the organization." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_organization_integration",
    description: "Get one installed Sentry organization integration by its integration id.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The Sentry organization id or slug that owns the integration."),
        integrationId: stringId("The installed integration id to retrieve."),
      },
      ["organizationIdOrSlug", "integrationId"],
      "The input payload for retrieving an installed Sentry integration.",
    ),
    outputSchema: s.actionOutput({ integration }),
  }),
  defineProviderAction(service, {
    name: "get_organization_integration_config",
    description:
      "List available integration provider configs for a Sentry organization, optionally filtered by provider key.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId(
          "The Sentry organization id or slug whose integration config should be retrieved.",
        ),
        providerKey: stringId("Optional provider key filter such as slack, github, or jira."),
      },
      ["organizationIdOrSlug"],
      "The input payload for retrieving Sentry integration provider config.",
    ),
    outputSchema: s.actionOutput({
      providers: s.array(provider, { description: "The integration provider configs returned by Sentry." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_organization_sentry_apps",
    description: "List the custom Sentry Apps created by a Sentry organization.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The Sentry organization id or slug whose custom Sentry Apps should be listed."),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing organization-owned Sentry Apps.",
    ),
    outputSchema: s.actionOutput({
      sentryApps: s.array(sentryApp, { description: "The custom Sentry Apps returned for the organization." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sentry_app",
    description: "Get one Sentry App by id or slug, including integration metadata and OAuth client settings.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        sentryAppIdOrSlug: stringId("The Sentry App id or slug to retrieve from the global Sentry App registry."),
      },
      ["sentryAppIdOrSlug"],
      "The input payload for retrieving a Sentry App.",
    ),
    outputSchema: s.actionOutput({ sentryApp }),
  }),
  defineProviderAction(service, {
    name: "list_organization_projects",
    description: "List projects that belong to a Sentry organization.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The Sentry organization id or slug whose projects should be listed."),
        cursor: stringId("The opaque Sentry pagination cursor for the next or previous page."),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing Sentry organization projects.",
    ),
    outputSchema: s.actionOutput({
      projects: s.array(project, { description: "The projects returned by Sentry." }),
      ...pagination,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Sentry project by organization and project slug or id.",
    requiredScopes: ["project:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the project."),
        projectIdOrSlug: stringId("The Sentry project id or slug to retrieve."),
      },
      ["organizationIdOrSlug", "projectIdOrSlug"],
      "The input payload for retrieving one Sentry project.",
    ),
    outputSchema: s.actionOutput({ project }),
  }),
  defineProviderAction(service, {
    name: "list_organization_issues",
    description: "List issues for a Sentry organization with optional search, project, and environment filters.",
    requiredScopes: ["event:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug whose issues should be listed."),
        query: s.string({ description: "The Sentry issue search query string used to filter the results." }),
        sort: s.string({ description: "The issue sort order such as date, freq, inbox, new, trends, or user." }),
        limit: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The maximum number of issues to return in one page.",
        }),
        start: s.string({ description: "The inclusive ISO 8601 start time used to filter the issue results." }),
        end: s.string({ description: "The inclusive ISO 8601 end time used to filter the issue results." }),
        cursor: s.string({ description: "The opaque Sentry pagination cursor for the issue results." }),
        expand: stringArray("Additional issue data keys that Sentry should expand in the response."),
        collapse: stringArray("Response sections that Sentry should collapse or omit from the payload."),
        environments: stringArray("The environment names used to filter issues."),
        projectIds: integerArray("The numeric Sentry project ids used to filter issues."),
        statsPeriod: s.string({
          description: "The relative stats period such as 24h or 7d used for issue statistics.",
        }),
        shortIdLookup: s.boolean({
          description: "Whether Sentry should parse short issue ids inside the query string.",
        }),
        groupStatsPeriod: s.string({
          description: "The issue group statistics window such as auto, 24h, or 14d.",
        }),
        viewId: s.string({ description: "The Sentry saved view id whose filters should be applied." }),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing Sentry organization issues.",
    ),
    outputSchema: s.actionOutput({
      issues: s.array(issue, { description: "The issues returned by Sentry." }),
      ...pagination,
    }),
  }),
  defineProviderAction(service, {
    name: "get_issue",
    description: "Get one issue in a Sentry organization by numeric id or short id.",
    requiredScopes: ["event:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the issue."),
        issueId: stringId("The Sentry issue id or short id to retrieve."),
      },
      ["organizationIdOrSlug", "issueId"],
      "The input payload for retrieving one Sentry issue.",
    ),
    outputSchema: s.actionOutput({ issue }),
  }),
  defineProviderAction(service, {
    name: "get_issue_event",
    description: "Get one event for a Sentry issue by event id, or use latest, oldest, or recommended selectors.",
    requiredScopes: ["event:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the issue."),
        issueId: stringId("The Sentry issue id whose event should be retrieved."),
        eventId: stringId("The event id or selector such as latest, oldest, or recommended."),
        environments: stringArray("The environment names used to filter which issue event Sentry selects."),
      },
      ["organizationIdOrSlug", "issueId", "eventId"],
      "The input payload for retrieving one event from a Sentry issue.",
    ),
    outputSchema: s.actionOutput({ event }),
  }),
  defineProviderAction(service, {
    name: "list_issue_events",
    description: "List events that belong to one Sentry issue, with optional event query filters.",
    requiredScopes: ["event:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the issue."),
        issueId: stringId("The Sentry issue id whose events should be listed."),
        full: s.boolean({ description: "Whether Sentry should return full event payloads instead of summaries." }),
        sample: s.boolean({ description: "Whether Sentry should return a deterministic sample of issue events." }),
        query: s.string({ description: "The Sentry event search query string used to filter issue events." }),
        start: s.string({ description: "The inclusive ISO 8601 start time used to filter issue events." }),
        end: s.string({ description: "The inclusive ISO 8601 end time used to filter issue events." }),
        environments: stringArray("The environment names used to filter issue events."),
        statsPeriod: s.string({
          description: "The relative stats period such as 24h or 7d used to filter issue events.",
        }),
      },
      ["organizationIdOrSlug", "issueId"],
      "The input payload for listing events attached to one Sentry issue.",
    ),
    outputSchema: s.actionOutput({
      events: s.array(event, { description: "The issue events returned by Sentry." }),
    }),
  }),
  defineProviderAction(service, {
    name: "update_issue",
    description: "Update mutable attributes on one Sentry issue, such as status, assignment, or bookmarks.",
    requiredScopes: ["event:write"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the issue."),
        issueId: stringId("The Sentry issue id to update."),
        status: s.string({
          description: "The new issue status such as resolved, resolvedInNextRelease, unresolved, or ignored.",
        }),
        hasSeen: s.boolean({ description: "Whether the current user has seen the issue after this update." }),
        isPublic: s.boolean({ description: "Whether the issue should be visible via a public permalink." }),
        assignedTo: s.string({
          description: "The assignee actor id, username, or email address; use an empty string to unassign.",
        }),
        isBookmarked: s.boolean({
          description: "Whether the current user should bookmark the issue after this update.",
        }),
        isSubscribed: s.boolean({ description: "Whether the current user should subscribe to issue notifications." }),
        statusDetails: s.object(
          {
            inCommit: s.string({ description: "The commit hash associated with the issue resolution." }),
            inRelease: s.string({ description: "The release version in which the issue is considered resolved." }),
            inNextRelease: s.boolean({
              description: "Whether the issue is considered resolved in the next release.",
            }),
          },
          {
            additionalProperties: false,
            description: "Additional issue resolution details sent to Sentry.",
          },
        ),
      },
      ["organizationIdOrSlug", "issueId"],
      "The input payload for updating one Sentry issue.",
    ),
    outputSchema: s.actionOutput({ issue }),
  }),
  defineProviderAction(service, {
    name: "list_organization_releases",
    description: "List releases that belong to a Sentry organization, optionally filtered by version prefix.",
    requiredScopes: ["project:releases"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug whose releases should be listed."),
        query: s.string({ description: "An optional release version prefix used to filter the release list." }),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing Sentry organization releases.",
    ),
    outputSchema: s.actionOutput({
      releases: s.array(release, { description: "The releases returned by Sentry." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_organization_release",
    description: "Get one release in a Sentry organization, with optional health and summary statistics included.",
    requiredScopes: ["project:releases"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the release."),
        version: stringId("The Sentry release version identifier to retrieve."),
        health: s.boolean({ description: "Whether Sentry should include release health details in the response." }),
        summaryStatsPeriod: s.string({ description: "The relative time period used for release summary statistics." }),
        healthStatsPeriod: s.string({ description: "The relative time period used for release health statistics." }),
        adoptionStages: s.boolean({
          description: "Whether Sentry should include release adoption stage information.",
        }),
        projectId: s.string({ description: "An optional project id used to scope the release details." }),
        query: s.string({ description: "An optional Sentry query string used to filter release statistics." }),
        sort: s.string({ description: "The sort field used for release statistics in the Sentry response." }),
        status: s.string({ description: "An optional release status filter such as open or archived." }),
      },
      ["organizationIdOrSlug", "version"],
      "The input payload for retrieving one Sentry release.",
    ),
    outputSchema: s.actionOutput({ release }),
  }),
  defineProviderAction(service, {
    name: "get_release_health_stats",
    description:
      "Retrieve release health session statistics for one Sentry release by querying the sessions endpoint with that release version.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the release."),
        version: stringId("The Sentry release version to filter release health statistics by."),
        fields: stringArray("The session metric fields that Sentry should calculate."),
        groupBy: stringArray("The session dimensions that Sentry should group by."),
        query: s.string({ description: "An optional additional Sentry search query appended to the release filter." }),
        start: s.string({ description: "The inclusive ISO 8601 start time used to query release health data." }),
        end: s.string({ description: "The inclusive ISO 8601 end time used to query release health data." }),
        environments: stringArray("The environment names used to filter release health statistics."),
        projectIds: integerArray("The numeric Sentry project ids used to filter release health statistics."),
        interval: s.string({ description: "The interval used for time-series release health statistics." }),
        statsPeriod: s.string({
          description: "The relative time period such as 24h or 7d used for release health statistics.",
        }),
        includeSeries: s.integer({
          description: "Whether Sentry should include series data, using 1 for yes and 0 for no.",
        }),
        includeTotals: s.integer({
          description: "Whether Sentry should include totals data, using 1 for yes and 0 for no.",
        }),
        perPage: s.integer({ minimum: 1, description: "The maximum number of grouped rows to return." }),
        orderBy: s.string({ description: "The metric field Sentry should order the grouped rows by." }),
      },
      ["organizationIdOrSlug", "version", "fields"],
      "The input payload for retrieving Sentry release health statistics.",
    ),
    outputSchema: s.actionOutput({
      groups: s.array(looseRecord("A grouped release health statistics row."), {
        description: "The grouped release health statistics returned by Sentry.",
      }),
      intervals: stringArray("The interval boundaries returned by the Sentry sessions endpoint."),
      start: s.nullable(s.string({ description: "The ISO 8601 start time applied to the statistics query." })),
      end: s.nullable(s.string({ description: "The ISO 8601 end time applied to the statistics query." })),
    }),
  }),
  defineProviderAction(service, {
    name: "list_organization_replays",
    description: "List session replays for a Sentry organization, with optional project and environment filters.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug whose replays should be listed."),
        start: s.string({ description: "The inclusive ISO 8601 start time used to filter replays." }),
        end: s.string({ description: "The inclusive ISO 8601 end time used to filter replays." }),
        statsPeriod: s.string({ description: "The relative time period such as 1d or 7d used to filter replays." }),
        sort: s.string({ description: "The replay sort field returned by Sentry, optionally prefixed with -." }),
        field: stringArray("Additional replay fields that Sentry should include in each result."),
        query: s.string({ description: "The Sentry replay search query string used to filter results." }),
        cursor: s.string({ description: "The opaque Sentry pagination cursor for the replay results." }),
        projectIds: integerArray("The numeric Sentry project ids used to filter replays."),
        perPage: s.integer({ minimum: 1, description: "The maximum number of replay rows to return." }),
        environment: s.string({ description: "The environment name used to filter replays." }),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing Sentry organization replays.",
    ),
    outputSchema: s.actionOutput({
      replays: s.array(replay, { description: "The replays returned by Sentry." }),
      ...pagination,
    }),
  }),
  defineProviderAction(service, {
    name: "get_replay",
    description: "Get one replay instance in a Sentry organization by replay id.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the replay."),
        replayId: stringId("The replay id to retrieve."),
        start: s.string({ description: "The inclusive ISO 8601 start time used to scope replay detail metrics." }),
        end: s.string({ description: "The inclusive ISO 8601 end time used to scope replay detail metrics." }),
        statsPeriod: s.string({
          description: "The relative time period such as 1h or 7d used to scope replay detail metrics.",
        }),
        sort: s.string({ description: "The replay detail sort field returned by Sentry, optionally prefixed with -." }),
        field: stringArray("Additional replay detail fields that Sentry should include in the response."),
        query: s.string({
          description: "The Sentry replay search query string used to scope the replay detail response.",
        }),
        cursor: s.string({ description: "The opaque Sentry pagination cursor for nested replay detail data." }),
        projectIds: integerArray("The numeric Sentry project ids used to scope replay details."),
        perPage: s.integer({ minimum: 1, description: "The maximum number of nested replay detail rows to return." }),
        environment: s.string({ description: "The environment name used to scope replay details." }),
      },
      ["organizationIdOrSlug", "replayId"],
      "The input payload for retrieving one Sentry replay.",
    ),
    outputSchema: s.actionOutput({
      replay,
      ...pagination,
    }),
  }),
  defineProviderAction(service, {
    name: "list_alerts",
    description: "List alert workflows for a Sentry organization, with optional id, project, and search filters.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug whose alert workflows should be listed."),
        ids: stringArray("Specific alert workflow ids that Sentry should filter the list to."),
        query: s.string({ description: "An optional free-text search query used to filter alert workflows." }),
        sortBy: s.string({ description: "The alert workflow sort field, optionally prefixed with - for descending." }),
        projectIds: integerArray("The numeric Sentry project ids used to filter alert workflows."),
      },
      ["organizationIdOrSlug"],
      "The input payload for listing Sentry alert workflows.",
    ),
    outputSchema: s.actionOutput({
      alerts: s.array(alert, { description: "The alert workflows returned by Sentry." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_alert",
    description: "Get one alert workflow in a Sentry organization by workflow id.",
    requiredScopes: ["org:read"],
    inputSchema: s.actionInput(
      {
        organizationIdOrSlug: stringId("The organization id or slug that owns the alert workflow."),
        alertId: stringId("The alert workflow id to retrieve."),
      },
      ["organizationIdOrSlug", "alertId"],
      "The input payload for retrieving one Sentry alert workflow.",
    ),
    outputSchema: s.actionOutput({ alert }),
  }),
];
