import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { NewRelicActionName } from "./actions.ts";

import {
  compactObject,
  objectArray as coreObjectArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  pickOptionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  requiredRecord as coreRequiredRecord,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const newRelicGraphqlUrl = "https://api.newrelic.com/graphql";
const newRelicRestBaseUrl = "https://api.newrelic.com";
const newRelicUserAgent = providerUserAgent;

type NewRelicRequestPhase = "validate" | "execute";
type NewRelicActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
interface NewRelicActionInput {
  input: Record<string, unknown>;
  apiKey: string;
  actionName: string;
}

type GraphqlEnumValue = {
  __graphqlEnum: string;
};

type GraphqlEnvelope<TData> = {
  data?: TData;
  errors?: Array<{
    message?: string;
  }>;
};

type NewRelicCurrentUserPayload = {
  actor?: {
    user?: {
      id?: unknown;
      email?: unknown;
      name?: unknown;
    };
  };
};

export const newRelicActionHandlers: ProviderActionHandlers<"new_relic", NewRelicActionHandler> = {
  get_current_user(input, context) {
    return newRelicGetCurrentUser(toRuntimeInput("get_current_user", input, context), context.fetcher);
  },
  search_entities(input, context) {
    return newRelicSearchEntities(toRuntimeInput("search_entities", input, context), context.fetcher);
  },
  execute_nrql_query(input, context) {
    return newRelicExecuteNrqlQuery(toRuntimeInput("execute_nrql_query", input, context), context.fetcher);
  },
  get_alert_policies(input, context) {
    return newRelicGetAlertPolicies(toRuntimeInput("get_alert_policies", input, context), context.fetcher);
  },
  create_alert_policy(input, context) {
    return newRelicCreateAlertPolicy(toRuntimeInput("create_alert_policy", input, context), context.fetcher);
  },
  update_alert_policy(input, context) {
    return newRelicUpdateAlertPolicy(toRuntimeInput("update_alert_policy", input, context), context.fetcher);
  },
  delete_alert_policy(input, context) {
    return newRelicDeleteAlertPolicy(toRuntimeInput("delete_alert_policy", input, context), context.fetcher);
  },
  list_nrql_conditions(input, context) {
    return newRelicListNrqlConditions(toRuntimeInput("list_nrql_conditions", input, context), context.fetcher);
  },
  create_nrql_condition(input, context) {
    return newRelicCreateNrqlCondition(toRuntimeInput("create_nrql_condition", input, context), context.fetcher);
  },
  update_nrql_condition(input, context) {
    return newRelicUpdateNrqlCondition(toRuntimeInput("update_nrql_condition", input, context), context.fetcher);
  },
  delete_nrql_condition(input, context) {
    return newRelicDeleteNrqlCondition(toRuntimeInput("delete_nrql_condition", input, context), context.fetcher);
  },
  get_dashboard_entity(input, context) {
    return newRelicGetDashboardEntity(toRuntimeInput("get_dashboard_entity", input, context), context.fetcher);
  },
  create_dashboard(input, context) {
    return newRelicCreateDashboard(toRuntimeInput("create_dashboard", input, context), context.fetcher);
  },
  update_dashboard(input, context) {
    return newRelicUpdateDashboard(toRuntimeInput("update_dashboard", input, context), context.fetcher);
  },
  delete_dashboard(input, context) {
    return newRelicDeleteDashboard(toRuntimeInput("delete_dashboard", input, context), context.fetcher);
  },
  create_dashboard_snapshot_url(input, context) {
    return newRelicCreateDashboardSnapshotUrl(
      toRuntimeInput("create_dashboard_snapshot_url", input, context),
      context.fetcher,
    );
  },
  list_monitors(input, context) {
    return newRelicListMonitors(toRuntimeInput("list_monitors", input, context), context.fetcher);
  },
  get_synth_monitor(input, context) {
    return newRelicGetSynthMonitor(toRuntimeInput("get_synth_monitor", input, context), context.fetcher);
  },
  create_synthetics_simple_monitor(input, context) {
    return newRelicCreateSyntheticsSimpleMonitor(
      toRuntimeInput("create_synthetics_simple_monitor", input, context),
      context.fetcher,
    );
  },
  update_synthetics_simple_monitor(input, context) {
    return newRelicUpdateSyntheticsSimpleMonitor(
      toRuntimeInput("update_synthetics_simple_monitor", input, context),
      context.fetcher,
    );
  },
  delete_synthetics_monitor(input, context) {
    return newRelicDeleteSyntheticsMonitor(
      toRuntimeInput("delete_synthetics_monitor", input, context),
      context.fetcher,
    );
  },
  list_secure_credentials(input, context) {
    return newRelicListSecureCredentials(toRuntimeInput("list_secure_credentials", input, context), context.fetcher);
  },
  get_secure_credential(input, context) {
    return newRelicGetSecureCredential(toRuntimeInput("get_secure_credential", input, context), context.fetcher);
  },
  create_secure_credential(input, context) {
    return newRelicCreateSecureCredential(toRuntimeInput("create_secure_credential", input, context), context.fetcher);
  },
  update_secure_credential(input, context) {
    return newRelicUpdateSecureCredential(toRuntimeInput("update_secure_credential", input, context), context.fetcher);
  },
  delete_secure_credential(input, context) {
    return newRelicDeleteSecureCredential(toRuntimeInput("delete_secure_credential", input, context), context.fetcher);
  },
  create_deployment_marker(input, context) {
    return newRelicCreateDeploymentMarker(toRuntimeInput("create_deployment_marker", input, context), context.fetcher);
  },
  list_deployments(input, context) {
    return newRelicListDeployments(toRuntimeInput("list_deployments", input, context), context.fetcher);
  },
};

export async function validateNewRelicCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const currentUser = await fetchNewRelicCurrentUser(apiKey, fetcher, "validate");
  const user = currentUser.actor?.user;
  const providerAccountId = toNonEmptyString(user?.id) ?? toNonEmptyString(user?.email) ?? "user";
  const accountLabel = toNonEmptyString(user?.name) ?? toNonEmptyString(user?.email) ?? providerAccountId;

  return {
    profile: {
      accountId: providerAccountId,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/graphql",
      user: compactObject({
        id: toNonEmptyString(user?.id),
        email: toNonEmptyString(user?.email),
        name: toNonEmptyString(user?.name),
      }),
    },
  };
}

function toRuntimeInput(
  actionName: NewRelicActionName,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): NewRelicActionInput {
  return {
    actionName,
    input,
    apiKey: context.apiKey,
  };
}

async function newRelicGetCurrentUser(input: NewRelicActionInput, fetcher: typeof fetch) {
  const payload = await fetchNewRelicCurrentUser(input.apiKey, fetcher, "execute");
  return {
    user: compactObject({
      id: toNonEmptyString(payload.actor?.user?.id),
      email: toNonEmptyString(payload.actor?.user?.email),
      name: toNonEmptyString(payload.actor?.user?.name),
    }),
  };
}

async function newRelicSearchEntities(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const query = optionalString(source.query);
  const cursor = optionalString(source.cursor);
  const queryBuilder = optionalRecord(source.queryBuilder);
  const queryArgument = query
    ? `query: ${toGraphqlLiteral(query)}`
    : `queryBuilder: ${toGraphqlLiteral(normalizeEntitySearchQueryBuilder(queryBuilder))}`;
  const cursorArgument = cursor ? `, cursor: ${toGraphqlLiteral(cursor)}` : "";
  const payload = await newRelicGraphqlRequest<{
    actor?: {
      entitySearch?: {
        query?: string;
        results?: {
          nextCursor?: string | null;
          entities?: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    input.apiKey,
    `query {
      actor {
        entitySearch(${queryArgument}${cursorArgument}) {
          query
          results {
            nextCursor
            entities {
              guid
              name
              accountId
              domain
              type
              alertSeverity
              tags {
                key
                values
              }
            }
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    query: payload.actor?.entitySearch?.query ?? query ?? "",
    nextCursor: payload.actor?.entitySearch?.results?.nextCursor ?? null,
    entities: payload.actor?.entitySearch?.results?.entities ?? [],
  };
}

async function newRelicExecuteNrqlQuery(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const accountId = requirePositiveInteger(source, "accountId");
  const query = requireStringField(source, "query");
  const timeout = pickOptionalInteger(source, "timeout");
  const asyncExecution = pickOptionalBoolean(source, "asyncExecution") ?? false;
  const timeoutArgument = timeout != null ? `, timeout: ${timeout}` : "";
  const asyncArgument = asyncExecution ? ", async: true" : "";

  const payload = await newRelicGraphqlRequest<{
    actor?: {
      account?: {
        nrql?: {
          results?: Array<Record<string, unknown>>;
          metadata?: Record<string, unknown>;
          otherResult?: Record<string, unknown>;
          totalResult?: Record<string, unknown>;
          queryProgress?: Record<string, unknown>;
        };
      };
    };
  }>(
    input.apiKey,
    `query {
      actor {
        account(id: ${accountId}) {
          nrql(query: ${toGraphqlLiteral(query)}${timeoutArgument}${asyncArgument}) {
            results
            metadata
            otherResult
            totalResult
            queryProgress {
              queryId
              completed
            }
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  const nrql = payload.actor?.account?.nrql ?? {};
  return compactObject({
    results: nrql.results ?? [],
    metadata: nrql.metadata,
    otherResult: nrql.otherResult,
    totalResult: nrql.totalResult,
    queryProgress: nrql.queryProgress,
  });
}

async function newRelicGetAlertPolicies(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const page = pickOptionalInteger(source, "page");
  const name = optionalString(source.name);
  const incidentPreference = pickIncidentPreference(source);
  const payload = await newRelicRestRequest<{
    policies?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      method: "GET",
      path: "/v2/alerts_policies.json",
      query: compactObject({
        page,
        "filter[name]": name,
        "filter[incident_preference]": incidentPreference,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    policies: (payload.policies ?? []).map(normalizeAlertPolicy),
  };
}

async function newRelicCreateAlertPolicy(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const payload = await newRelicRestRequest<{
    policy?: Record<string, unknown>;
    policies?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      method: "POST",
      path: "/v2/alerts_policies.json",
      body: {
        policy: compactObject({
          name: requireStringField(source, "name"),
          incident_preference: pickIncidentPreference(source),
        }),
      },
    },
    fetcher,
    "execute",
  );

  return {
    policy: normalizeAlertPolicy(payload.policy ?? payload.policies?.[0] ?? {}),
  };
}

async function newRelicUpdateAlertPolicy(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const policyId = requireStringOrNumberField(source, "policyId");
  const policy = requiredRecord(source.policy);
  const body = compactObject({
    name: optionalString(policy.name),
    incident_preference: pickIncidentPreference(policy),
  });

  const payload = await newRelicRestRequest<{
    policy?: Record<string, unknown>;
    policies?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      method: "PUT",
      path: `/v2/alerts_policies/${policyId}.json`,
      body: {
        policy: body,
      },
    },
    fetcher,
    "execute",
  );

  return {
    policy: normalizeAlertPolicy(payload.policy ?? payload.policies?.[0] ?? {}),
  };
}

async function newRelicDeleteAlertPolicy(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const policyId = requireStringOrNumberField(source, "policyId");
  await newRelicRestRequest(
    input.apiKey,
    {
      method: "DELETE",
      path: `/v2/alerts_policies/${policyId}.json`,
    },
    fetcher,
    "execute",
  );

  return {
    deletedPolicyId: policyId,
    deleted: true,
  };
}

async function newRelicListNrqlConditions(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const policyId = requirePositiveInteger(source, "policyId");
  const page = pickOptionalInteger(source, "page");
  const payload = await newRelicRestRequest<{
    nrql_conditions?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      method: "GET",
      path: `/v2/alerts_nrql_conditions/policies/${policyId}.json`,
      query: compactObject({
        page,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    nrqlConditions: (payload.nrql_conditions ?? []).map(normalizeNrqlCondition),
  };
}

async function newRelicCreateNrqlCondition(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const policyId = requirePositiveInteger(source, "policyId");
  const conditionSource = requiredRecord(source.nrqlCondition);
  const payload = await newRelicRestRequest<{
    nrql_condition?: Record<string, unknown>;
    nrql_conditions?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      method: "POST",
      path: `/v2/alerts_nrql_conditions/policies/${policyId}.json`,
      body: {
        nrql_condition: buildNrqlConditionBody(conditionSource, true),
      },
    },
    fetcher,
    "execute",
  );

  return {
    nrqlCondition: normalizeNrqlCondition(payload.nrql_condition ?? payload.nrql_conditions?.[0] ?? {}),
  };
}

async function newRelicUpdateNrqlCondition(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const conditionId = requireStringOrNumberField(source, "conditionId");
  const conditionSource = requiredRecord(source.nrqlCondition);
  const payload = await newRelicRestRequest<{
    nrql_condition?: Record<string, unknown>;
    nrql_conditions?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      method: "PUT",
      path: `/v2/alerts_nrql_conditions/${conditionId}.json`,
      body: {
        nrql_condition: buildNrqlConditionBody(conditionSource, false),
      },
    },
    fetcher,
    "execute",
  );

  return {
    nrqlCondition: normalizeNrqlCondition(payload.nrql_condition ?? payload.nrql_conditions?.[0] ?? {}),
  };
}

async function newRelicDeleteNrqlCondition(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const conditionId = requireStringOrNumberField(source, "conditionId");
  await newRelicRestRequest(
    input.apiKey,
    {
      method: "DELETE",
      path: `/v2/alerts_nrql_conditions/${conditionId}.json`,
    },
    fetcher,
    "execute",
  );

  return {
    deletedConditionId: conditionId,
    deleted: true,
  };
}

async function newRelicGetDashboardEntity(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = requireStringField(source, "guid");
  const payload = await newRelicGraphqlRequest<{
    actor?: {
      entity?: Record<string, unknown> | null;
    };
  }>(
    input.apiKey,
    `query {
      actor {
        entity(guid: ${toGraphqlLiteral(guid)}) {
          ... on DashboardEntity {
            ${dashboardSelection}
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  const dashboard = payload.actor?.entity;
  if (!dashboard) {
    throw new ProviderRequestError(400, `dashboard not found for guid ${guid}`);
  }

  return {
    dashboard,
  };
}

async function newRelicCreateDashboard(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const accountId = requirePositiveInteger(source, "accountId");
  const dashboard = buildDashboardInput(source, false);
  const payload = await newRelicGraphqlRequest<{
    dashboardCreate?: {
      entityResult?: Record<string, unknown> | null;
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      dashboardCreate(accountId: ${accountId}, dashboard: ${toGraphqlLiteral(dashboard)}) {
        entityResult {
          ${dashboardSelection}
        }
        errors {
          type
          description
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    dashboard: payload.dashboardCreate?.entityResult ?? {},
    errors: payload.dashboardCreate?.errors ?? null,
  };
}

async function newRelicUpdateDashboard(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = requireStringField(source, "guid");
  const dashboard = buildDashboardInput(source, true);
  const payload = await newRelicGraphqlRequest<{
    dashboardUpdate?: {
      entityResult?: Record<string, unknown> | null;
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      dashboardUpdate(guid: ${toGraphqlLiteral(guid)}, dashboard: ${toGraphqlLiteral(dashboard)}) {
        entityResult {
          ${dashboardSelection}
        }
        errors {
          type
          description
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    dashboard: payload.dashboardUpdate?.entityResult ?? {},
    errors: payload.dashboardUpdate?.errors ?? null,
  };
}

async function newRelicDeleteDashboard(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = requireStringField(source, "guid");
  const payload = await newRelicGraphqlRequest<{
    dashboardDelete?: {
      status?: string;
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      dashboardDelete(guid: ${toGraphqlLiteral(guid)}) {
        status
        errors {
          type
          description
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    status: payload.dashboardDelete?.status ?? "UNKNOWN",
    errors: payload.dashboardDelete?.errors ?? null,
  };
}

async function newRelicCreateDashboardSnapshotUrl(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = requireStringField(source, "guid");
  const payload = await newRelicGraphqlRequest<{
    dashboardCreateSnapshotURL?: string;
    dashboardCreateSnapshotUrl?: string;
  }>(
    input.apiKey,
    `mutation {
      dashboardCreateSnapshotURL(guid: ${toGraphqlLiteral(guid)})
    }`,
    fetcher,
    "execute",
  );

  const url = payload.dashboardCreateSnapshotURL ?? payload.dashboardCreateSnapshotUrl;
  if (!url) {
    throw new ProviderRequestError(502, "new_relic did not return a dashboard snapshot URL");
  }

  return {
    url,
  };
}

async function newRelicListMonitors(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const cursor = optionalString(source.cursor);
  const queryFilter = optionalString(source.query);
  const query = queryFilter
    ? `(domain = 'SYNTH' AND type = 'MONITOR') AND (${queryFilter})`
    : "domain = 'SYNTH' AND type = 'MONITOR'";
  const payload = await newRelicGraphqlRequest<{
    actor?: {
      entitySearch?: {
        results?: {
          nextCursor?: string | null;
          entities?: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    input.apiKey,
    `query {
      actor {
        entitySearch(query: ${toGraphqlLiteral(query)}${cursor ? `, cursor: ${toGraphqlLiteral(cursor)}` : ""}) {
          results {
            nextCursor
            entities {
              ... on SyntheticMonitorEntityOutline {
                guid
                name
                accountId
                monitorId
                monitorType
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    query,
    nextCursor: payload.actor?.entitySearch?.results?.nextCursor ?? null,
    monitors: payload.actor?.entitySearch?.results?.entities ?? [],
  };
}

async function newRelicGetSynthMonitor(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = optionalString(source.guid);
  if (guid) {
    const payload = await newRelicGraphqlRequest<{
      actor?: {
        entity?: Record<string, unknown> | null;
      };
    }>(
      input.apiKey,
      `query {
        actor {
          entity(guid: ${toGraphqlLiteral(guid)}) {
            ... on SyntheticMonitorEntityOutline {
              guid
              name
              accountId
              monitorId
              monitorType
              tags {
                key
                values
              }
            }
          }
        }
      }`,
      fetcher,
      "execute",
    );

    return {
      monitor: payload.actor?.entity ?? null,
    };
  }

  const monitorId = requireStringField(source, "monitorId");
  const escapedMonitorId = escapeEntitySearchSingleQuotedValue(monitorId);
  const payload = await newRelicGraphqlRequest<{
    actor?: {
      entitySearch?: {
        results?: {
          entities?: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    input.apiKey,
    `query {
      actor {
        entitySearch(query: ${toGraphqlLiteral(`(domainId = '${escapedMonitorId}')`)}) {
          results {
            entities {
              ... on SyntheticMonitorEntityOutline {
                guid
                name
                accountId
                monitorId
                monitorType
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    monitor: payload.actor?.entitySearch?.results?.entities?.[0] ?? null,
  };
}

async function newRelicCreateSyntheticsSimpleMonitor(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const accountId = requirePositiveInteger(source, "accountId");
  const monitor = buildSimpleMonitorInput(source);
  const payload = await newRelicGraphqlRequest<{
    syntheticsCreateSimpleMonitor?: {
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      syntheticsCreateSimpleMonitor(accountId: ${accountId}, monitor: ${toGraphqlLiteral(monitor)}) {
        errors {
          description
          type
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    errors: payload.syntheticsCreateSimpleMonitor?.errors ?? null,
    monitor: null,
  };
}

async function newRelicUpdateSyntheticsSimpleMonitor(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = requireStringField(source, "guid");
  const monitor = buildSimpleMonitorUpdateInput(requiredRecord(source.monitor));
  const payload = await newRelicGraphqlRequest<{
    syntheticsUpdateSimpleMonitor?: {
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      syntheticsUpdateSimpleMonitor(guid: ${toGraphqlLiteral(guid)}, monitor: ${toGraphqlLiteral(monitor)}) {
        errors {
          description
          type
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    errors: payload.syntheticsUpdateSimpleMonitor?.errors ?? null,
  };
}

async function newRelicDeleteSyntheticsMonitor(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const guid = requireStringField(source, "guid");
  const payload = await newRelicGraphqlRequest<{
    syntheticsDeleteMonitor?: {
      deletedGuid?: string;
    };
  }>(
    input.apiKey,
    `mutation {
      syntheticsDeleteMonitor(guid: ${toGraphqlLiteral(guid)}) {
        deletedGuid
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    deletedGuid: payload.syntheticsDeleteMonitor?.deletedGuid ?? guid,
  };
}

async function newRelicListSecureCredentials(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const cursor = optionalString(source.cursor);
  const queryFilter = optionalString(source.query);
  const query = queryFilter
    ? `(domain = 'SYNTH' AND type = 'SECURE_CRED') AND (${queryFilter})`
    : "domain = 'SYNTH' AND type = 'SECURE_CRED'";
  const payload = await newRelicGraphqlRequest<{
    actor?: {
      entitySearch?: {
        results?: {
          nextCursor?: string | null;
          entities?: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    input.apiKey,
    `query {
      actor {
        entitySearch(query: ${toGraphqlLiteral(query)}${cursor ? `, cursor: ${toGraphqlLiteral(cursor)}` : ""}) {
          results {
            nextCursor
            entities {
              ... on SecureCredentialEntityOutline {
                accountId
                guid
                name
                updatedAt
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    query,
    nextCursor: payload.actor?.entitySearch?.results?.nextCursor ?? null,
    credentials: (payload.actor?.entitySearch?.results?.entities ?? []).map(normalizeSecureCredentialEntity),
  };
}

async function newRelicGetSecureCredential(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const key = requireStringField(source, "key");
  const escapedKey = escapeEntitySearchSingleQuotedValue(key);
  const payload = await newRelicGraphqlRequest<{
    actor?: {
      entitySearch?: {
        results?: {
          entities?: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    input.apiKey,
    `query {
      actor {
        entitySearch(query: ${toGraphqlLiteral(
          `(domain = 'SYNTH' AND type = 'SECURE_CRED') AND (name = '${escapedKey}')`,
        )}) {
          results {
            entities {
              ... on SecureCredentialEntityOutline {
                accountId
                guid
                name
                updatedAt
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    credential: normalizeSecureCredentialEntity(payload.actor?.entitySearch?.results?.entities?.[0] ?? null),
  };
}

async function newRelicCreateSecureCredential(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const payload = await newRelicGraphqlRequest<{
    syntheticsCreateSecureCredential?: {
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      syntheticsCreateSecureCredential(
        accountId: ${requirePositiveInteger(source, "accountId")}
        ${buildOptionalGraphqlArgument("description", optionalString(source.description))}
        key: ${toGraphqlLiteral(requireStringField(source, "key"))}
        value: ${toGraphqlLiteral(requireStringField(source, "value"))}
      ) {
        errors {
          description
          type
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    key: requireStringField(source, "key"),
    errors: payload.syntheticsCreateSecureCredential?.errors ?? null,
  };
}

async function newRelicUpdateSecureCredential(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const payload = await newRelicGraphqlRequest<{
    syntheticsUpdateSecureCredential?: {
      createdAt?: string;
      lastUpdate?: string;
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      syntheticsUpdateSecureCredential(
        accountId: ${requirePositiveInteger(source, "accountId")}
        ${buildOptionalGraphqlArgument("description", optionalString(source.description))}
        key: ${toGraphqlLiteral(requireStringField(source, "key"))}
        value: ${toGraphqlLiteral(requireStringField(source, "value"))}
      ) {
        createdAt
        lastUpdate
        errors {
          description
          type
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    key: requireStringField(source, "key"),
    createdAt: payload.syntheticsUpdateSecureCredential?.createdAt,
    lastUpdated: payload.syntheticsUpdateSecureCredential?.lastUpdate,
    errors: payload.syntheticsUpdateSecureCredential?.errors ?? null,
  };
}

async function newRelicDeleteSecureCredential(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const key = requireStringField(source, "key");
  const payload = await newRelicGraphqlRequest<{
    syntheticsDeleteSecureCredential?: {
      errors?: Array<Record<string, unknown>> | null;
    };
  }>(
    input.apiKey,
    `mutation {
      syntheticsDeleteSecureCredential(
        accountId: ${requirePositiveInteger(source, "accountId")}
        key: ${toGraphqlLiteral(key)}
      ) {
        errors {
          description
          type
        }
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    key,
    deleted: (payload.syntheticsDeleteSecureCredential?.errors?.length ?? 0) === 0,
    errors: payload.syntheticsDeleteSecureCredential?.errors ?? null,
  };
}

async function newRelicCreateDeploymentMarker(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const deployment = compactObject({
    version: requireStringField(source, "version"),
    entityGuid: requireStringField(source, "entityGuid"),
    user: optionalString(source.user),
    commit: optionalString(source.commit),
    groupId: optionalString(source.groupId),
    deepLink: optionalString(source.deepLink),
    changelog: optionalString(source.changelog),
    description: optionalString(source.description),
    timestamp: pickOptionalInteger(source, "timestamp"),
    deploymentType: optionalString(source.deploymentType)
      ? graphqlEnum(assertGraphqlEnumName(requireStringField(source, "deploymentType"), "deploymentType"))
      : undefined,
  });
  const payload = await newRelicGraphqlRequest<{
    changeTrackingCreateDeployment?: Record<string, unknown>;
  }>(
    input.apiKey,
    `mutation {
      changeTrackingCreateDeployment(deployment: ${toGraphqlLiteral(deployment)}) {
        changelog
        commit
        deepLink
        deploymentId
        deploymentType
        description
        entityGuid
        groupId
        timestamp
        user
        version
      }
    }`,
    fetcher,
    "execute",
  );

  return {
    deployment: payload.changeTrackingCreateDeployment ?? {},
  };
}

async function newRelicListDeployments(input: NewRelicActionInput, fetcher: typeof fetch) {
  const source = requiredRecord(input.input);
  const applicationId = requirePositiveInteger(source, "applicationId");
  const page = pickOptionalInteger(source, "page");
  const payload = await newRelicRestRequest<{
    deployments?: Array<Record<string, unknown>>;
    links?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      method: "GET",
      path: `/v2/applications/${applicationId}/deployments.json`,
      query: compactObject({
        page,
      }),
      apiKeyHeader: "X-Api-Key",
    },
    fetcher,
    "execute",
  );

  return {
    deployments: payload.deployments ?? [],
    links: payload.links,
  };
}

async function fetchNewRelicCurrentUser(apiKey: string, fetcher: typeof fetch, phase: NewRelicRequestPhase) {
  return newRelicGraphqlRequest<NewRelicCurrentUserPayload>(
    apiKey,
    `query {
      actor {
        user {
          id
          email
          name
        }
      }
    }`,
    fetcher,
    phase,
  );
}

async function newRelicGraphqlRequest<TData>(
  apiKey: string,
  query: string,
  fetcher: typeof fetch,
  phase: NewRelicRequestPhase,
) {
  const response = await fetcher(newRelicGraphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Api-Key": apiKey,
      "user-agent": newRelicUserAgent,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw await buildNewRelicHttpError(response, phase);
  }

  const payload = (await response.json()) as GraphqlEnvelope<TData>;
  if (payload.errors?.length) {
    throw new ProviderRequestError(
      phase === "validate" ? 400 : 502,
      payload.errors[0]?.message ?? "new_relic graphql request failed",
      payload.errors,
    );
  }
  if (!payload.data) {
    throw new ProviderRequestError(502, "new_relic graphql response did not include data");
  }

  return payload.data;
}

async function newRelicRestRequest<TResponse>(
  apiKey: string,
  input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
    apiKeyHeader?: "Api-Key" | "X-Api-Key";
  },
  fetcher: typeof fetch,
  phase: NewRelicRequestPhase,
) {
  const url = new URL(input.path, newRelicRestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value == null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetcher(url.toString(), {
    method: input.method,
    headers: buildRestHeaders(apiKey, input.apiKeyHeader ?? "Api-Key", !!input.body),
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (!response.ok) {
    throw await buildNewRelicHttpError(response, phase);
  }

  if (response.status === 204) {
    return {} as TResponse;
  }

  return (await response.json()) as TResponse;
}

async function buildNewRelicHttpError(response: Response, phase: NewRelicRequestPhase) {
  const payload = await tryParseJson(response);
  const message =
    readJsonString(payload, "error", "message", "errorMessage") ?? response.statusText ?? "new_relic request failed";

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

async function tryParseJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildNrqlConditionBody(source: Record<string, unknown>, creating: boolean) {
  const nrql = optionalRecord(source.nrql);
  const terms = source.terms ? objectArray(source.terms) : undefined;
  const payload = compactObject({
    type: optionalString(source.type),
    name: optionalString(source.name),
    enabled: optionalBoolean(source.enabled),
    runbook_url: pickOptionalString(source, "runbook_url", "runbookUrl"),
    value_function: pickOptionalString(source, "value_function", "valueFunction"),
    nrql: nrql
      ? compactObject({
          query: optionalString(nrql.query),
          since_value: pickStringOrNumberValue(nrql, "since_value", "sinceValue"),
        })
      : undefined,
    terms: terms?.map((term) =>
      compactObject({
        duration: pickStringOrNumberValue(term, "duration"),
        operator: optionalString(term.operator),
        priority: optionalString(term.priority),
        threshold: pickStringOrNumberValue(term, "threshold"),
        time_function: pickStringOrNumberValue(term, "time_function", "timeFunction"),
      }),
    ),
    signal: optionalRecord(source.signal),
    expiration: optionalRecord(source.expiration),
  });

  if (!creating && Object.keys(payload).length === 0) {
    throw new ProviderRequestError(400, "nrqlCondition must include at least one field");
  }

  return payload;
}

function buildDashboardInput(source: Record<string, unknown>, includeIds: boolean) {
  const pages = objectArray(source.pages).map((page) => {
    const widgets = objectArray(page.widgets).map((widget) =>
      compactObject({
        id: includeIds ? optionalString(widget.id) : undefined,
        title: requireStringField(widget, "title"),
        visualization: requireStringField(widget, "visualization"),
        layout: optionalRecord(widget.layout),
        rawConfiguration: optionalRecord(widget.rawConfiguration ?? widget.raw_configuration) ?? {},
        linkedEntityGuids: readStringArray(widget, "linkedEntityGuids", "linked_entity_guids"),
      }),
    );

    return compactObject({
      guid: includeIds ? optionalString(page.guid) : undefined,
      name: requireStringField(page, "name"),
      description: optionalString(page.description),
      widgets,
    });
  });

  return compactObject({
    name: requireStringField(source, "name"),
    description: optionalString(source.description),
    permissions: graphqlEnum(assertGraphqlEnumName(requireStringField(source, "permissions"), "permissions")),
    pages,
  });
}

function buildSimpleMonitorInput(source: Record<string, unknown>) {
  return compactObject({
    name: requireStringField(source, "name"),
    uri: requireStringField(source, "uri"),
    period: graphqlEnum(assertGraphqlEnumName(requireStringField(source, "period"), "period")),
    status: graphqlEnum(assertGraphqlEnumName(requireStringField(source, "status"), "status")),
    locations: requiredRecord(source.locations),
    advancedOptions: normalizeAdvancedMonitorOptions(source.advancedOptions ?? source.advanced_options),
    apdexTarget: readOptionalNumber(source, "apdexTarget"),
  });
}

function buildSimpleMonitorUpdateInput(source: Record<string, unknown>) {
  return compactObject({
    name: optionalString(source.name),
    uri: optionalString(source.uri),
    period: optionalString(source.period)
      ? graphqlEnum(assertGraphqlEnumName(requireStringField(source, "period"), "period"))
      : undefined,
    status: optionalString(source.status)
      ? graphqlEnum(assertGraphqlEnumName(requireStringField(source, "status"), "status"))
      : undefined,
    locations: optionalRecord(source.locations),
    advancedOptions: normalizeAdvancedMonitorOptions(source.advancedOptions ?? source.advanced_options),
    apdexTarget: readOptionalNumber(source, "apdexTarget"),
  });
}

function normalizeAdvancedMonitorOptions(value: unknown) {
  const object = optionalRecord(value);
  if (!object) {
    return undefined;
  }

  const headersValue = object.customHeaders ?? object.custom_headers;
  let customHeaders: Array<Record<string, unknown>> | undefined;
  if (Array.isArray(headersValue)) {
    customHeaders = headersValue.map((item) => requiredRecord(item));
  } else if (headersValue && typeof headersValue === "object") {
    customHeaders = [requiredRecord(headersValue)];
  }

  return compactObject({
    customHeaders,
    redirectIsFailure: pickOptionalBoolean(object, "redirectIsFailure", "redirect_is_failure"),
    responseValidationText: pickOptionalString(object, "responseValidationText", "response_validation_text"),
    shouldBypassHeadRequest: pickOptionalBoolean(object, "shouldBypassHeadRequest", "should_bypass_head_request"),
    useTlsValidation: pickOptionalBoolean(object, "useTlsValidation", "use_tls_validation"),
  });
}

function normalizeAlertPolicy(policy: Record<string, unknown>) {
  return compactObject({
    id: policy.id,
    name: optionalString(policy.name),
    incidentPreference: pickOptionalString(policy, "incidentPreference", "incident_preference"),
    createdAt: policy.createdAt ?? policy.created_at,
    updatedAt: policy.updatedAt ?? policy.updated_at,
  });
}

function normalizeNrqlCondition(condition: Record<string, unknown>) {
  return compactObject({
    id: condition.id,
    name: optionalString(condition.name),
    enabled: optionalBoolean(condition.enabled),
    type: optionalString(condition.type),
    nrql: normalizeNrqlQuery(optionalRecord(condition.nrql)),
    terms: Array.isArray(condition.terms)
      ? condition.terms.map((term) => normalizeNrqlTerm(requiredRecord(term)))
      : undefined,
    runbookUrl: pickOptionalString(condition, "runbookUrl", "runbook_url"),
    valueFunction: pickOptionalString(condition, "valueFunction", "value_function"),
    signal: optionalRecord(condition.signal),
    expiration: optionalRecord(condition.expiration),
  });
}

function normalizeNrqlQuery(query: Record<string, unknown> | undefined) {
  if (!query) {
    return undefined;
  }
  return compactObject({
    query: optionalString(query.query),
    sinceValue: pickStringOrNumberValue(query, "sinceValue", "since_value"),
  });
}

function normalizeNrqlTerm(term: Record<string, unknown>) {
  return compactObject({
    duration: pickStringOrNumberValue(term, "duration"),
    operator: optionalString(term.operator),
    priority: optionalString(term.priority),
    threshold: pickStringOrNumberValue(term, "threshold"),
    timeFunction: pickStringOrNumberValue(term, "timeFunction", "time_function"),
  });
}

function normalizeSecureCredentialEntity(entity: Record<string, unknown> | null) {
  if (!entity) {
    return null;
  }
  return compactObject({
    guid: optionalString(entity.guid),
    key: optionalString(entity.name),
    accountId: typeof entity.accountId === "number" ? entity.accountId : undefined,
    tags: Array.isArray(entity.tags) ? entity.tags : undefined,
    updatedAt: optionalString(entity.updatedAt),
  });
}

function normalizeEntitySearchQueryBuilder(value: Record<string, unknown> | undefined) {
  if (!value) {
    throw new ProviderRequestError(400, "queryBuilder is required when query is omitted");
  }

  return compactObject({
    domain: optionalString(value.domain)
      ? graphqlEnum(assertGraphqlEnumName(requireStringField(value, "domain"), "domain"))
      : undefined,
    type: optionalString(value.type)
      ? graphqlEnum(assertGraphqlEnumName(requireStringField(value, "type"), "type"))
      : undefined,
    infrastructureIntegrationType: optionalString(value.infrastructureIntegrationType)
      ? graphqlEnum(
          assertGraphqlEnumName(
            requireStringField(value, "infrastructureIntegrationType"),
            "infrastructureIntegrationType",
          ),
        )
      : undefined,
  });
}

function requiredRecord(value: unknown): Record<string, unknown> {
  return coreRequiredRecord(value, "value", (message) => new ProviderRequestError(400, message));
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return coreObjectArray(value, "value", (message) => new ProviderRequestError(400, message));
}

function requirePositiveInteger(input: Record<string, unknown>, ...keys: string[]) {
  const value = pickOptionalInteger(input, ...keys);
  if (!value || value <= 0) {
    throw new ProviderRequestError(400, `${keys[0]} is required`);
  }
  return value;
}

function requireStringField(input: Record<string, unknown>, ...keys: string[]) {
  const value = pickOptionalString(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, `${keys[0]} is required`);
  }
  return value;
}

function requireStringOrNumberField(input: Record<string, unknown>, ...keys: string[]) {
  const value = pickStringOrNumberValue(input, ...keys);
  if (value == null || value === "") {
    throw new ProviderRequestError(400, `${keys[0]} is required`);
  }
  return value;
}

function pickStringOrNumberValue(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readOptionalNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (!Array.isArray(value)) {
      continue;
    }
    return value.map((item) => String(item)).filter(Boolean);
  }
  return undefined;
}

function pickIncidentPreference(input: Record<string, unknown>) {
  const value = pickOptionalString(input, "incidentPreference");
  return value ? assertGraphqlEnumName(value, "incidentPreference") : undefined;
}

function buildOptionalGraphqlArgument(name: string, value: string | undefined) {
  return value ? `${name}: ${toGraphqlLiteral(value)}` : "";
}

function graphqlEnum(value: string): GraphqlEnumValue {
  return { __graphqlEnum: value };
}

function escapeEntitySearchSingleQuotedValue(value: string) {
  return value.replaceAll("'", "\\'");
}

function toGraphqlLiteral(value: unknown): string {
  if (isGraphqlEnumValue(value)) {
    return value.__graphqlEnum;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toGraphqlLiteral(item)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, child] of Object.entries(object)) {
      if (child === undefined) {
        continue;
      }
      parts.push(`${key}: ${toGraphqlLiteral(child)}`);
    }
    return `{ ${parts.join(", ")} }`;
  }
  throw new ProviderRequestError(400, "unsupported graphql literal value");
}

function isGraphqlEnumValue(value: unknown): value is GraphqlEnumValue {
  return !!value && typeof value === "object" && "__graphqlEnum" in value;
}

function assertGraphqlEnumName(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    const isUpper = code >= 65 && code <= 90;
    const isNumber = code >= 48 && code <= 57;
    const isUnderscore = code === 95;
    if (!isUpper && !isNumber && !isUnderscore) {
      throw new ProviderRequestError(400, `${fieldName} must use GraphQL enum naming like UPPER_SNAKE_CASE`);
    }
  }
  return trimmed;
}

function toNonEmptyString(value: unknown) {
  if (typeof value === "string" && value) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readJsonString(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return undefined;
}

function buildRestHeaders(apiKey: string, apiKeyHeader: "Api-Key" | "X-Api-Key", hasBody: boolean) {
  const headers = new Headers();
  headers.set(apiKeyHeader, apiKey);
  headers.set("user-agent", newRelicUserAgent);
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

const dashboardSelection = `
  guid
  name
  description
  createdAt
  updatedAt
  permissions
  owner {
    email
    userId
  }
  pages {
    guid
    name
    description
    createdAt
    updatedAt
    widgets {
      id
      title
      rawConfiguration
      visualization {
        id
      }
      layout {
        row
        column
        width
        height
      }
    }
  }
`;
