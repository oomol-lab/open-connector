import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "new_relic";

const looseObject = s.looseObject({}, { description: "A loose JSON object." });
const looseList = s.array(looseObject, { description: "A list of loose JSON objects." });
const stringOrNumber = s.union(
  [s.string({ description: "A string value." }), s.number({ description: "A numeric value." })],
  { description: "A string or numeric value returned by New Relic." },
);
const graphqlErrors = s.nullable(s.array(looseObject, { description: "New Relic GraphQL mutation errors." }));
const dashboardPages = s.array(looseObject, { minItems: 1, description: "Dashboard page definitions." });

export type NewRelicActionName =
  | "get_current_user"
  | "search_entities"
  | "execute_nrql_query"
  | "get_alert_policies"
  | "create_alert_policy"
  | "update_alert_policy"
  | "delete_alert_policy"
  | "list_nrql_conditions"
  | "create_nrql_condition"
  | "update_nrql_condition"
  | "delete_nrql_condition"
  | "get_dashboard_entity"
  | "create_dashboard"
  | "update_dashboard"
  | "delete_dashboard"
  | "create_dashboard_snapshot_url"
  | "list_monitors"
  | "get_synth_monitor"
  | "create_synthetics_simple_monitor"
  | "update_synthetics_simple_monitor"
  | "delete_synthetics_monitor"
  | "list_secure_credentials"
  | "get_secure_credential"
  | "create_secure_credential"
  | "update_secure_credential"
  | "delete_secure_credential"
  | "create_deployment_marker"
  | "list_deployments";

export const newRelicActions: ActionDefinition[] = [
  action(
    "get_current_user",
    "read",
    "Validate the connected New Relic user key and return the current user profile from NerdGraph.",
    {},
    [],
    {
      user: looseObject,
    },
  ),
  action(
    "search_entities",
    "read",
    "Search New Relic entities with either the raw entity search language or a structured query builder.",
    {
      query: s.string({ description: "The raw entity search query." }),
      cursor: s.string({ description: "The entity search cursor for the next page." }),
      queryBuilder: looseObject,
    },
    [],
    {
      query: s.string({ description: "The effective search query sent to NerdGraph." }),
      nextCursor: s.nullable(s.string({ description: "The cursor for the next search page, when available." })),
      entities: looseList,
    },
  ),
  action(
    "execute_nrql_query",
    "read",
    "Execute an NRQL query against a specific New Relic account and return the query results and metadata.",
    {
      accountId: s.positiveInteger("The account ID to query."),
      query: s.nonEmptyString("The NRQL query string."),
      timeout: s.integer({ minimum: 1, maximum: 600, description: "The query timeout in seconds." }),
      asyncExecution: s.boolean({ description: "Whether to request asynchronous execution." }),
    },
    ["accountId", "query"],
    {
      results: looseList,
      metadata: looseObject,
      otherResult: looseObject,
      totalResult: looseObject,
      queryProgress: looseObject,
    },
  ),
  action(
    "get_alert_policies",
    "read",
    "List New Relic alert policies with optional name, incident preference, and pagination filters using the REST alerts API.",
    {
      name: s.string({ description: "The optional partial policy name filter." }),
      page: s.positiveInteger("The 1-based result page to fetch."),
      incidentPreference: s.stringEnum(["PER_POLICY", "PER_CONDITION", "PER_CONDITION_AND_TARGET"], {
        description: "The incident preference filter.",
      }),
    },
    [],
    { policies: looseList },
  ),
  action(
    "create_alert_policy",
    "write",
    "Create a New Relic alert policy using the REST alerts API.",
    {
      name: s.nonEmptyString("The alert policy name."),
      incidentPreference: s.stringEnum(["PER_POLICY", "PER_CONDITION", "PER_CONDITION_AND_TARGET"], {
        description: "The incident preference for the new policy.",
      }),
    },
    ["name"],
    { policy: looseObject },
  ),
  action(
    "update_alert_policy",
    "write",
    "Update a New Relic alert policy name or incident preference using the REST alerts API.",
    {
      policyId: stringOrNumber,
      policy: looseObject,
    },
    ["policyId", "policy"],
    { policy: looseObject },
  ),
  action(
    "delete_alert_policy",
    "destructive",
    "Delete a New Relic alert policy using the REST alerts API.",
    {
      policyId: stringOrNumber,
    },
    ["policyId"],
    {
      deletedPolicyId: stringOrNumber,
      deleted: s.boolean({ description: "Whether the policy delete request succeeded." }),
    },
  ),
  action(
    "list_nrql_conditions",
    "read",
    "List NRQL alert conditions for a specific alert policy using the REST alerts API.",
    {
      policyId: s.positiveInteger("The alert policy ID."),
      page: s.positiveInteger("The 1-based result page to fetch."),
    },
    ["policyId"],
    {
      nrqlConditions: looseList,
    },
  ),
  action(
    "create_nrql_condition",
    "write",
    "Create a static or baseline NRQL alert condition for a policy using the REST alerts API.",
    {
      policyId: s.positiveInteger("The alert policy ID."),
      nrqlCondition: looseObject,
    },
    ["policyId", "nrqlCondition"],
    {
      nrqlCondition: looseObject,
    },
  ),
  action(
    "update_nrql_condition",
    "write",
    "Update a static or baseline NRQL alert condition using the REST alerts API.",
    {
      conditionId: stringOrNumber,
      nrqlCondition: looseObject,
    },
    ["conditionId", "nrqlCondition"],
    {
      nrqlCondition: looseObject,
    },
  ),
  action(
    "delete_nrql_condition",
    "destructive",
    "Delete a New Relic NRQL alert condition using the REST alerts API.",
    {
      conditionId: stringOrNumber,
    },
    ["conditionId"],
    {
      deletedConditionId: stringOrNumber,
      deleted: s.boolean({ description: "Whether the NRQL condition delete request succeeded." }),
    },
  ),
  action(
    "get_dashboard_entity",
    "read",
    "Read a New Relic dashboard entity, including its pages and widgets, by GUID.",
    {
      guid: s.nonEmptyString("The dashboard entity GUID."),
    },
    ["guid"],
    { dashboard: looseObject },
  ),
  action(
    "create_dashboard",
    "write",
    "Create a New Relic dashboard with pages and widgets using NerdGraph.",
    {
      accountId: s.positiveInteger("The account ID that will own the dashboard."),
      name: s.nonEmptyString("The dashboard name."),
      description: s.string({ description: "The optional dashboard description." }),
      permissions: s.stringEnum(["PRIVATE", "PUBLIC_READ_ONLY", "PUBLIC_READ_WRITE"], {
        description: "The dashboard permission setting.",
      }),
      pages: dashboardPages,
    },
    ["accountId", "name", "permissions", "pages"],
    {
      dashboard: looseObject,
      errors: graphqlErrors,
    },
  ),
  action(
    "update_dashboard",
    "write",
    "Update a New Relic dashboard by GUID, replacing the dashboard configuration with the supplied pages and widgets.",
    {
      guid: s.nonEmptyString("The dashboard entity GUID."),
      name: s.nonEmptyString("The updated dashboard name."),
      description: s.string({ description: "The updated dashboard description." }),
      permissions: s.stringEnum(["PRIVATE", "PUBLIC_READ_ONLY", "PUBLIC_READ_WRITE"], {
        description: "The updated dashboard permission setting.",
      }),
      pages: dashboardPages,
    },
    ["guid", "name", "permissions", "pages"],
    {
      dashboard: looseObject,
      errors: graphqlErrors,
    },
  ),
  action(
    "delete_dashboard",
    "destructive",
    "Delete a New Relic dashboard by its entity GUID.",
    {
      guid: s.nonEmptyString("The dashboard entity GUID."),
    },
    ["guid"],
    {
      status: s.string({ description: "The dashboard deletion status." }),
      errors: graphqlErrors,
    },
  ),
  action(
    "create_dashboard_snapshot_url",
    "write",
    "Generate a snapshot URL for a New Relic dashboard page GUID.",
    {
      guid: s.nonEmptyString("The dashboard page GUID."),
    },
    ["guid"],
    {
      url: s.url("The generated dashboard snapshot URL."),
    },
  ),
  action(
    "list_monitors",
    "read",
    "List synthetic monitors by using NerdGraph entity search over the SYNTH MONITOR entity type.",
    {
      cursor: s.string({ description: "The entity search cursor for the next page." }),
      query: s.string({ description: "An optional raw entity search query to further narrow the monitor set." }),
    },
    [],
    {
      query: s.string({ description: "The effective entity search query." }),
      nextCursor: s.nullable(s.string({ description: "The cursor for the next monitor page, when available." })),
      monitors: looseList,
    },
  ),
  action(
    "get_synth_monitor",
    "read",
    "Get a synthetic monitor by its legacy monitor ID or entity GUID using NerdGraph entity search.",
    {
      monitorId: s.string({ description: "The legacy synthetic monitor ID." }),
      guid: s.string({ description: "The synthetic monitor entity GUID." }),
    },
    [],
    {
      monitor: s.nullable(looseObject),
    },
  ),
  action(
    "create_synthetics_simple_monitor",
    "write",
    "Create a New Relic ping monitor by using the syntheticsCreateSimpleMonitor mutation.",
    {
      accountId: s.positiveInteger("The account ID that will own the monitor."),
      name: s.nonEmptyString("The monitor display name."),
      uri: s.url("The URL or endpoint to monitor."),
      period: s.nonEmptyString("The monitor execution period."),
      status: s.nonEmptyString("The monitor status."),
      locations: looseObject,
      advancedOptions: looseObject,
      apdexTarget: s.number({ description: "The ping monitor Apdex target in seconds." }),
    },
    ["accountId", "name", "uri", "period", "status", "locations"],
    {
      errors: graphqlErrors,
      monitor: s.nullable(looseObject),
    },
  ),
  action(
    "update_synthetics_simple_monitor",
    "write",
    "Update a New Relic ping monitor by GUID using the syntheticsUpdateSimpleMonitor mutation.",
    {
      guid: s.nonEmptyString("The synthetic monitor GUID."),
      monitor: looseObject,
    },
    ["guid", "monitor"],
    {
      errors: graphqlErrors,
    },
  ),
  action(
    "delete_synthetics_monitor",
    "destructive",
    "Delete a synthetic monitor by GUID using the syntheticsDeleteMonitor mutation.",
    {
      guid: s.nonEmptyString("The synthetic monitor GUID."),
    },
    ["guid"],
    {
      deletedGuid: s.string({ description: "The GUID of the deleted synthetic monitor." }),
    },
  ),
  action(
    "list_secure_credentials",
    "read",
    "List synthetic secure credentials by using NerdGraph entity search over the SYNTH SECURE_CRED entity type.",
    {
      cursor: s.string({ description: "The entity search cursor for the next page." }),
      query: s.string({ description: "An optional raw entity search query to further narrow the credential set." }),
    },
    [],
    {
      query: s.string({ description: "The effective entity search query." }),
      nextCursor: s.nullable(s.string({ description: "The cursor for the next credentials page, when available." })),
      credentials: looseList,
    },
  ),
  action(
    "get_secure_credential",
    "read",
    "Get a synthetic secure credential by key using NerdGraph entity search metadata only.",
    {
      key: s.nonEmptyString("The secure credential key."),
    },
    ["key"],
    {
      credential: s.nullable(looseObject),
    },
  ),
  action(
    "create_secure_credential",
    "write",
    "Create a New Relic synthetic secure credential using NerdGraph.",
    {
      accountId: s.positiveInteger("The account ID that will own the secure credential."),
      key: s.string({ minLength: 1, maxLength: 64, description: "The secure credential key." }),
      value: s.string({ minLength: 1, maxLength: 10000, description: "The secure credential value." }),
      description: s.string({ description: "The optional secure credential description." }),
    },
    ["accountId", "key", "value"],
    {
      key: s.string({ description: "The secure credential key." }),
      errors: graphqlErrors,
    },
  ),
  action(
    "update_secure_credential",
    "write",
    "Update a New Relic synthetic secure credential value or description using NerdGraph.",
    {
      accountId: s.positiveInteger("The account ID that owns the secure credential."),
      key: s.string({ minLength: 1, maxLength: 64, description: "The secure credential key." }),
      value: s.string({ minLength: 1, maxLength: 10000, description: "The updated secure credential value." }),
      description: s.string({ description: "The updated secure credential description." }),
    },
    ["accountId", "key", "value"],
    {
      key: s.string({ description: "The secure credential key." }),
      createdAt: s.string({ description: "The secure credential creation timestamp." }),
      lastUpdated: s.string({ description: "The secure credential update timestamp." }),
      errors: graphqlErrors,
    },
  ),
  action(
    "delete_secure_credential",
    "destructive",
    "Delete a New Relic synthetic secure credential using NerdGraph.",
    {
      accountId: s.positiveInteger("The account ID that owns the secure credential."),
      key: s.string({ minLength: 1, maxLength: 64, description: "The secure credential key." }),
    },
    ["accountId", "key"],
    {
      key: s.string({ description: "The deleted secure credential key." }),
      deleted: s.boolean({ description: "Whether the secure credential delete request succeeded." }),
      errors: graphqlErrors,
    },
  ),
  action(
    "create_deployment_marker",
    "write",
    "Create a New Relic change-tracking deployment marker for an entity GUID using NerdGraph.",
    {
      entityGuid: s.nonEmptyString("The target entity GUID."),
      version: s.nonEmptyString("The deployment version identifier."),
      user: s.string({ description: "The deployment user or service principal." }),
      commit: s.string({ description: "The deployment commit SHA or revision." }),
      groupId: s.string({ description: "The logical deployment group identifier." }),
      deepLink: s.url("A URL to the deployment details."),
      changelog: s.string({ description: "The deployment changelog text or URL." }),
      description: s.string({ description: "The deployment description." }),
      timestamp: s.integer({ description: "The deployment timestamp in Unix milliseconds." }),
      deploymentType: s.string({ description: "The deployment strategy type." }),
    },
    ["entityGuid", "version"],
    {
      deployment: looseObject,
    },
  ),
  action(
    "list_deployments",
    "read",
    "List deployment markers for a legacy APM application by using the REST v2 deployments API.",
    {
      applicationId: s.positiveInteger("The APM application ID."),
      page: s.positiveInteger("The 1-based result page to fetch."),
    },
    ["applicationId"],
    {
      deployments: looseList,
      links: looseObject,
    },
  ),
];

function action(
  name: NewRelicActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputProperties: Record<string, JsonSchema>,
  required: string[],
  outputProperties: Record<string, JsonSchema>,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema: s.actionInput(inputProperties, required, "The input payload for this action."),
    outputSchema: s.actionOutput(outputProperties, "The output payload for this action."),
  });
}
