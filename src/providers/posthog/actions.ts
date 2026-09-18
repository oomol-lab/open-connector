import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "posthog";

const jsonIdField = s.anyOf("Identifier accepted by the official PostHog API path.", [
  s.string("String identifier accepted by the official PostHog API path.", { minLength: 1 }),
  s.integer("Numeric identifier accepted by the official PostHog API path."),
]);
const idField = jsonIdField;
const organizationIdField = s.anyOf(
  "Organization ID. When omitted, the provider falls back to the current organization from the connected user.",
  [
    s.string("String organization ID accepted by the official PostHog API path.", {
      minLength: 1,
    }),
    s.integer("Numeric organization ID accepted by the official PostHog API path."),
  ],
);
const jsonProjectIdField = s.anyOf("Project ID of the project to access.", [
  s.string("String project ID of the project to access.", { minLength: 1 }),
  s.integer("Numeric project ID of the project to access."),
]);
const projectIdField = jsonProjectIdField;
const paginationCountField = s.integer("Total number of results available.");
const paginationNextField = s.nullable(
  s.string("URL for the next page of results, or null when there is no next page."),
);
const paginationPreviousField = s.nullable(
  s.string("URL for the previous page of results, or null when there is no previous page."),
);
const limitField = s.positiveInteger("Number of results to return per page.");
const offsetField = s.nonNegativeInteger("Initial index from which to return the results.");
const jsonLooseObject = s.looseObject("Object payload accepted or returned by PostHog.");
const jsonRawObject = s.looseObject("Full raw payload returned by PostHog.");
const looseArray = (description: string) => s.array(description, s.unknown("Array item returned by PostHog."));
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableNumber = (description: string) => s.nullable(s.number(description));
const nullableBoolean = (description: string) => s.nullable(s.boolean(description));

const organizationBasicSchema = s.looseRequiredObject(
  "PostHog organization summary.",
  {
    id: s.string("Organization UUID."),
    name: s.string("Organization name."),
    slug: s.string("Organization slug."),
    membership_level: nullableNumber("Membership level for the current user in this organization."),
  },
  { optional: ["slug", "membership_level"] },
);

const teamBasicSchema = s.looseRequiredObject(
  "PostHog current team summary.",
  {
    id: s.integer("Numeric team identifier."),
    uuid: s.string("Team UUID."),
    organization: s.string("Owning organization UUID."),
    project_id: s.number("Numeric project identifier."),
    name: s.string("Team or project name."),
    api_token: s.string("Project API token."),
    timezone: s.string("Project timezone."),
  },
  { optional: ["uuid", "organization", "project_id", "name", "api_token", "timezone"] },
);

const userSchema = s.looseRequiredObject(
  "PostHog current user.",
  {
    id: s.integer("Numeric user identifier."),
    uuid: s.string("User UUID."),
    distinct_id: nullableString("Current distinct ID for the user."),
    first_name: s.string("User first name."),
    last_name: s.string("User last name."),
    email: s.string("User email address."),
    pending_email: nullableString("Pending email address awaiting verification."),
    is_email_verified: nullableBoolean("Whether the email address is verified."),
    is_staff: s.boolean("Whether the user has staff access."),
    role_at_organization: s.string("Declared role for the user within the organization."),
    date_joined: s.string("Datetime when the user joined PostHog."),
    team: s.nullable(teamBasicSchema),
    organization: s.nullable(organizationBasicSchema),
    organizations: s.array("Organizations accessible to the user.", organizationBasicSchema),
    hedgehog_config: s.nullable(s.looseObject("User hedgehog configuration returned by PostHog.")),
    notification_settings: s.looseObject("Notification settings for the user."),
  },
  {
    optional: [
      "distinct_id",
      "first_name",
      "last_name",
      "pending_email",
      "is_email_verified",
      "is_staff",
      "role_at_organization",
      "date_joined",
      "team",
      "organization",
      "organizations",
      "hedgehog_config",
      "notification_settings",
    ],
  },
);

const userBasicSchema = s.looseRequiredObject(
  "Basic PostHog user.",
  {
    id: s.integer("Numeric user identifier."),
    uuid: s.string("User UUID."),
    email: s.string("User email address."),
    first_name: s.string("User first name."),
    last_name: s.string("User last name."),
    distinct_id: nullableString("Current distinct ID for the user."),
    role_at_organization: nullableString("Role declared for the user within the organization."),
  },
  {
    optional: ["first_name", "last_name", "distinct_id", "role_at_organization"],
  },
);

const projectSchema = s.looseRequiredObject(
  "PostHog project.",
  {
    id: s.integer("Numeric project identifier."),
    organization: s.string("Owning organization UUID."),
    uuid: s.string("Project UUID."),
    name: s.string("Project name."),
    api_token: s.string("Project API token."),
    created_at: s.string("Project creation datetime."),
    updated_at: s.string("Project update datetime."),
    product_description: nullableString("Description configured for the product."),
    timezone: s.string("Project timezone."),
    is_demo: s.boolean("Whether the project is a demo project."),
    ingested_event: s.boolean("Whether the project has ingested at least one event."),
    access_control: s.boolean("Whether access control is enabled."),
    app_urls: s.array("Configured application URLs.", s.nullable(s.string("Configured application URL."))),
    group_types: s.array("Configured group types.", s.looseObject("Configured group type returned by PostHog.")),
    product_intents: s.array(
      "Product intent summaries for the project.",
      s.looseObject("Product intent summary returned by PostHog."),
    ),
    secret_api_token: nullableString("Project secret API token when available."),
    secret_api_token_backup: nullableString("Project secret API token backup when available."),
  },
  {
    optional: [
      "api_token",
      "created_at",
      "updated_at",
      "product_description",
      "timezone",
      "is_demo",
      "ingested_event",
      "access_control",
      "app_urls",
      "group_types",
      "product_intents",
      "secret_api_token",
      "secret_api_token_backup",
    ],
  },
);

const eventDefinitionSchema = s.looseRequiredObject(
  "PostHog event definition.",
  {
    id: s.string("Event definition UUID."),
    name: s.string("Event definition name."),
    owner: nullableNumber("Owner user ID."),
    description: nullableString("Description for the event definition."),
    tags: looseArray("Tags attached to the event definition."),
    created_at: nullableString("Creation datetime for the event definition."),
    updated_at: s.string("Update datetime for the event definition."),
    updated_by: s.nullable(userBasicSchema),
    last_seen_at: nullableString("Datetime when the event was last seen."),
    last_updated_at: s.string("Datetime of the last upstream update."),
    verified: s.boolean("Whether the event definition is verified."),
    verified_at: nullableString("Datetime when the event definition was verified."),
    verified_by: s.nullable(userBasicSchema),
    hidden: nullableBoolean("Whether the event definition is hidden."),
    enforcement_mode: s.string("Enforcement mode for this event definition."),
    primary_property: nullableString("Primary property displayed alongside this event."),
    is_action: s.boolean("Whether the definition represents an action."),
    action_id: s.number("Action ID if this definition is an action."),
    is_calculating: s.boolean("Whether PostHog is calculating related metadata."),
    last_calculated_at: s.string("Last calculation datetime."),
    created_by: s.nullable(userBasicSchema),
    post_to_slack: s.boolean("Whether new events post to Slack."),
    default_columns: s.array("Default columns configured for this event definition.", s.string("Default column name.")),
    media_preview_urls: s.array("Media preview URLs returned by PostHog.", s.string("Media preview URL.")),
  },
  {
    optional: [
      "owner",
      "description",
      "tags",
      "created_at",
      "updated_at",
      "updated_by",
      "last_seen_at",
      "last_updated_at",
      "verified",
      "verified_at",
      "verified_by",
      "hidden",
      "enforcement_mode",
      "primary_property",
      "is_action",
      "action_id",
      "is_calculating",
      "last_calculated_at",
      "created_by",
      "post_to_slack",
      "default_columns",
      "media_preview_urls",
    ],
  },
);

const propertyDefinitionSchema = s.looseRequiredObject(
  "PostHog property definition.",
  {
    id: s.string("Property definition UUID."),
    name: s.string("Property name."),
    description: nullableString("Description for the property definition."),
    tags: looseArray("Tags attached to the property definition."),
    is_numerical: s.boolean("Whether the property is numerical."),
    updated_at: s.string("Datetime when the property definition was updated."),
    updated_by: s.nullable(userBasicSchema),
    is_seen_on_filtered_events: nullableBoolean("Whether the property was seen on the filtered events."),
    property_type: nullableString("Property type inferred by PostHog."),
    verified: s.boolean("Whether the property definition is verified."),
    verified_at: nullableString("Datetime when the property definition was verified."),
    verified_by: s.nullable(userBasicSchema),
    hidden: nullableBoolean("Whether the property definition is hidden."),
  },
  {
    optional: [
      "description",
      "tags",
      "updated_by",
      "is_seen_on_filtered_events",
      "property_type",
      "verified",
      "verified_at",
      "verified_by",
      "hidden",
    ],
  },
);

const cohortSchema = s.looseRequiredObject(
  "PostHog cohort.",
  {
    id: s.integer("Numeric cohort identifier."),
    name: nullableString("Cohort name."),
    description: s.string("Description for the cohort."),
    groups: s.looseObject("Raw group configuration returned by PostHog."),
    deleted: s.boolean("Whether the cohort is marked as deleted."),
    filters: s.nullable(s.looseObject("Cohort filters returned by PostHog.")),
    query: s.nullable(s.looseObject("Query payload returned by PostHog for this cohort.")),
    version: nullableNumber("Current cohort version."),
    pending_version: nullableNumber("Pending cohort version."),
    is_calculating: s.boolean("Whether the cohort is being recalculated."),
    created_by: s.nullable(userBasicSchema),
    created_at: nullableString("Datetime when the cohort was created."),
    last_calculation: nullableString("Datetime when the cohort was last calculated."),
    last_backfill_person_properties_at: nullableString("Datetime when person properties were last backfilled."),
    errors_calculating: s.number("Number of calculation errors recorded for the cohort."),
    last_error_message: nullableString("Most recent cohort calculation error message."),
    count: nullableNumber("Number of persons in the cohort."),
    is_static: s.boolean("Whether the cohort is static."),
    cohort_type: nullableString("Cohort type classified by PostHog."),
    experiment_set: s.array("Experiment IDs attached to the cohort.", s.number("Experiment identifier.")),
  },
  {
    optional: [
      "name",
      "description",
      "groups",
      "deleted",
      "filters",
      "query",
      "version",
      "pending_version",
      "is_calculating",
      "created_by",
      "created_at",
      "last_calculation",
      "last_backfill_person_properties_at",
      "errors_calculating",
      "last_error_message",
      "count",
      "is_static",
      "cohort_type",
      "experiment_set",
    ],
  },
);

const resolvedDateRangeSchema = s.looseRequiredObject(
  "Resolved date range returned by PostHog.",
  {
    date_from: s.string("Resolved start datetime for the date range."),
    date_to: s.string("Resolved end datetime for the date range."),
  },
  { optional: ["date_from", "date_to"] },
);

const insightSchema = s.looseRequiredObject(
  "PostHog insight with a stable top-level connector shape.",
  {
    id: s.integer("Numeric insight identifier."),
    short_id: s.string("Short insight identifier."),
    name: nullableString("Insight name."),
    derived_name: nullableString("Derived insight name."),
    query: s.nullable(s.looseObject("Insight query definition returned by PostHog.")),
    order: nullableNumber("Display order for the insight."),
    deleted: s.boolean("Whether the insight is marked as deleted."),
    dashboards: s.array("Dashboard IDs referencing the insight.", s.number("Dashboard ID.")),
    dashboard_tiles: s.array(
      "Dashboard tile summaries referencing the insight.",
      s.looseObject("Dashboard tile summary returned by PostHog."),
    ),
    last_refresh: nullableString("Datetime when the insight results were last refreshed."),
    cache_target_age: nullableString("Target age timestamp for cached insight results."),
    next_allowed_client_refresh: nullableString("Earliest datetime when a client may refresh the insight."),
    result: s.unknown("Insight result payload returned by PostHog."),
    hasMore: nullableBoolean("Whether the insight has more result rows."),
    columns: s.nullable(s.array("Column names for the result.", s.string("Column name."))),
    created_at: nullableString("Datetime when the insight was created."),
    created_by: s.nullable(userBasicSchema),
    description: nullableString("Insight description."),
    updated_at: s.string("Datetime when the insight was updated."),
    tags: looseArray("Tags attached to the insight."),
    favorited: s.boolean("Whether the insight is favorited."),
    last_modified_at: s.string("Datetime when the insight was last modified."),
    last_modified_by: s.nullable(userBasicSchema),
    is_sample: s.boolean("Whether the insight is a sample insight."),
    effective_restriction_level: s.number("Effective restriction level for the current user."),
    effective_privilege_level: s.number("Effective privilege level for the current user."),
    user_access_level: nullableString("Effective user access level for the insight."),
    timezone: nullableString("Timezone used to display the insight."),
    is_cached: s.boolean("Whether the returned insight result is cached."),
    query_status: s.nullable(s.looseObject("Query status returned with the insight.")),
    hogql: nullableString("Generated HogQL query for the insight."),
    types: s.nullable(looseArray("Types returned for the insight.")),
    resolved_date_range: s.nullable(resolvedDateRangeSchema),
    alerts: looseArray("Alerts attached to the insight."),
    last_viewed_at: nullableString("Datetime when the insight was last viewed."),
    raw: s.looseObject("Full raw insight payload returned by PostHog."),
  },
  {
    optional: [
      "short_id",
      "name",
      "derived_name",
      "query",
      "order",
      "deleted",
      "dashboards",
      "dashboard_tiles",
      "last_refresh",
      "cache_target_age",
      "next_allowed_client_refresh",
      "result",
      "hasMore",
      "columns",
      "created_at",
      "created_by",
      "description",
      "updated_at",
      "tags",
      "favorited",
      "last_modified_at",
      "last_modified_by",
      "is_sample",
      "effective_restriction_level",
      "effective_privilege_level",
      "user_access_level",
      "timezone",
      "is_cached",
      "query_status",
      "hogql",
      "types",
      "resolved_date_range",
      "alerts",
      "last_viewed_at",
    ],
  },
);

const paginatedProjectsSchema = s.object("Paginated PostHog project list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Projects returned by PostHog.", projectSchema),
});

const paginatedEventDefinitionsSchema = s.object("Paginated PostHog event definition list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Event definitions returned by PostHog.", eventDefinitionSchema),
});

const paginatedPropertyDefinitionsSchema = s.object("Paginated PostHog property definition list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Property definitions returned by PostHog.", propertyDefinitionSchema),
});

const annotationSchema = s.looseRequiredObject(
  "PostHog annotation.",
  {
    id: s.integer("Numeric annotation identifier."),
    content: nullableString("Annotation text shown on charts."),
    date_marker: nullableString("ISO 8601 timestamp when this annotation happened."),
    creation_type: s.string("Annotation creation type returned by PostHog."),
    dashboard_item: nullableNumber("Dashboard tile or insight identifier attached to the annotation."),
    dashboard_id: nullableNumber("Dashboard identifier attached to the annotation."),
    dashboard_name: nullableString("Dashboard name attached to the annotation."),
    insight_short_id: nullableString("Insight short ID attached to the annotation."),
    insight_name: nullableString("Insight name attached to the annotation."),
    insight_derived_name: nullableString("Derived insight name attached to the annotation."),
    created_by: s.nullable(userBasicSchema),
    created_at: nullableString("Datetime when the annotation was created."),
    updated_at: s.string("Datetime when the annotation was updated."),
    deleted: s.boolean("Whether the annotation is marked as deleted."),
    scope: s.string("Annotation visibility scope."),
    raw: jsonRawObject,
  },
  {
    optional: [
      "content",
      "date_marker",
      "creation_type",
      "dashboard_item",
      "dashboard_id",
      "dashboard_name",
      "insight_short_id",
      "insight_name",
      "insight_derived_name",
      "created_by",
      "created_at",
      "updated_at",
      "deleted",
      "scope",
    ],
  },
);

const paginatedAnnotationsSchema = s.object("Paginated PostHog annotation list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Annotations returned by PostHog.", annotationSchema),
  raw: jsonRawObject,
});

const paginatedCohortsSchema = s.object("Paginated PostHog cohort list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Cohorts returned by PostHog.", cohortSchema),
});

const cohortPersonsSchema = s.object("Paginated PostHog cohort person list.", {
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array(
    "Persons returned by PostHog for this cohort.",
    s.looseRequiredObject(
      "Person row returned by PostHog for a cohort.",
      {
        type: s.string("Result type returned by PostHog."),
        id: s.string("Person identifier returned by PostHog."),
        uuid: s.string("Person UUID returned by PostHog."),
        distinct_ids: s.array("Distinct IDs associated with this person.", s.string("Person distinct ID.")),
        properties: s.looseObject("Person properties returned by PostHog."),
      },
      { optional: ["type", "id", "uuid", "distinct_ids", "properties"] },
    ),
  ),
  raw: jsonRawObject,
});

const cohortGenericPayloadSchema = s.object("Raw PostHog cohort endpoint payload.", {
  raw: jsonRawObject,
});

const paginatedInsightsSchema = s.object("Paginated PostHog insight list with a stable top-level connector shape.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Insights returned by PostHog.", insightSchema),
  raw: s.looseObject("Full raw insight list payload returned by PostHog."),
});

const dashboardSchema = s.looseRequiredObject(
  "PostHog dashboard with a stable top-level connector shape.",
  {
    id: s.integer("Numeric dashboard identifier."),
    name: nullableString("Dashboard name."),
    description: s.string("Dashboard description."),
    pinned: s.boolean("Whether the dashboard is pinned to the top of the list."),
    created_at: s.string("Datetime when the dashboard was created."),
    created_by: s.nullable(userBasicSchema),
    last_accessed_at: nullableString("Datetime when the dashboard was last accessed."),
    last_viewed_at: nullableString("Datetime when the dashboard was last viewed."),
    is_shared: s.boolean("Whether the dashboard is shared."),
    deleted: s.boolean("Whether the dashboard is marked as deleted."),
    creation_mode: s.string("Dashboard creation mode returned by PostHog."),
    filters: s.nullable(s.looseObject("Dashboard filters returned by PostHog.")),
    variables: s.nullable(s.looseObject("Dashboard variables returned by PostHog.")),
    breakdown_colors: s.unknown("Custom color mapping for breakdown values."),
    data_color_theme_id: nullableNumber("Color theme ID used for chart visualizations."),
    tags: looseArray("Tags attached to the dashboard."),
    restriction_level: s.integer("Dashboard restriction level."),
    effective_restriction_level: s.integer("Effective restriction level for the current user."),
    effective_privilege_level: s.integer("Effective privilege level for the current user."),
    user_access_level: nullableString("Effective user access level for the dashboard."),
    access_control_version: s.string("Dashboard access control version."),
    last_refresh: nullableString("Datetime when the dashboard last refreshed."),
    persisted_filters: s.nullable(s.looseObject("Persisted dashboard filters.")),
    persisted_variables: s.nullable(s.looseObject("Persisted dashboard variables.")),
    team_id: s.integer("Project or team ID this dashboard belongs to."),
    quick_filter_ids: s.nullable(
      s.array("Quick filter IDs associated with this dashboard.", s.string("Quick filter ID.")),
    ),
    tiles: s.nullable(s.array("Dashboard tile payloads returned by PostHog.", jsonLooseObject)),
    raw: jsonRawObject,
  },
  {
    optional: [
      "name",
      "description",
      "pinned",
      "created_at",
      "created_by",
      "last_accessed_at",
      "last_viewed_at",
      "is_shared",
      "deleted",
      "creation_mode",
      "filters",
      "variables",
      "breakdown_colors",
      "data_color_theme_id",
      "tags",
      "restriction_level",
      "effective_restriction_level",
      "effective_privilege_level",
      "user_access_level",
      "access_control_version",
      "last_refresh",
      "persisted_filters",
      "persisted_variables",
      "team_id",
      "quick_filter_ids",
      "tiles",
    ],
  },
);

const dashboardBasicSchema = s.looseRequiredObject(
  "PostHog dashboard summary.",
  {
    id: s.integer("Numeric dashboard identifier."),
    name: nullableString("Dashboard name."),
    description: s.string("Dashboard description."),
    pinned: s.boolean("Whether the dashboard is pinned to the top of the list."),
    created_at: s.string("Datetime when the dashboard was created."),
    created_by: s.nullable(userBasicSchema),
    last_accessed_at: nullableString("Datetime when the dashboard was last accessed."),
    last_viewed_at: nullableString("Datetime when the dashboard was last viewed."),
    is_shared: s.boolean("Whether the dashboard is shared."),
    deleted: s.boolean("Whether the dashboard is marked as deleted."),
    creation_mode: s.string("Dashboard creation mode returned by PostHog."),
    tags: looseArray("Tags attached to the dashboard."),
    restriction_level: s.integer("Dashboard restriction level."),
    effective_restriction_level: s.integer("Effective restriction level for the current user."),
    effective_privilege_level: s.integer("Effective privilege level for the current user."),
    user_access_level: nullableString("Effective user access level for the dashboard."),
    access_control_version: s.string("Dashboard access control version."),
    last_refresh: nullableString("Datetime when the dashboard last refreshed."),
    team_id: s.integer("Project or team ID this dashboard belongs to."),
  },
  {
    optional: [
      "name",
      "description",
      "pinned",
      "created_at",
      "created_by",
      "last_accessed_at",
      "last_viewed_at",
      "is_shared",
      "deleted",
      "creation_mode",
      "tags",
      "restriction_level",
      "effective_restriction_level",
      "effective_privilege_level",
      "user_access_level",
      "access_control_version",
      "last_refresh",
      "team_id",
    ],
  },
);

const paginatedDashboardsSchema = s.object("Paginated PostHog dashboard list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Dashboards returned by PostHog.", dashboardBasicSchema),
  raw: jsonRawObject,
});

const listPropertyDefinitionsInputSchema = s.object(
  "Input for listing PostHog property definitions.",
  {
    project_id: projectIdField,
    event_names: s.string("JSON-encoded event names used by PostHog to populate filtered event visibility."),
    exclude_core_properties: s.boolean("Whether to exclude core properties."),
    exclude_hidden: s.boolean("Whether to exclude hidden properties."),
    excluded_properties: s.string("JSON-encoded list of excluded properties."),
    filter_by_event_names: nullableBoolean("Whether to return only properties seen on the supplied event names."),
    group_type_index: s.integer("Group type index to use when type is group."),
    is_feature_flag: nullableBoolean("Whether to include only or exclude feature flag properties."),
    is_numerical: nullableBoolean("Whether to include only or exclude numerical properties."),
    limit: limitField,
    offset: offsetField,
    properties: s.string("Comma-separated list of properties to filter."),
    search: s.string("Search term used to match property names."),
    type: s.stringEnum("Property definition type to return.", ["event", "person", "group", "session"]),
    verified: nullableBoolean("Whether to filter by verified state."),
  },
  {
    optional: [
      "event_names",
      "exclude_core_properties",
      "exclude_hidden",
      "excluded_properties",
      "filter_by_event_names",
      "group_type_index",
      "is_feature_flag",
      "is_numerical",
      "limit",
      "offset",
      "properties",
      "search",
      "type",
      "verified",
    ],
  },
);

const eventDefinitionWriteFields = {
  project_id: jsonProjectIdField,
  name: s.string("Event definition name.", { maxLength: 400 }),
  owner: s.nullable(s.integer("Owner user ID.")),
  description: nullableString("Description for the event definition."),
  tags: looseArray("Tags attached to the event definition."),
  verified: s.boolean("Whether the event definition is verified."),
  hidden: nullableBoolean("Whether the event definition is hidden."),
  enforcement_mode: s.string("Enforcement mode for this event definition."),
  primary_property: nullableString("Primary property displayed alongside this event."),
  post_to_slack: s.boolean("Whether new events should post to Slack."),
  default_columns: s.array("Default columns configured for this event definition.", s.string("Default column name.")),
};

const createEventDefinitionInputJsonSchema = s.object(
  "Input for creating a PostHog event definition.",
  eventDefinitionWriteFields,
  {
    optional: [
      "owner",
      "description",
      "tags",
      "verified",
      "hidden",
      "enforcement_mode",
      "primary_property",
      "post_to_slack",
      "default_columns",
    ],
  },
);

const updateEventDefinitionInputJsonSchema = s.object(
  "Input for updating a PostHog event definition.",
  {
    ...eventDefinitionWriteFields,
    id: jsonIdField,
  },
  {
    optional: [
      "name",
      "owner",
      "description",
      "tags",
      "verified",
      "hidden",
      "enforcement_mode",
      "primary_property",
      "post_to_slack",
      "default_columns",
    ],
  },
);

const eventDefinitionIdInputJsonSchema = s.object("Input for a PostHog event definition.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
});

const eventDefinitionByNameInputJsonSchema = s.object("Input for getting a PostHog event definition by exact name.", {
  project_id: jsonProjectIdField,
  name: s.string("Exact event name to look up.", { minLength: 1 }),
});

const eventDefinitionPrimaryPropertiesInputJsonSchema = s.object(
  "Input for getting PostHog event definition primary properties.",
  {
    project_id: jsonProjectIdField,
    names: s.array("Event names to restrict the response to.", s.string("Event name."), {
      minItems: 1,
    }),
  },
  { optional: ["names"] },
);

const primaryPropertiesOutputJsonSchema = s.object("Primary properties configured for PostHog event definitions.", {
  results: s.record(
    "Primary properties keyed by event name.",
    s.unknown("Primary property value returned by PostHog."),
  ),
  raw: s.unknown("Full raw primary properties payload returned by PostHog."),
});

const propertyDefinitionWriteFields = {
  project_id: jsonProjectIdField,
  description: nullableString("Description for the property definition."),
  tags: looseArray("Tags attached to the property definition."),
  verified: s.boolean("Whether the property definition is verified."),
  hidden: nullableBoolean("Whether the property definition is hidden."),
  property_type: nullableString("Property type classified by PostHog."),
};

const propertyDefinitionIdInputJsonSchema = s.object("Input for a PostHog property definition.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
});

const updatePropertyDefinitionInputJsonSchema = s.object(
  "Input for updating a PostHog property definition.",
  {
    ...propertyDefinitionWriteFields,
    id: jsonIdField,
  },
  { optional: ["description", "tags", "verified", "hidden", "property_type"] },
);

const bulkUpdateTagsInputJsonSchema = s.object("Input for bulk updating tags on PostHog definitions.", {
  project_id: jsonProjectIdField,
  ids: s.array("Object IDs to update tags on.", s.integer("Object ID."), {
    minItems: 1,
    maxItems: 500,
  }),
  action: s.stringEnum("Bulk tag action to perform.", ["add", "remove", "set"]),
  tags: s.array("Tag names to add, remove, or set.", s.string("Tag name."), {
    minItems: 1,
  }),
});

const bulkUpdateTagsOutputJsonSchema = s.object("PostHog bulk tag update response.", {
  updated: looseArray("Objects whose tags were updated."),
  skipped: looseArray("Objects skipped by PostHog during tag update."),
  raw: jsonRawObject,
});

const deleteDefinitionOutputJsonSchema = s.object("Result returned after deleting a definition.", {
  deleted: s.boolean("Whether the delete request succeeded."),
  id: s.string("Deleted definition identifier."),
  raw: jsonRawObject,
});

const annotationWriteFields = {
  project_id: jsonProjectIdField,
  content: nullableString("Annotation text shown on charts."),
  date_marker: nullableString("ISO 8601 timestamp when this annotation happened."),
  creation_type: s.stringEnum("Annotation creation type.", ["USR", "GIT"]),
  dashboard_item: nullableNumber("Dashboard tile or insight identifier attached to the annotation."),
  dashboard_id: nullableNumber("Dashboard identifier attached to the annotation."),
  deleted: s.boolean("Whether the annotation should be marked as deleted."),
  scope: s.stringEnum("Annotation visibility scope.", ["dashboard_item", "dashboard", "project", "organization"]),
};

const listAnnotationsInputJsonSchema = s.object(
  "Input for listing PostHog annotations.",
  {
    project_id: jsonProjectIdField,
    limit: limitField,
    offset: offsetField,
    search: s.string("Search term used to match annotations."),
  },
  { optional: ["limit", "offset", "search"] },
);

const annotationIdInputJsonSchema = s.object("Input for a PostHog annotation.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
});

const createAnnotationInputJsonSchema = s.object("Input for creating a PostHog annotation.", annotationWriteFields, {
  optional: ["content", "date_marker", "creation_type", "dashboard_item", "dashboard_id", "deleted", "scope"],
});

const updateAnnotationInputJsonSchema = s.object(
  "Input for updating a PostHog annotation.",
  {
    ...annotationWriteFields,
    id: jsonIdField,
  },
  {
    optional: ["content", "date_marker", "creation_type", "dashboard_item", "dashboard_id", "deleted", "scope"],
  },
);

const deleteAnnotationOutputJsonSchema = s.object("Result returned after marking a PostHog annotation as deleted.", {
  deleted: s.boolean("Whether the annotation was marked as deleted."),
  id: s.string("Deleted annotation identifier."),
  annotation: annotationSchema,
  raw: jsonRawObject,
});

const refreshModeField = s.stringEnum("Refresh mode used by the PostHog API.", [
  "async",
  "async_except_on_cache_miss",
  "blocking",
  "force_async",
  "force_blocking",
  "force_cache",
  "lazy_async",
]);
const jsonRefreshModeField = s.nullable(refreshModeField);

const listInsightsInputSchema = s.object(
  "Input for listing PostHog insights.",
  {
    project_id: projectIdField,
    basic: s.boolean("Whether to return basic insight metadata without results."),
    limit: limitField,
    offset: offsetField,
    refresh: refreshModeField,
    short_id: s.string("Short insight identifier to filter by."),
  },
  { optional: ["basic", "limit", "offset", "refresh", "short_id"] },
);

const getInsightInputSchema = s.object(
  "Input for getting a PostHog insight.",
  {
    project_id: projectIdField,
    id: idField,
    from_dashboard: s.integer("Dashboard ID whose filters should override the insight context."),
    refresh: refreshModeField,
  },
  { optional: ["from_dashboard", "refresh"] },
);

const runQueryInputJsonSchema = s.object(
  "Input for running a PostHog query in a project.",
  {
    project_id: jsonProjectIdField,
    query: s.looseRequiredObject("Query object submitted to the PostHog query API.", {
      kind: s.string("Query kind accepted by the PostHog query API.", { minLength: 1 }),
    }),
    async: s.nullable(s.boolean("Whether PostHog should execute the query asynchronously.")),
    client_query_id: s.nullable(s.string("Client-provided query identifier.")),
    filters_override: s.nullable(jsonLooseObject),
    limit_context: s.nullable(s.string("Limit context forwarded to the query API.")),
    name: s.nullable(s.string("Descriptive query name for PostHog query logs.", { maxLength: 128 })),
    refresh: jsonRefreshModeField,
    variables_override: s.nullable(
      s.record("Variable overrides for the supplied query.", s.unknown("Variable value.")),
    ),
  },
  {
    optional: [
      "async",
      "client_query_id",
      "filters_override",
      "limit_context",
      "name",
      "refresh",
      "variables_override",
    ],
  },
);

const queryResultJsonSchema = s.looseObject("PostHog query result with a stable connector shape.", {
  results: s.array("Rows returned by the PostHog query.", s.unknown("Query result row.")),
  columns: s.array("Column names for the result.", s.string("Column name.")),
  types: s.array("Column type metadata returned by PostHog.", s.unknown("Column type metadata.")),
  hasMore: s.nullable(s.boolean("Whether the query has more result rows.")),
  limit: s.integer("Limit returned by PostHog for the query."),
  offset: s.integer("Offset returned by PostHog for the query."),
  query: s.nullable(jsonLooseObject),
  error: s.unknown("Query error payload returned by PostHog."),
  is_cached: s.nullable(s.boolean("Whether the query result came from cache.")),
  timings: s.array("Timing metrics collected while processing the query.", jsonLooseObject),
  query_status: s.nullable(jsonLooseObject),
  hogql: s.nullable(s.string("Generated HogQL query.")),
  cache_target_age: s.nullable(s.string("Target age timestamp for the cached query result.")),
  last_refresh: s.nullable(s.string("Datetime when the query result was last refreshed.")),
  next_allowed_client_refresh: s.nullable(s.string("Earliest datetime when the client can request a fresh result.")),
  resolved_date_range: s.nullable(jsonLooseObject),
  raw: jsonRawObject,
});

const asyncQueryStatusInputJsonSchema = s.object("Input for retrieving or cancelling a PostHog asynchronous query.", {
  project_id: jsonProjectIdField,
  query_id: s.string("Asynchronous query identifier returned by PostHog.", { minLength: 1 }),
});

const asyncQueryStatusOutputJsonSchema = s.looseObject(
  "PostHog asynchronous query status with a stable connector shape.",
  {
    id: s.string("Asynchronous query identifier."),
    query_status: jsonLooseObject,
    complete: s.boolean("Whether the asynchronous query has completed."),
    results: s.array("Rows returned by the query when available.", s.unknown("Query result row.")),
    error: s.unknown("Query error payload returned by PostHog."),
    raw: jsonRawObject,
  },
);

const cancelQueryOutputJsonSchema = s.object("Result returned after cancelling a PostHog asynchronous query.", {
  cancelled: s.boolean("Whether the cancel request was sent successfully."),
  query_id: s.string("Asynchronous query identifier."),
  raw: jsonRawObject,
});

const cohortWriteFields = {
  project_id: jsonProjectIdField,
  name: s.nullable(s.string("Cohort name.", { maxLength: 400 })),
  description: s.string("Description for the cohort.", { maxLength: 1000 }),
  groups: s.unknown("Group configuration defining cohort criteria."),
  deleted: s.boolean("Whether the cohort should be marked as deleted."),
  filters: s.nullable(jsonLooseObject),
  query: s.nullable(s.unknown("Query payload defining this cohort.")),
  is_static: s.boolean("Whether the cohort is static."),
  _create_in_folder: s.string("Folder identifier where PostHog should create the cohort."),
  _create_static_person_ids: s.array("Person UUIDs to seed when creating a static cohort.", s.string("Person UUID."), {
    minItems: 1,
  }),
};

const createCohortInputJsonSchema = s.object("Input for creating a PostHog cohort.", cohortWriteFields, {
  optional: [
    "description",
    "groups",
    "deleted",
    "filters",
    "query",
    "is_static",
    "_create_in_folder",
    "_create_static_person_ids",
  ],
});

const updateCohortInputJsonSchema = s.object(
  "Input for updating a PostHog cohort.",
  {
    ...cohortWriteFields,
    id: jsonIdField,
  },
  {
    optional: [
      "name",
      "description",
      "groups",
      "deleted",
      "filters",
      "query",
      "is_static",
      "_create_in_folder",
      "_create_static_person_ids",
    ],
  },
);

const deleteCohortInputJsonSchema = s.object("Input for deleting a PostHog cohort.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
});

const deleteCohortOutputJsonSchema = s.object("Result returned after marking a PostHog cohort as deleted.", {
  deleted: s.boolean("Whether the cohort was marked as deleted."),
  id: s.string("Deleted cohort identifier."),
  cohort: cohortSchema,
  raw: jsonRawObject,
});

const staticCohortPersonsInputJsonSchema = s.object("Input for adding persons to a static PostHog cohort.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
  person_ids: s.array("Person UUIDs to add to the static cohort.", s.string("Person UUID."), {
    minItems: 1,
  }),
});

const getCohortPersonsInputJsonSchema = s.object(
  "Input for listing persons in a PostHog cohort.",
  {
    project_id: jsonProjectIdField,
    id: jsonIdField,
    limit: limitField,
    offset: offsetField,
    format: s.stringEnum("Response format requested from PostHog.", ["json"]),
  },
  { optional: ["limit", "offset", "format"] },
);

const insightWriteFields = {
  project_id: jsonProjectIdField,
  name: s.nullable(s.string("Insight name.")),
  description: s.nullable(s.string("Insight description.")),
  query: s.nullable(jsonLooseObject),
  filters: s.nullable(jsonLooseObject),
  dashboards: s.array("Dashboard IDs referencing the insight.", jsonIdField),
  tags: s.array("Tags attached to the insight.", s.string("Insight tag.")),
  refresh: jsonRefreshModeField,
  saved: s.nullable(s.boolean("Whether the insight should be saved.")),
  favorited: s.nullable(s.boolean("Whether the insight should be favorited.")),
};
const createInsightInputJsonSchema = s.object("Input for creating a PostHog insight.", insightWriteFields, {
  optional: ["name", "description", "query", "filters", "dashboards", "tags", "refresh", "saved", "favorited"],
});
const updateInsightInputJsonSchema = s.object(
  "Input for updating a PostHog insight.",
  {
    ...insightWriteFields,
    id: jsonIdField,
  },
  {
    optional: ["name", "description", "query", "filters", "dashboards", "tags", "refresh", "saved", "favorited"],
  },
);
const deleteInsightInputJsonSchema = s.object("Input for deleting a PostHog insight.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
});
const insightJsonSchema = s.looseObject("PostHog insight with a stable connector shape.", {
  id: s.integer("Numeric insight identifier."),
  short_id: s.string("Short insight identifier."),
  name: s.nullable(s.string("Insight name.")),
  query: s.nullable(jsonLooseObject),
  raw: jsonRawObject,
});
const deleteInsightOutputJsonSchema = s.object("Result returned after deleting a PostHog insight.", {
  deleted: s.boolean("Whether the insight was deleted."),
  id: s.string("Deleted insight identifier."),
  raw: jsonRawObject,
});

const listDashboardsInputJsonSchema = s.object(
  "Input for listing PostHog dashboards.",
  {
    project_id: jsonProjectIdField,
    limit: limitField,
    offset: offsetField,
    search: s.string("Search term used to match dashboard names and descriptions.", {
      maxLength: 200,
    }),
  },
  { optional: ["limit", "offset", "search"] },
);

const getDashboardInputJsonSchema = s.object(
  "Input for getting a PostHog dashboard.",
  {
    project_id: jsonProjectIdField,
    id: jsonIdField,
    filters_override: s.nullable(jsonLooseObject),
    variables_override: s.nullable(s.record("Dashboard variable overrides keyed by variable ID.", jsonLooseObject)),
  },
  { optional: ["filters_override", "variables_override"] },
);

const dashboardWriteFields = {
  project_id: jsonProjectIdField,
  name: s.nullable(s.string("Dashboard name.", { maxLength: 400 })),
  description: s.string("Dashboard description."),
  pinned: s.boolean("Whether the dashboard should be pinned to the top of the list."),
  deleted: s.boolean("Whether the dashboard should be marked as deleted."),
  breakdown_colors: s.unknown("Custom color mapping for breakdown values."),
  data_color_theme_id: s.nullable(s.integer("Color theme ID used for chart visualizations.")),
  tags: s.array("Tags attached to the dashboard.", s.string("Dashboard tag.")),
  restriction_level: s.integer("Dashboard restriction level."),
  quick_filter_ids: s.nullable(
    s.array("Quick filter IDs associated with this dashboard.", s.string("Quick filter ID.")),
  ),
  use_template: s.string("Template key to create the dashboard from a predefined template."),
  use_dashboard: s.nullable(s.integer("ID of an existing dashboard to duplicate.")),
  delete_insights: s.boolean("Whether PostHog should also delete insights that are only on this dashboard."),
  _create_in_folder: s.string("Folder identifier where PostHog should create the dashboard."),
};

const createDashboardInputJsonSchema = s.object("Input for creating a PostHog dashboard.", dashboardWriteFields, {
  optional: [
    "name",
    "description",
    "pinned",
    "deleted",
    "breakdown_colors",
    "data_color_theme_id",
    "tags",
    "restriction_level",
    "quick_filter_ids",
    "use_template",
    "use_dashboard",
    "delete_insights",
    "_create_in_folder",
  ],
});

const updateDashboardInputJsonSchema = s.object(
  "Input for updating a PostHog dashboard.",
  {
    ...dashboardWriteFields,
    id: jsonIdField,
  },
  {
    optional: [
      "name",
      "description",
      "pinned",
      "deleted",
      "breakdown_colors",
      "data_color_theme_id",
      "tags",
      "restriction_level",
      "quick_filter_ids",
      "use_template",
      "use_dashboard",
      "delete_insights",
      "_create_in_folder",
    ],
  },
);

const deleteDashboardInputJsonSchema = s.object("Input for deleting a PostHog dashboard.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
  delete_insights: s.boolean("Whether PostHog should also delete insights that are only on this dashboard."),
});

const deleteDashboardOutputJsonSchema = s.object("Result returned after marking a PostHog dashboard as deleted.", {
  deleted: s.boolean("Whether the dashboard was marked as deleted."),
  id: s.string("Deleted dashboard identifier."),
  dashboard: dashboardSchema,
  raw: jsonRawObject,
});

const runDashboardInsightsInputJsonSchema = s.object(
  "Input for running all insights on a PostHog dashboard.",
  {
    project_id: jsonProjectIdField,
    id: jsonIdField,
    filters_override: s.nullable(jsonLooseObject),
    variables_override: s.nullable(s.record("Dashboard variable overrides keyed by variable ID.", jsonLooseObject)),
    output_format: s.stringEnum("Output format returned by PostHog.", ["json", "optimized"]),
    refresh: s.stringEnum("Cache behavior for dashboard insight execution.", [
      "blocking",
      "force_blocking",
      "force_cache",
    ]),
  },
  { optional: ["filters_override", "variables_override", "output_format", "refresh"] },
);

const runDashboardInsightsOutputJsonSchema = s.object(
  "Results returned after running all insights on a PostHog dashboard.",
  {
    results: looseArray("Dashboard tile results returned by PostHog."),
    raw: jsonRawObject,
  },
);

const copyDashboardTileInputJsonSchema = s.object("Input for copying a PostHog dashboard tile to another dashboard.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
  fromDashboardId: s.integer("Dashboard ID the tile currently belongs to."),
  tileId: s.integer("Dashboard tile ID to copy."),
});

const moveDashboardTileInputJsonSchema = s.object("Input for moving a PostHog dashboard tile.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
  tile: s.object("Dashboard tile to move.", {
    id: s.integer("Dashboard tile ID to move."),
  }),
  toDashboard: s.integer("Dashboard ID to move the tile to."),
});

const reorderDashboardTilesInputJsonSchema = s.object("Input for reordering PostHog dashboard tiles.", {
  project_id: jsonProjectIdField,
  id: jsonIdField,
  tile_order: s.array("Dashboard tile IDs in the desired display order.", s.integer("Dashboard tile ID."), {
    minItems: 1,
  }),
});

const dashboardCollaboratorSchema = s.looseRequiredObject(
  "PostHog dashboard collaborator.",
  {
    id: s.string("Dashboard collaborator UUID."),
    dashboard_id: s.integer("Dashboard identifier."),
    user: userBasicSchema,
    level: s.integer("Restriction level granted to the collaborator."),
    added_at: s.string("Datetime when the collaborator was added."),
    updated_at: s.string("Datetime when the collaborator was updated."),
    raw: jsonRawObject,
  },
  { optional: ["id", "dashboard_id", "user", "level", "added_at", "updated_at"] },
);

const listDashboardCollaboratorsInputJsonSchema = s.object("Input for listing PostHog dashboard collaborators.", {
  project_id: jsonProjectIdField,
  dashboard_id: idField,
});

const addDashboardCollaboratorInputJsonSchema = s.object("Input for adding a PostHog dashboard collaborator.", {
  project_id: jsonProjectIdField,
  dashboard_id: idField,
  user_uuid: s.string("User UUID to add as a collaborator.", { minLength: 1 }),
  level: s.integer("Restriction level to grant to the collaborator."),
});

const removeDashboardCollaboratorInputJsonSchema = s.object("Input for removing a PostHog dashboard collaborator.", {
  project_id: jsonProjectIdField,
  dashboard_id: idField,
  user_uuid: s.string("User UUID to remove from the dashboard collaborators.", { minLength: 1 }),
});

const removeDashboardCollaboratorOutputJsonSchema = s.object(
  "Result returned after removing a PostHog dashboard collaborator.",
  {
    deleted: s.boolean("Whether the collaborator was removed."),
    dashboard_id: s.string("Dashboard identifier."),
    user_uuid: s.string("Removed user UUID."),
    raw: jsonRawObject,
  },
);

const featureFlagListInputJsonSchema = s.object(
  "Input for listing PostHog feature flags.",
  {
    project_id: projectIdField,
    active: s.stringEnum("Filter feature flags by active state.", ["STALE", "false", "true"]),
    created_by_id: s.string("User ID that initially created the feature flag."),
    evaluation_runtime: s.stringEnum("Filter feature flags by evaluation runtime.", ["both", "client", "server"]),
    excluded_properties: s.string("JSON-encoded list of feature flag keys to exclude."),
    has_evaluation_contexts: s.stringEnum("Filter feature flags by whether they have evaluation contexts.", [
      "false",
      "true",
    ]),
    limit: limitField,
    offset: offsetField,
    search: s.string("Search term used to match feature flag keys or names."),
    tags: s.string("JSON-encoded list of feature flag tags to filter by."),
    type: s.stringEnum("Filter feature flags by type.", ["boolean", "experiment", "multivariant", "remote_config"]),
  },
  {
    optional: [
      "active",
      "created_by_id",
      "evaluation_runtime",
      "excluded_properties",
      "has_evaluation_contexts",
      "limit",
      "offset",
      "search",
      "tags",
      "type",
    ],
  },
);

const featureFlagFiltersSchema = s.looseObject("Feature flag filters returned by PostHog.");

const featureFlagUserSchema = userBasicSchema;

const featureFlagSchema = s.looseRequiredObject(
  "PostHog feature flag with a stable top-level connector shape.",
  {
    id: s.integer("Feature flag identifier."),
    key: s.string("Feature flag key."),
    name: s.string("Feature flag description."),
    active: s.boolean("Whether the feature flag is active."),
    deleted: s.boolean("Whether the feature flag is marked as deleted."),
    filters: featureFlagFiltersSchema,
    tags: looseArray("Tags attached to the feature flag."),
    raw: jsonRawObject,
    created_at: nullableString("Feature flag creation datetime."),
    updated_at: nullableString("Feature flag update datetime."),
    created_by: s.nullable(featureFlagUserSchema),
    last_modified_by: s.nullable(featureFlagUserSchema),
    version: nullableNumber("Feature flag version."),
    ensure_experience_continuity: nullableBoolean("Whether experience continuity is enabled for the feature flag."),
    experiment_set: s.array("Associated experiment IDs.", s.integer("Experiment ID.")),
    experiment_set_metadata: s.array("Associated experiment metadata objects.", jsonLooseObject),
    surveys: s.nullable(s.looseObject("Survey metadata attached to the feature flag.")),
    features: s.nullable(s.looseObject("Early access feature metadata attached to the flag.")),
    rollback_conditions: s.nullable(s.unknown("Rollback conditions for the feature flag.")),
    performed_rollback: nullableBoolean("Whether a rollback has been performed."),
    can_edit: nullableBoolean("Whether the current user can edit the feature flag."),
    status: nullableString("Computed feature flag status."),
    evaluation_runtime: nullableString("Where the feature flag is evaluated."),
    bucketing_identifier: nullableString("Identifier used for bucketing users."),
    last_called_at: nullableString("Last time the feature flag was evaluated."),
    user_access_level: nullableString("Effective access level for the current user."),
    rollout_percentage: nullableNumber("Feature flag rollout percentage, when present."),
    evaluation_contexts: s.array("Evaluation contexts attached to the feature flag.", s.string("Evaluation context.")),
    usage_dashboard: nullableNumber("Usage dashboard identifier."),
    analytics_dashboards: s.array(
      "Analytics dashboard identifiers attached to the feature flag.",
      s.integer("Dashboard identifier."),
    ),
    has_enriched_analytics: nullableBoolean("Whether analytics have been enriched."),
    is_remote_configuration: nullableBoolean("Whether the flag is a remote configuration."),
    has_encrypted_payloads: nullableBoolean("Whether the flag has encrypted payloads."),
    is_used_in_replay_settings: nullableBoolean("Whether the flag is used in replay settings."),
  },
  {
    optional: [
      "created_at",
      "updated_at",
      "created_by",
      "last_modified_by",
      "version",
      "ensure_experience_continuity",
      "experiment_set",
      "experiment_set_metadata",
      "surveys",
      "features",
      "rollback_conditions",
      "performed_rollback",
      "can_edit",
      "status",
      "evaluation_runtime",
      "bucketing_identifier",
      "last_called_at",
      "user_access_level",
      "rollout_percentage",
      "evaluation_contexts",
      "usage_dashboard",
      "analytics_dashboards",
      "has_enriched_analytics",
      "is_remote_configuration",
      "has_encrypted_payloads",
      "is_used_in_replay_settings",
    ],
  },
);

const paginatedFeatureFlagsSchema = s.object("Paginated PostHog feature flag list.", {
  count: paginationCountField,
  next: paginationNextField,
  previous: paginationPreviousField,
  results: s.array("Feature flags returned by PostHog.", featureFlagSchema),
  raw: jsonRawObject,
});

const createFeatureFlagInputJsonSchema = s.object(
  "Input for creating a PostHog feature flag.",
  {
    project_id: projectIdField,
    key: s.string("Feature flag key."),
    name: s.string("Feature flag description."),
    filters: s.nullable(featureFlagFiltersSchema),
    active: s.boolean("Whether the feature flag is active."),
    tags: s.array("Tags attached to the feature flag.", s.string("Feature flag tag.")),
    evaluation_contexts: s.array("Evaluation contexts attached to the feature flag.", s.string("Evaluation context.")),
  },
  { optional: ["filters", "active", "tags", "evaluation_contexts"] },
);

const updateFeatureFlagInputJsonSchema = s.object(
  "Input for updating a PostHog feature flag.",
  {
    project_id: projectIdField,
    id: idField,
    key: s.string("Feature flag key."),
    name: s.string("Feature flag description."),
    filters: s.nullable(featureFlagFiltersSchema),
    active: s.boolean("Whether the feature flag is active."),
    tags: s.array("Tags attached to the feature flag.", s.string("Feature flag tag.")),
    evaluation_contexts: s.array("Evaluation contexts attached to the feature flag.", s.string("Evaluation context.")),
  },
  { optional: ["key", "name", "filters", "active", "tags", "evaluation_contexts"] },
);

const deleteFeatureFlagInputJsonSchema = s.object("Input for deleting a PostHog feature flag.", {
  project_id: projectIdField,
  id: idField,
});

const deleteFeatureFlagOutputJsonSchema = s.object("Result returned after soft deleting a PostHog feature flag.", {
  deleted: s.boolean("Whether the feature flag was marked as deleted."),
  id: s.string("Deleted feature flag identifier."),
  feature_flag: featureFlagSchema,
  raw: jsonRawObject,
});

const featureFlagStatusSchema = s.looseRequiredObject(
  "PostHog feature flag status response.",
  {
    status: s.string("Computed feature flag status."),
    reason: s.string("Human-readable explanation of the feature flag status."),
    raw: jsonRawObject,
    active: nullableBoolean("Whether the feature flag is active."),
    deleted: nullableBoolean("Whether the feature flag is deleted."),
    last_called_at: nullableString("Last time the feature flag was evaluated."),
    status_code: nullableNumber("HTTP status code returned by the status endpoint."),
  },
  {
    optional: ["active", "deleted", "last_called_at", "status_code"],
  },
);

const dependentFlagSchema = s.looseRequiredObject("PostHog dependent feature flag summary.", {
  id: s.integer("Feature flag identifier."),
  key: s.string("Feature flag key."),
  name: s.string("Feature flag name."),
});

const dependentFlagsSchema = s.object("Dependent feature flags returned by PostHog.", {
  results: s.array("Dependent feature flags returned by PostHog.", dependentFlagSchema),
  raw: jsonRawObject,
});

const minimalFeatureFlagSchema = s.looseRequiredObject(
  "Minimal PostHog feature flag used by local evaluation.",
  {
    id: s.integer("Feature flag identifier."),
    team_id: s.integer("Owning team identifier."),
    name: s.string("Feature flag description."),
    key: s.string("Feature flag key."),
    filters: featureFlagFiltersSchema,
    deleted: s.boolean("Whether the feature flag is marked as deleted."),
    active: s.boolean("Whether the feature flag is active."),
    evaluation_contexts: s.array("Evaluation contexts attached to the feature flag.", s.string("Evaluation context.")),
    raw: jsonRawObject,
    ensure_experience_continuity: nullableBoolean("Whether experience continuity is enabled for the feature flag."),
    version: nullableNumber("Feature flag version."),
    evaluation_runtime: nullableString("Where the feature flag is evaluated."),
    bucketing_identifier: nullableString("Identifier used for bucketing users."),
  },
  {
    optional: ["ensure_experience_continuity", "version", "evaluation_runtime", "bucketing_identifier"],
  },
);

const localEvaluationSchema = s.object("PostHog feature flag local evaluation response.", {
  flags: s.array("Feature flags returned by the local evaluation endpoint.", minimalFeatureFlagSchema),
  group_type_mapping: s.record("Group type mappings returned by PostHog.", s.string("Group type mapping value.")),
  cohorts: s.looseObject("Cohorts returned by PostHog for local evaluation."),
  raw: jsonRawObject,
});

export const posthogActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the current user associated with the PostHog personal API key.",
    requiredScopes: [],
    providerPermissions: ["user:read"],
    followUpActions: ["posthog.list_projects"],
    inputSchema: s.object("No input is required for the current PostHog user lookup.", {}),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List PostHog projects for the current or specified organization.",
    requiredScopes: [],
    providerPermissions: ["organization:read", "project:read"],
    inputSchema: s.object(
      "Input for listing PostHog projects.",
      {
        organization_id: organizationIdField,
        limit: limitField,
        offset: offsetField,
        search: s.string("A search term used to filter projects."),
      },
      { optional: ["organization_id", "limit", "offset", "search"] },
    ),
    outputSchema: paginatedProjectsSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get a PostHog project from the current or specified organization.",
    requiredScopes: [],
    providerPermissions: ["organization:read", "project:read"],
    inputSchema: s.object(
      "Input for getting a PostHog project.",
      {
        organization_id: organizationIdField,
        id: idField,
      },
      { optional: ["organization_id"] },
    ),
    outputSchema: projectSchema,
  }),
  defineProviderAction(service, {
    name: "list_event_definitions",
    operationType: "read",
    description: "List event definitions for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["event_definition:read"],
    inputSchema: s.object(
      "Input for listing PostHog event definitions.",
      {
        project_id: projectIdField,
        limit: limitField,
        offset: offsetField,
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: paginatedEventDefinitionsSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_definition",
    operationType: "read",
    description: "Get a PostHog event definition by ID.",
    requiredScopes: [],
    providerPermissions: ["event_definition:read"],
    inputSchema: eventDefinitionIdInputJsonSchema,
    outputSchema: eventDefinitionSchema,
  }),
  defineProviderAction(service, {
    name: "create_event_definition",
    operationType: "write",
    description: "Create an event definition for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["event_definition:write"],
    inputSchema: createEventDefinitionInputJsonSchema,
    outputSchema: eventDefinitionSchema,
  }),
  defineProviderAction(service, {
    name: "update_event_definition",
    operationType: "write",
    description: "Partially update a PostHog event definition by ID.",
    requiredScopes: [],
    providerPermissions: ["event_definition:write"],
    inputSchema: updateEventDefinitionInputJsonSchema,
    outputSchema: eventDefinitionSchema,
  }),
  defineProviderAction(service, {
    name: "delete_event_definition",
    operationType: "destructive",
    description: "Delete a PostHog event definition by ID.",
    requiredScopes: [],
    providerPermissions: ["event_definition:write"],
    inputSchema: eventDefinitionIdInputJsonSchema,
    outputSchema: deleteDefinitionOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_definition_by_name",
    operationType: "read",
    description: "Get a PostHog event definition by exact event name.",
    requiredScopes: [],
    providerPermissions: ["event_definition:read"],
    inputSchema: eventDefinitionByNameInputJsonSchema,
    outputSchema: eventDefinitionSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_definition_primary_properties",
    operationType: "read",
    description: "Get primary properties configured for PostHog event definitions.",
    requiredScopes: [],
    providerPermissions: ["event_definition:read"],
    inputSchema: eventDefinitionPrimaryPropertiesInputJsonSchema,
    outputSchema: primaryPropertiesOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "bulk_update_event_definition_tags",
    operationType: "destructive",
    description: "Bulk add, remove, or set tags on PostHog event definitions.",
    requiredScopes: [],
    providerPermissions: ["event_definition:write"],
    inputSchema: bulkUpdateTagsInputJsonSchema,
    outputSchema: bulkUpdateTagsOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "list_property_definitions",
    operationType: "read",
    description: "List property definitions for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["property_definition:read"],
    inputSchema: listPropertyDefinitionsInputSchema,
    outputSchema: paginatedPropertyDefinitionsSchema,
  }),
  defineProviderAction(service, {
    name: "get_property_definition",
    operationType: "read",
    description: "Get a PostHog property definition by ID.",
    requiredScopes: [],
    providerPermissions: ["property_definition:read"],
    inputSchema: propertyDefinitionIdInputJsonSchema,
    outputSchema: propertyDefinitionSchema,
  }),
  defineProviderAction(service, {
    name: "update_property_definition",
    operationType: "write",
    description: "Partially update a PostHog property definition by ID.",
    requiredScopes: [],
    providerPermissions: ["property_definition:write"],
    inputSchema: updatePropertyDefinitionInputJsonSchema,
    outputSchema: propertyDefinitionSchema,
  }),
  defineProviderAction(service, {
    name: "delete_property_definition",
    operationType: "destructive",
    description: "Delete a PostHog property definition by ID.",
    requiredScopes: [],
    providerPermissions: ["property_definition:write"],
    inputSchema: propertyDefinitionIdInputJsonSchema,
    outputSchema: deleteDefinitionOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "bulk_update_property_definition_tags",
    operationType: "destructive",
    description: "Bulk add, remove, or set tags on PostHog property definitions.",
    requiredScopes: [],
    providerPermissions: ["property_definition:write"],
    inputSchema: bulkUpdateTagsInputJsonSchema,
    outputSchema: bulkUpdateTagsOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "list_annotations",
    operationType: "read",
    description: "List annotations for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["annotation:read"],
    inputSchema: listAnnotationsInputJsonSchema,
    outputSchema: paginatedAnnotationsSchema,
  }),
  defineProviderAction(service, {
    name: "get_annotation",
    operationType: "read",
    description: "Get a PostHog annotation by ID.",
    requiredScopes: [],
    providerPermissions: ["annotation:read"],
    inputSchema: annotationIdInputJsonSchema,
    outputSchema: annotationSchema,
  }),
  defineProviderAction(service, {
    name: "create_annotation",
    operationType: "write",
    description: "Create an annotation in a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["annotation:write"],
    inputSchema: createAnnotationInputJsonSchema,
    outputSchema: annotationSchema,
  }),
  defineProviderAction(service, {
    name: "update_annotation",
    operationType: "write",
    description: "Partially update a PostHog annotation by ID.",
    requiredScopes: [],
    providerPermissions: ["annotation:write"],
    inputSchema: updateAnnotationInputJsonSchema,
    outputSchema: annotationSchema,
  }),
  defineProviderAction(service, {
    name: "delete_annotation",
    operationType: "destructive",
    description: "Mark a PostHog annotation as deleted using the official soft-delete contract.",
    requiredScopes: [],
    providerPermissions: ["annotation:write"],
    inputSchema: annotationIdInputJsonSchema,
    outputSchema: deleteAnnotationOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "list_cohorts",
    operationType: "read",
    description: "List cohorts for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["cohort:read"],
    inputSchema: s.object(
      "Input for listing PostHog cohorts.",
      {
        project_id: projectIdField,
        limit: limitField,
        offset: offsetField,
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: paginatedCohortsSchema,
  }),
  defineProviderAction(service, {
    name: "get_cohort",
    operationType: "read",
    description: "Get a PostHog cohort by ID.",
    requiredScopes: [],
    providerPermissions: ["cohort:read"],
    inputSchema: s.object("Input for getting a PostHog cohort.", {
      project_id: projectIdField,
      id: idField,
    }),
    outputSchema: cohortSchema,
  }),
  defineProviderAction(service, {
    name: "create_cohort",
    operationType: "write",
    description: "Create a cohort in a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["cohort:write"],
    inputSchema: createCohortInputJsonSchema,
    outputSchema: cohortSchema,
  }),
  defineProviderAction(service, {
    name: "update_cohort",
    operationType: "write",
    description: "Partially update a PostHog cohort by ID.",
    requiredScopes: [],
    providerPermissions: ["cohort:write"],
    inputSchema: updateCohortInputJsonSchema,
    outputSchema: cohortSchema,
  }),
  defineProviderAction(service, {
    name: "delete_cohort",
    operationType: "destructive",
    description: "Mark a PostHog cohort as deleted using the official soft-delete contract.",
    requiredScopes: [],
    providerPermissions: ["cohort:write"],
    inputSchema: deleteCohortInputJsonSchema,
    outputSchema: deleteCohortOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "add_persons_to_static_cohort",
    operationType: "write",
    description: "Add person UUIDs to a static PostHog cohort.",
    requiredScopes: [],
    providerPermissions: ["cohort:write"],
    inputSchema: staticCohortPersonsInputJsonSchema,
    outputSchema: cohortGenericPayloadSchema,
  }),
  defineProviderAction(service, {
    name: "get_cohort_persons",
    operationType: "read",
    description: "List persons that belong to a PostHog cohort.",
    requiredScopes: [],
    providerPermissions: ["cohort:read", "person:read"],
    inputSchema: getCohortPersonsInputJsonSchema,
    outputSchema: cohortPersonsSchema,
  }),
  defineProviderAction(service, {
    name: "get_cohort_calculation_history",
    operationType: "read",
    description: "Get the raw calculation history payload for a PostHog cohort.",
    requiredScopes: [],
    providerPermissions: ["cohort:read"],
    inputSchema: s.object("Input for getting PostHog cohort calculation history.", {
      project_id: projectIdField,
      id: idField,
    }),
    outputSchema: cohortGenericPayloadSchema,
  }),
  defineProviderAction(service, {
    name: "list_insights",
    operationType: "read",
    description: "List insights for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["insight:read"],
    inputSchema: listInsightsInputSchema,
    outputSchema: paginatedInsightsSchema,
  }),
  defineProviderAction(service, {
    name: "get_insight",
    operationType: "read",
    description: "Get a PostHog insight by ID with a stable top-level connector shape.",
    requiredScopes: [],
    providerPermissions: ["insight:read"],
    inputSchema: getInsightInputSchema,
    outputSchema: insightSchema,
  }),
  defineProviderAction(service, {
    name: "run_query",
    operationType: "read",
    description: "Run a PostHog query and return a stable top-level query result shape.",
    requiredScopes: [],
    providerPermissions: ["query:read"],
    inputSchema: runQueryInputJsonSchema,
    outputSchema: queryResultJsonSchema,
  }),
  defineProviderAction(service, {
    name: "get_async_query_status",
    operationType: "read",
    description: "Retrieve the status and available result payload for a PostHog async query.",
    requiredScopes: [],
    providerPermissions: ["query:read"],
    inputSchema: asyncQueryStatusInputJsonSchema,
    outputSchema: asyncQueryStatusOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_query",
    operationType: "destructive",
    description: "Cancel a PostHog async query by project ID and query ID.",
    requiredScopes: [],
    providerPermissions: ["query:write"],
    inputSchema: asyncQueryStatusInputJsonSchema,
    outputSchema: cancelQueryOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "create_insight",
    operationType: "write",
    description: "Create a saved PostHog insight in a project.",
    requiredScopes: [],
    providerPermissions: ["insight:write"],
    inputSchema: createInsightInputJsonSchema,
    outputSchema: insightJsonSchema,
  }),
  defineProviderAction(service, {
    name: "update_insight",
    operationType: "write",
    description: "Update a saved PostHog insight by ID.",
    requiredScopes: [],
    providerPermissions: ["insight:write"],
    inputSchema: updateInsightInputJsonSchema,
    outputSchema: insightJsonSchema,
  }),
  defineProviderAction(service, {
    name: "delete_insight",
    operationType: "destructive",
    description: "Delete a saved PostHog insight by ID.",
    requiredScopes: [],
    providerPermissions: ["insight:write"],
    inputSchema: deleteInsightInputJsonSchema,
    outputSchema: deleteInsightOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "list_dashboards",
    operationType: "read",
    description: "List dashboards for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["dashboard:read"],
    inputSchema: listDashboardsInputJsonSchema,
    outputSchema: paginatedDashboardsSchema,
  }),
  defineProviderAction(service, {
    name: "get_dashboard",
    operationType: "read",
    description: "Get a PostHog dashboard by ID with a stable top-level connector shape.",
    requiredScopes: [],
    providerPermissions: ["dashboard:read"],
    inputSchema: getDashboardInputJsonSchema,
    outputSchema: dashboardSchema,
  }),
  defineProviderAction(service, {
    name: "create_dashboard",
    operationType: "write",
    description: "Create a PostHog dashboard in a project.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: createDashboardInputJsonSchema,
    outputSchema: dashboardSchema,
  }),
  defineProviderAction(service, {
    name: "update_dashboard",
    operationType: "write",
    description: "Partially update a PostHog dashboard by ID.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: updateDashboardInputJsonSchema,
    outputSchema: dashboardSchema,
  }),
  defineProviderAction(service, {
    name: "delete_dashboard",
    operationType: "destructive",
    description: "Mark a PostHog dashboard as deleted using the official soft-delete contract.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: deleteDashboardInputJsonSchema,
    outputSchema: deleteDashboardOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "run_dashboard_insights",
    operationType: "write",
    description: "Run all insights on a PostHog dashboard and return their results.",
    requiredScopes: [],
    providerPermissions: ["query:read"],
    inputSchema: runDashboardInsightsInputJsonSchema,
    outputSchema: runDashboardInsightsOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "copy_dashboard_tile",
    operationType: "write",
    description: "Copy an existing PostHog dashboard tile to another dashboard.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: copyDashboardTileInputJsonSchema,
    outputSchema: dashboardSchema,
  }),
  defineProviderAction(service, {
    name: "move_dashboard_tile",
    operationType: "write",
    description: "Move a PostHog dashboard tile to another dashboard.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: moveDashboardTileInputJsonSchema,
    outputSchema: cohortGenericPayloadSchema,
  }),
  defineProviderAction(service, {
    name: "reorder_dashboard_tiles",
    operationType: "write",
    description: "Reorder tiles on a PostHog dashboard.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: reorderDashboardTilesInputJsonSchema,
    outputSchema: dashboardSchema,
  }),
  defineProviderAction(service, {
    name: "list_dashboard_collaborators",
    operationType: "read",
    description: "List collaborators for a PostHog dashboard.",
    requiredScopes: [],
    providerPermissions: ["dashboard:read"],
    inputSchema: listDashboardCollaboratorsInputJsonSchema,
    outputSchema: s.object("PostHog dashboard collaborators.", {
      results: s.array("Dashboard collaborators returned by PostHog.", dashboardCollaboratorSchema),
      raw: s.unknown("Full raw collaborators payload returned by PostHog."),
    }),
  }),
  defineProviderAction(service, {
    name: "add_dashboard_collaborator",
    operationType: "write",
    description: "Add a collaborator to a PostHog dashboard.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: addDashboardCollaboratorInputJsonSchema,
    outputSchema: dashboardCollaboratorSchema,
  }),
  defineProviderAction(service, {
    name: "remove_dashboard_collaborator",
    operationType: "destructive",
    description: "Remove a collaborator from a PostHog dashboard.",
    requiredScopes: [],
    providerPermissions: ["dashboard:write"],
    inputSchema: removeDashboardCollaboratorInputJsonSchema,
    outputSchema: removeDashboardCollaboratorOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "list_feature_flags",
    operationType: "read",
    description: "List feature flags for a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:read"],
    inputSchema: featureFlagListInputJsonSchema,
    outputSchema: paginatedFeatureFlagsSchema,
  }),
  defineProviderAction(service, {
    name: "get_feature_flag",
    operationType: "read",
    description: "Get a PostHog feature flag by ID.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:read"],
    inputSchema: s.object("Input for getting a PostHog feature flag.", {
      project_id: projectIdField,
      id: idField,
    }),
    outputSchema: featureFlagSchema,
  }),
  defineProviderAction(service, {
    name: "create_feature_flag",
    operationType: "write",
    description: "Create a feature flag in a PostHog project.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:write"],
    inputSchema: createFeatureFlagInputJsonSchema,
    outputSchema: featureFlagSchema,
  }),
  defineProviderAction(service, {
    name: "update_feature_flag",
    operationType: "write",
    description: "Partially update a PostHog feature flag by ID.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:write"],
    inputSchema: updateFeatureFlagInputJsonSchema,
    outputSchema: featureFlagSchema,
  }),
  defineProviderAction(service, {
    name: "delete_feature_flag",
    operationType: "destructive",
    description: "Soft delete a PostHog feature flag by setting deleted to true.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:write"],
    inputSchema: deleteFeatureFlagInputJsonSchema,
    outputSchema: deleteFeatureFlagOutputJsonSchema,
  }),
  defineProviderAction(service, {
    name: "get_feature_flag_status",
    operationType: "read",
    description: "Get the computed status for a PostHog feature flag.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:read"],
    inputSchema: deleteFeatureFlagInputJsonSchema,
    outputSchema: featureFlagStatusSchema,
  }),
  defineProviderAction(service, {
    name: "get_feature_flag_dependent_flags",
    operationType: "read",
    description: "List the feature flags that depend on a PostHog feature flag.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:read"],
    inputSchema: deleteFeatureFlagInputJsonSchema,
    outputSchema: dependentFlagsSchema,
  }),
  defineProviderAction(service, {
    name: "get_feature_flags_local_evaluation",
    operationType: "read",
    description: "Get the local evaluation payload for PostHog feature flags.",
    requiredScopes: [],
    providerPermissions: ["feature_flag:read"],
    inputSchema: s.object(
      "Input for getting the local evaluation payload for PostHog feature flags.",
      {
        project_id: projectIdField,
        send_cohorts: nullableBoolean("Whether to include cohorts in the response."),
      },
      { optional: ["send_cohorts"] },
    ),
    outputSchema: localEvaluationSchema,
  }),
];
