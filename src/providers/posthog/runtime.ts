import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRawString, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const posthogUserAgent = providerUserAgent;
const posthogValidationPath = "/api/users/@me/";

type PosthogActionHandler = (input: PosthogProviderActionInput, fetcher: typeof fetch) => Promise<unknown>;

export interface PosthogProviderActionInput {
  actionName: string;
  input: Record<string, unknown>;
  apiKey: string;
  providerMetadata?: Record<string, unknown>;
}

export interface PosthogRuntimeContext {
  apiKey: string;
  fetcher: typeof fetch;
  providerMetadata?: Record<string, unknown>;
}

interface PosthogAuthContext {
  bearerToken: string;
  baseUrl: string;
}

interface PosthogRequestOptions {
  baseUrl: string;
  bearerToken: string;
  path: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  mode: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
}

interface PosthogCurrentUser {
  id?: unknown;
  uuid?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  organization?: unknown;
  organizations?: unknown;
}

export const posthogActionHandlers: ProviderActionHandlers<"posthog", PosthogActionHandler> = {
  get_current_user(input, fetcher) {
    return posthogGetCurrentUser(input, fetcher);
  },
  list_projects(input, fetcher) {
    return posthogListProjects(input, fetcher);
  },
  get_project(input, fetcher) {
    return posthogGetProject(input, fetcher);
  },
  list_event_definitions(input, fetcher) {
    return posthogListEventDefinitions(input, fetcher);
  },
  get_event_definition(input, fetcher) {
    return posthogGetEventDefinition(input, fetcher);
  },
  create_event_definition(input, fetcher) {
    return posthogCreateEventDefinition(input, fetcher);
  },
  update_event_definition(input, fetcher) {
    return posthogUpdateEventDefinition(input, fetcher);
  },
  delete_event_definition(input, fetcher) {
    return posthogDeleteEventDefinition(input, fetcher);
  },
  get_event_definition_by_name(input, fetcher) {
    return posthogGetEventDefinitionByName(input, fetcher);
  },
  get_event_definition_primary_properties(input, fetcher) {
    return posthogGetEventDefinitionPrimaryProperties(input, fetcher);
  },
  bulk_update_event_definition_tags(input, fetcher) {
    return posthogBulkUpdateEventDefinitionTags(input, fetcher);
  },
  list_property_definitions(input, fetcher) {
    return posthogListPropertyDefinitions(input, fetcher);
  },
  get_property_definition(input, fetcher) {
    return posthogGetPropertyDefinition(input, fetcher);
  },
  update_property_definition(input, fetcher) {
    return posthogUpdatePropertyDefinition(input, fetcher);
  },
  delete_property_definition(input, fetcher) {
    return posthogDeletePropertyDefinition(input, fetcher);
  },
  bulk_update_property_definition_tags(input, fetcher) {
    return posthogBulkUpdatePropertyDefinitionTags(input, fetcher);
  },
  list_annotations(input, fetcher) {
    return posthogListAnnotations(input, fetcher);
  },
  get_annotation(input, fetcher) {
    return posthogGetAnnotation(input, fetcher);
  },
  create_annotation(input, fetcher) {
    return posthogCreateAnnotation(input, fetcher);
  },
  update_annotation(input, fetcher) {
    return posthogUpdateAnnotation(input, fetcher);
  },
  delete_annotation(input, fetcher) {
    return posthogDeleteAnnotation(input, fetcher);
  },
  list_cohorts(input, fetcher) {
    return posthogListCohorts(input, fetcher);
  },
  get_cohort(input, fetcher) {
    return posthogGetCohort(input, fetcher);
  },
  create_cohort(input, fetcher) {
    return posthogCreateCohort(input, fetcher);
  },
  update_cohort(input, fetcher) {
    return posthogUpdateCohort(input, fetcher);
  },
  delete_cohort(input, fetcher) {
    return posthogDeleteCohort(input, fetcher);
  },
  add_persons_to_static_cohort(input, fetcher) {
    return posthogAddPersonsToStaticCohort(input, fetcher);
  },
  get_cohort_persons(input, fetcher) {
    return posthogGetCohortPersons(input, fetcher);
  },
  get_cohort_calculation_history(input, fetcher) {
    return posthogGetCohortCalculationHistory(input, fetcher);
  },
  list_insights(input, fetcher) {
    return posthogListInsights(input, fetcher);
  },
  get_insight(input, fetcher) {
    return posthogGetInsight(input, fetcher);
  },
  run_query(input, fetcher) {
    return posthogRunQuery(input, fetcher);
  },
  get_async_query_status(input, fetcher) {
    return posthogGetAsyncQueryStatus(input, fetcher);
  },
  cancel_query(input, fetcher) {
    return posthogCancelQuery(input, fetcher);
  },
  create_insight(input, fetcher) {
    return posthogCreateInsight(input, fetcher);
  },
  update_insight(input, fetcher) {
    return posthogUpdateInsight(input, fetcher);
  },
  delete_insight(input, fetcher) {
    return posthogDeleteInsight(input, fetcher);
  },
  list_dashboards(input, fetcher) {
    return posthogListDashboards(input, fetcher);
  },
  get_dashboard(input, fetcher) {
    return posthogGetDashboard(input, fetcher);
  },
  create_dashboard(input, fetcher) {
    return posthogCreateDashboard(input, fetcher);
  },
  update_dashboard(input, fetcher) {
    return posthogUpdateDashboard(input, fetcher);
  },
  delete_dashboard(input, fetcher) {
    return posthogDeleteDashboard(input, fetcher);
  },
  run_dashboard_insights(input, fetcher) {
    return posthogRunDashboardInsights(input, fetcher);
  },
  copy_dashboard_tile(input, fetcher) {
    return posthogCopyDashboardTile(input, fetcher);
  },
  move_dashboard_tile(input, fetcher) {
    return posthogMoveDashboardTile(input, fetcher);
  },
  reorder_dashboard_tiles(input, fetcher) {
    return posthogReorderDashboardTiles(input, fetcher);
  },
  list_dashboard_collaborators(input, fetcher) {
    return posthogListDashboardCollaborators(input, fetcher);
  },
  add_dashboard_collaborator(input, fetcher) {
    return posthogAddDashboardCollaborator(input, fetcher);
  },
  remove_dashboard_collaborator(input, fetcher) {
    return posthogRemoveDashboardCollaborator(input, fetcher);
  },
  list_feature_flags(input, fetcher) {
    return posthogListFeatureFlags(input, fetcher);
  },
  get_feature_flag(input, fetcher) {
    return posthogGetFeatureFlag(input, fetcher);
  },
  create_feature_flag(input, fetcher) {
    return posthogCreateFeatureFlag(input, fetcher);
  },
  update_feature_flag(input, fetcher) {
    return posthogUpdateFeatureFlag(input, fetcher);
  },
  delete_feature_flag(input, fetcher) {
    return posthogDeleteFeatureFlag(input, fetcher);
  },
  get_feature_flag_status(input, fetcher) {
    return posthogGetFeatureFlagStatus(input, fetcher);
  },
  get_feature_flag_dependent_flags(input, fetcher) {
    return posthogGetFeatureFlagDependentFlags(input, fetcher);
  },
  get_feature_flags_local_evaluation(input, fetcher) {
    return posthogGetFeatureFlagsLocalEvaluation(input, fetcher);
  },
};

export async function validatePosthogCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizePosthogBaseUrl(input.values.baseUrl);
  const user = await fetchPosthogCurrentUser({
    bearerToken: input.apiKey,
    baseUrl,
    fetcher,
    mode: "validate",
  });

  const providerAccountId = extractUserIdentifier(user);
  const accountLabel = extractUserAccountLabel(user);
  const organizationId = extractCurrentOrganizationId(user);

  return {
    profile: {
      accountId: providerAccountId,
      displayName: accountLabel,
      grantedScopes: [],
    },
    metadata: compactObject({
      baseUrl,
      validationEndpoint: posthogValidationPath,
      userId: optionalString(user.uuid) ?? normalizeUnknownString(user.id),
      email: optionalString(user.email),
      organizationId,
    }),
  };
}

async function posthogGetCurrentUser(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  return fetchPosthogCurrentUser({
    bearerToken: auth.bearerToken,
    baseUrl: auth.baseUrl,
    fetcher,
    mode: "execute",
  });
}

async function posthogListProjects(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const organizationId = await resolveOrganizationId(input, auth, fetcher);
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/organizations/${encodeURIComponent(organizationId)}/projects/`,
    query: {
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
      search: optionalRawString(input.input.search),
    },
  });
}

async function posthogGetProject(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const organizationId = await resolveOrganizationId(input, auth, fetcher);
  const id = requirePathString(input.input.id, "id");

  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });
}

async function posthogListEventDefinitions(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/`,
    query: {
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
    },
  });
}

async function posthogGetEventDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });
}

async function posthogCreateEventDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/`,
    body: buildEventDefinitionWriteBody(input.input),
  });
}

async function posthogUpdateEventDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/${encodeURIComponent(id)}/`,
    body: buildEventDefinitionWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });
}

async function posthogDeleteEventDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "DELETE",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
    id,
    raw: payload,
  };
}

async function posthogGetEventDefinitionByName(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/by_name/`,
    query: {
      name: requirePathString(input.input.name, "name"),
    },
    notFoundAsInvalidInput: true,
  });
}

async function posthogGetEventDefinitionPrimaryProperties(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<unknown>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/primary_properties/`,
    query: {
      names: joinStringArray(input.input.names),
    },
  });

  return {
    results: asNullableObject(payload) ?? {},
    raw: payload,
  };
}

async function posthogBulkUpdateEventDefinitionTags(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/event_definitions/bulk_update_tags/`,
    body: buildBulkUpdateTagsBody(input.input),
  });

  return mapBulkUpdateTags(payload);
}

async function posthogListPropertyDefinitions(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/property_definitions/`,
    query: compactObject({
      event_names: optionalRawString(input.input.event_names),
      exclude_core_properties: optionalBoolean(input.input.exclude_core_properties),
      exclude_hidden: optionalBoolean(input.input.exclude_hidden),
      excluded_properties: optionalRawString(input.input.excluded_properties),
      filter_by_event_names: asNullableBoolean(input.input.filter_by_event_names),
      group_type_index: asNumber(input.input.group_type_index),
      is_feature_flag: asNullableBoolean(input.input.is_feature_flag),
      is_numerical: asNullableBoolean(input.input.is_numerical),
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
      properties: optionalRawString(input.input.properties),
      search: optionalRawString(input.input.search),
      type: optionalRawString(input.input.type),
      verified: asNullableBoolean(input.input.verified),
    }),
  });
}

async function posthogGetPropertyDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/property_definitions/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });
}

async function posthogUpdatePropertyDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/property_definitions/${encodeURIComponent(id)}/`,
    body: buildPropertyDefinitionWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });
}

async function posthogDeletePropertyDefinition(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "DELETE",
    path: `/api/projects/${encodeURIComponent(projectId)}/property_definitions/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
    id,
    raw: payload,
  };
}

async function posthogBulkUpdatePropertyDefinitionTags(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/property_definitions/bulk_update_tags/`,
    body: buildBulkUpdateTagsBody(input.input),
  });

  return mapBulkUpdateTags(payload);
}

async function posthogListAnnotations(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/annotations/`,
    query: compactObject({
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
      search: optionalRawString(input.input.search),
    }),
  });

  return mapAnnotationList(payload);
}

async function posthogGetAnnotation(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/annotations/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });

  return mapAnnotation(payload);
}

async function posthogCreateAnnotation(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/annotations/`,
    body: buildAnnotationWriteBody(input.input),
  });

  return mapAnnotation(payload);
}

async function posthogUpdateAnnotation(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/annotations/${encodeURIComponent(id)}/`,
    body: buildAnnotationWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });

  return mapAnnotation(payload);
}

async function posthogDeleteAnnotation(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/annotations/${encodeURIComponent(id)}/`,
    body: {
      deleted: true,
    },
    notFoundAsInvalidInput: true,
  });

  const annotation = mapAnnotation(payload);
  return {
    deleted: true,
    id,
    annotation,
    raw: payload,
  };
}

async function posthogListCohorts(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/`,
    query: {
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
    },
  });
}

async function posthogGetCohort(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });
}

async function posthogCreateCohort(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/`,
    body: buildCohortWriteBody(input.input),
  });
}

async function posthogUpdateCohort(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/${encodeURIComponent(id)}/`,
    body: buildCohortWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });
}

async function posthogDeleteCohort(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/${encodeURIComponent(id)}/`,
    body: {
      deleted: true,
    },
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
    id,
    cohort: payload,
    raw: payload,
  };
}

async function posthogAddPersonsToStaticCohort(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/${encodeURIComponent(id)}/add_persons_to_static_cohort/`,
    body: {
      person_ids: requireNonEmptyStringArray(input.input.person_ids, "person_ids"),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    raw: payload,
  };
}

async function posthogGetCohortPersons(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/${encodeURIComponent(id)}/persons/`,
    query: compactObject({
      format: optionalRawString(input.input.format),
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    next: asNullableString(payload.next),
    previous: asNullableString(payload.previous),
    results: normalizeUnknownArray(payload.results).map((item) => asLooseObject(item)),
    raw: payload,
  };
}

async function posthogGetCohortCalculationHistory(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/cohorts/${encodeURIComponent(id)}/calculation_history/`,
    notFoundAsInvalidInput: true,
  });

  return {
    raw: payload,
  };
}

async function posthogListInsights(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/insights/`,
    query: compactObject({
      basic: optionalBoolean(input.input.basic),
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
      refresh: optionalRawString(input.input.refresh),
      short_id: optionalRawString(input.input.short_id),
    }),
  });

  return {
    count: asNumber(payload.count) ?? 0,
    next: asNullableString(payload.next),
    previous: asNullableString(payload.previous),
    results: normalizeUnknownArray(payload.results).map((item) => mapInsight(item)),
    raw: payload,
  };
}

async function posthogGetInsight(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/insights/${encodeURIComponent(id)}/`,
    query: compactObject({
      from_dashboard: asNumber(input.input.from_dashboard),
      refresh: optionalRawString(input.input.refresh),
    }),
    notFoundAsInvalidInput: true,
  });

  return mapInsight(payload);
}

async function posthogRunQuery(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/query/`,
    method: "POST",
    body: compactObject({
      query: asObject(input.input.query, "query"),
      async: asNullableBoolean(input.input.async),
      client_query_id: asNullableString(input.input.client_query_id),
      filters_override: asNullableObject(input.input.filters_override),
      limit_context: asNullableString(input.input.limit_context),
      name: asNullableString(input.input.name),
      refresh: asNullableString(input.input.refresh),
      variables_override: asNullableObject(input.input.variables_override),
    }),
  });

  return {
    results: normalizeUnknownArray(payload.results),
    columns: Array.isArray(payload.columns)
      ? payload.columns.filter((item): item is string => typeof item === "string")
      : undefined,
    types: Array.isArray(payload.types) ? payload.types : undefined,
    hasMore: asNullableBoolean(payload.hasMore),
    limit: asNumber(payload.limit),
    offset: asNumber(payload.offset),
    query: asNullableObject(payload.query),
    error: payload.error,
    is_cached: asNullableBoolean(payload.is_cached),
    timings: normalizeUnknownArray(payload.timings).map((item) => asLooseObject(item)),
    query_status: asNullableObject(payload.query_status),
    hogql: asNullableString(payload.hogql),
    cache_target_age: asNullableString(payload.cache_target_age),
    last_refresh: asNullableString(payload.last_refresh),
    next_allowed_client_refresh: asNullableString(payload.next_allowed_client_refresh),
    resolved_date_range: asNullableObject(payload.resolved_date_range),
    raw: payload,
  };
}

async function posthogGetAsyncQueryStatus(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const queryId = requirePathString(input.input.query_id, "query_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/query/${encodeURIComponent(queryId)}/`,
    notFoundAsInvalidInput: true,
  });

  return mapQueryStatus(payload);
}

async function posthogCancelQuery(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const queryId = requirePathString(input.input.query_id, "query_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "DELETE",
    path: `/api/projects/${encodeURIComponent(projectId)}/query/${encodeURIComponent(queryId)}/`,
    notFoundAsInvalidInput: true,
  });

  return {
    cancelled: true,
    query_id: queryId,
    raw: payload,
  };
}

async function posthogCreateInsight(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/insights/`,
    body: buildInsightWriteBody(input.input),
  });

  return mapInsight(payload);
}

async function posthogUpdateInsight(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/insights/${encodeURIComponent(id)}/`,
    body: buildInsightWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });

  return mapInsight(payload);
}

async function posthogDeleteInsight(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "DELETE",
    path: `/api/projects/${encodeURIComponent(projectId)}/insights/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
    id,
    raw: payload,
  };
}

async function posthogListDashboards(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/`,
    query: compactObject({
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
      search: optionalRawString(input.input.search),
    }),
  });

  return {
    count: asNumber(payload.count) ?? 0,
    next: asNullableString(payload.next),
    previous: asNullableString(payload.previous),
    results: normalizeUnknownArray(payload.results).map((item) => mapDashboardBasic(item)),
    raw: payload,
  };
}

async function posthogGetDashboard(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/`,
    query: compactObject({
      filters_override: stringifyJsonQuery(input.input.filters_override),
      variables_override: stringifyJsonQuery(input.input.variables_override),
    }),
    notFoundAsInvalidInput: true,
  });

  return mapDashboard(payload);
}

async function posthogCreateDashboard(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/`,
    body: buildDashboardWriteBody(input.input),
  });

  return mapDashboard(payload);
}

async function posthogUpdateDashboard(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/`,
    body: buildDashboardWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });

  return mapDashboard(payload);
}

async function posthogDeleteDashboard(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/`,
    body: compactObject({
      deleted: true,
      delete_insights: optionalBoolean(input.input.delete_insights),
    }),
    notFoundAsInvalidInput: true,
  });
  const dashboard = mapDashboard(payload);

  return {
    deleted: true,
    id,
    dashboard,
    raw: payload,
  };
}

async function posthogRunDashboardInsights(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/run_insights/`,
    query: compactObject({
      filters_override: stringifyJsonQuery(input.input.filters_override),
      variables_override: stringifyJsonQuery(input.input.variables_override),
      output_format: optionalRawString(input.input.output_format),
      refresh: optionalRawString(input.input.refresh),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    results: normalizeUnknownArray(payload.results),
    raw: payload,
  };
}

async function posthogCopyDashboardTile(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/copy_tile/`,
    body: {
      fromDashboardId: asNumber(input.input.fromDashboardId),
      tileId: asNumber(input.input.tileId),
    },
    notFoundAsInvalidInput: true,
  });

  return mapDashboard(payload);
}

async function posthogMoveDashboardTile(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/move_tile/`,
    body: {
      tile: asNullableObject(input.input.tile) ?? {},
      toDashboard: asNumber(input.input.toDashboard),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    raw: payload,
  };
}

async function posthogReorderDashboardTiles(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(id)}/reorder_tiles/`,
    body: {
      tile_order: normalizeNumberArray(input.input.tile_order),
    },
    notFoundAsInvalidInput: true,
  });

  return mapDashboard(payload);
}

async function posthogListDashboardCollaborators(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const dashboardId = requirePathString(input.input.dashboard_id, "dashboard_id");
  const payload = await requestPosthogJson<unknown>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}/collaborators/`,
    notFoundAsInvalidInput: true,
  });

  return {
    results: normalizeUnknownArray(payload).map((item) => mapDashboardCollaborator(item)),
    raw: payload,
  };
}

async function posthogAddDashboardCollaborator(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const dashboardId = requirePathString(input.input.dashboard_id, "dashboard_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}/collaborators/`,
    body: {
      user_uuid: requirePathString(input.input.user_uuid, "user_uuid"),
      level: asNumber(input.input.level),
    },
    notFoundAsInvalidInput: true,
  });

  return mapDashboardCollaborator(payload);
}

async function posthogRemoveDashboardCollaborator(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const dashboardId = requirePathString(input.input.dashboard_id, "dashboard_id");
  const userUuid = requirePathString(input.input.user_uuid, "user_uuid");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "DELETE",
    path: `/api/environments/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}/collaborators/${encodeURIComponent(userUuid)}/`,
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
    dashboard_id: dashboardId,
    user_uuid: userUuid,
    raw: payload,
  };
}

async function posthogListFeatureFlags(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/`,
    query: compactObject({
      active: optionalRawString(input.input.active),
      created_by_id: optionalRawString(input.input.created_by_id),
      evaluation_runtime: optionalRawString(input.input.evaluation_runtime),
      excluded_properties: optionalRawString(input.input.excluded_properties),
      has_evaluation_contexts: optionalRawString(input.input.has_evaluation_contexts),
      limit: asNumber(input.input.limit),
      offset: asNumber(input.input.offset),
      search: optionalRawString(input.input.search),
      tags: optionalRawString(input.input.tags),
      type: optionalRawString(input.input.type),
    }),
  });

  return mapFeatureFlagList(payload);
}

async function posthogGetFeatureFlag(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/${encodeURIComponent(id)}/`,
    notFoundAsInvalidInput: true,
  });

  return mapFeatureFlag(payload);
}

async function posthogCreateFeatureFlag(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "POST",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/`,
    body: buildFeatureFlagWriteBody(input.input),
  });

  return mapFeatureFlag(payload);
}

async function posthogUpdateFeatureFlag(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/${encodeURIComponent(id)}/`,
    body: buildFeatureFlagWriteBody(input.input),
    notFoundAsInvalidInput: true,
  });

  return mapFeatureFlag(payload);
}

async function posthogDeleteFeatureFlag(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    method: "PATCH",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/${encodeURIComponent(id)}/`,
    body: {
      deleted: true,
    },
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
    id,
    feature_flag: mapFeatureFlag(payload),
    raw: payload,
  };
}

async function posthogGetFeatureFlagStatus(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/${encodeURIComponent(id)}/status/`,
    notFoundAsInvalidInput: true,
  });

  return mapFeatureFlagStatus(payload);
}

async function posthogGetFeatureFlagDependentFlags(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const id = requirePathString(input.input.id, "id");
  const payload = await requestPosthogJson<unknown>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/${encodeURIComponent(id)}/dependent_flags/`,
    notFoundAsInvalidInput: true,
  });

  return mapDependentFlags(payload);
}

async function posthogGetFeatureFlagsLocalEvaluation(input: PosthogProviderActionInput, fetcher: typeof fetch) {
  const auth = resolvePosthogAuthContext(input);
  const projectId = requirePathString(input.input.project_id, "project_id");
  const payload = await requestPosthogJson<Record<string, unknown>>({
    baseUrl: auth.baseUrl,
    bearerToken: auth.bearerToken,
    fetcher,
    mode: "execute",
    path: `/api/projects/${encodeURIComponent(projectId)}/feature_flags/local_evaluation/`,
    query: compactObject({
      send_cohorts: asNullableBoolean(input.input.send_cohorts),
    }),
    notFoundAsInvalidInput: true,
  });

  return mapFeatureFlagLocalEvaluation(payload);
}

async function fetchPosthogCurrentUser(input: {
  bearerToken: string;
  baseUrl: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
}) {
  return requestPosthogJson<Record<string, unknown>>({
    baseUrl: input.baseUrl,
    bearerToken: input.bearerToken,
    fetcher: input.fetcher,
    mode: input.mode,
    path: posthogValidationPath,
  });
}

async function resolveOrganizationId(
  input: PosthogProviderActionInput,
  auth: PosthogAuthContext,
  fetcher: typeof fetch,
) {
  const explicitOrganizationId = asOptionalPathString(input.input.organization_id);
  if (explicitOrganizationId) {
    return explicitOrganizationId;
  }

  const providerMetadataOrganizationId = optionalString(input.providerMetadata?.organizationId);
  if (providerMetadataOrganizationId) {
    return providerMetadataOrganizationId;
  }

  const user = await fetchPosthogCurrentUser({
    bearerToken: auth.bearerToken,
    baseUrl: auth.baseUrl,
    fetcher,
    mode: "execute",
  });
  const organizationId = extractCurrentOrganizationId(user);
  if (organizationId) {
    return organizationId;
  }

  throw new ProviderRequestError(
    400,
    "organization_id is required because the current organization could not be determined",
  );
}

async function requestPosthogJson<T>(input: PosthogRequestOptions): Promise<T> {
  const url = new URL(`${input.baseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: buildPosthogHeaders(input.bearerToken),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `posthog request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const providerError = await readPosthogError(response);
    throw mapPosthogError({
      mode: input.mode,
      status: response.status,
      error: providerError,
      notFoundAsInvalidInput: input.notFoundAsInvalidInput,
    });
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json().catch(() => ({}))) as T;
}

function buildPosthogHeaders(bearerToken: string) {
  return {
    authorization: `Bearer ${bearerToken}`,
    "content-type": "application/json",
    "user-agent": posthogUserAgent,
  };
}

async function readPosthogError(response: Response) {
  const text = await response.text().catch(() => "");
  let payload:
    | {
        type?: unknown;
        code?: unknown;
        detail?: unknown;
        message?: unknown;
        attr?: unknown;
      }
    | undefined;

  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as {
          type?: unknown;
          code?: unknown;
          detail?: unknown;
          message?: unknown;
          attr?: unknown;
        };
      }
    } catch {}
  }

  return {
    type: typeof payload?.type === "string" ? payload.type : "provider_error",
    code: typeof payload?.code === "string" ? payload.code : "provider_error",
    detail:
      typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.message === "string"
          ? payload.message
          : text || `posthog request failed with ${response.status}`,
    attr: typeof payload?.attr === "string" ? payload.attr : undefined,
  };
}

function mapPosthogError(input: {
  mode: "validate" | "execute";
  status: number;
  error: { code: string; detail: string; attr?: string };
  notFoundAsInvalidInput?: boolean;
}) {
  const message = input.error.attr ? `${input.error.detail} (${input.error.attr})` : input.error.detail;

  if (input.status === 401) {
    return new ProviderRequestError(input.mode === "validate" ? 400 : 401, message);
  }
  if (input.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (input.status === 404 && input.notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(input.status >= 500 ? 502 : input.status, message);
}

function normalizePosthogBaseUrl(value: string | undefined) {
  const baseUrl = optionalString(value);
  if (!baseUrl) {
    throw new ProviderRequestError(400, "Base URL is required");
  }

  const parsed = assertPublicHttpUrl(baseUrl, {
    fieldName: "Base URL",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "Base URL must use https");
  }
  if (parsed.username || parsed.password) {
    throw new ProviderRequestError(400, "Base URL must not include credentials");
  }

  let normalizedPath = parsed.pathname;
  while (normalizedPath.endsWith("/") && normalizedPath !== "/") {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  if (normalizedPath === "/") {
    normalizedPath = "";
  }
  return `${parsed.origin}${normalizedPath}`;
}

function resolveBaseUrlFromProviderMetadata(providerMetadata: Record<string, unknown> | undefined) {
  return normalizePosthogBaseUrl(optionalString(providerMetadata?.baseUrl));
}

function resolvePosthogAuthContext(input: PosthogProviderActionInput): PosthogAuthContext {
  const baseUrl = resolveBaseUrlFromProviderMetadata(input.providerMetadata);
  return {
    bearerToken: input.apiKey,
    baseUrl,
  };
}

function extractUserIdentifier(user: PosthogCurrentUser) {
  const uuid = optionalString(user.uuid);
  if (uuid) {
    return uuid;
  }

  const id = normalizeUnknownString(user.id);
  if (id) {
    return id;
  }

  throw new ProviderRequestError(502, "posthog current user response is missing an id");
}

function extractUserAccountLabel(user: PosthogCurrentUser) {
  const firstName = optionalString(user.first_name)?.trim();
  const lastName = optionalString(user.last_name)?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  const email = optionalString(user.email)?.trim();
  if (email) {
    return email;
  }

  return extractUserIdentifier(user);
}

function extractCurrentOrganizationId(user: Record<string, unknown>) {
  const currentOrganization = asNullableObject(user.organization);
  const currentOrganizationId = optionalString(currentOrganization?.id);
  if (currentOrganizationId) {
    return currentOrganizationId;
  }

  const organizations = normalizeUnknownArray(user.organizations);
  if (organizations.length === 1) {
    return optionalString(asNullableObject(organizations[0])?.id);
  }

  return undefined;
}

function requirePathString(value: unknown, fieldName: string) {
  const normalized = asOptionalPathString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function asOptionalPathString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asNullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value);
}

function asNullableString(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalRawString(value);
}

function asObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function buildCohortWriteBody(input: Record<string, unknown>) {
  return compactObject({
    name: asNullableString(input.name),
    description: optionalRawString(input.description),
    groups: input.groups,
    deleted: optionalBoolean(input.deleted),
    filters: asNullableObject(input.filters),
    query: input.query === null ? null : input.query,
    is_static: optionalBoolean(input.is_static),
    _create_in_folder: optionalRawString(input._create_in_folder),
    _create_static_person_ids: Array.isArray(input._create_static_person_ids)
      ? input._create_static_person_ids
      : undefined,
  });
}

function buildEventDefinitionWriteBody(input: Record<string, unknown>) {
  return compactObject({
    name: optionalRawString(input.name),
    owner: asNullableNumber(input.owner),
    description: asNullableString(input.description),
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    verified: optionalBoolean(input.verified),
    hidden: asNullableBoolean(input.hidden),
    enforcement_mode: optionalRawString(input.enforcement_mode),
    primary_property: asNullableString(input.primary_property),
    post_to_slack: optionalBoolean(input.post_to_slack),
    default_columns: normalizeStringArrayOrUndefined(input.default_columns),
  });
}

function buildPropertyDefinitionWriteBody(input: Record<string, unknown>) {
  return compactObject({
    description: asNullableString(input.description),
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    verified: optionalBoolean(input.verified),
    hidden: asNullableBoolean(input.hidden),
    property_type: asNullableString(input.property_type),
  });
}

function buildBulkUpdateTagsBody(input: Record<string, unknown>) {
  return {
    ids: normalizeNumberArray(input.ids),
    action: optionalRawString(input.action),
    tags: normalizeStringArray(input.tags),
  };
}

function buildAnnotationWriteBody(input: Record<string, unknown>) {
  return compactObject({
    content: asNullableString(input.content),
    date_marker: asNullableString(input.date_marker),
    creation_type: optionalRawString(input.creation_type),
    dashboard_item: asNullableNumber(input.dashboard_item),
    dashboard_id: asNullableNumber(input.dashboard_id),
    deleted: optionalBoolean(input.deleted),
    scope: optionalRawString(input.scope),
  });
}

function buildInsightWriteBody(input: Record<string, unknown>) {
  return compactObject({
    name: asNullableString(input.name),
    description: asNullableString(input.description),
    query: asNullableObject(input.query),
    filters: asNullableObject(input.filters),
    dashboards: Array.isArray(input.dashboards) ? input.dashboards : undefined,
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    refresh: asNullableString(input.refresh),
    saved: asNullableBoolean(input.saved),
    favorited: asNullableBoolean(input.favorited),
  });
}

function buildDashboardWriteBody(input: Record<string, unknown>) {
  return compactObject({
    name: asNullableString(input.name),
    description: optionalRawString(input.description),
    pinned: optionalBoolean(input.pinned),
    deleted: optionalBoolean(input.deleted),
    breakdown_colors: input.breakdown_colors,
    data_color_theme_id: asNullableNumber(input.data_color_theme_id),
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    restriction_level: asNumber(input.restriction_level),
    quick_filter_ids: Array.isArray(input.quick_filter_ids) ? input.quick_filter_ids : undefined,
    use_template: optionalRawString(input.use_template),
    use_dashboard: asNullableNumber(input.use_dashboard),
    delete_insights: optionalBoolean(input.delete_insights),
    _create_in_folder: optionalRawString(input._create_in_folder),
  });
}

function buildFeatureFlagWriteBody(input: Record<string, unknown>) {
  return compactObject({
    key: optionalRawString(input.key),
    name: optionalRawString(input.name),
    filters: asNullableObject(input.filters),
    active: optionalBoolean(input.active),
    tags: normalizeStringArrayOrUndefined(input.tags),
    evaluation_contexts: normalizeStringArrayOrUndefined(input.evaluation_contexts),
  });
}

function asNullableObject(value: unknown) {
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asLooseObject(value: unknown) {
  return asNullableObject(value) ?? {};
}

function normalizeUnknownArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeUnknownString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asNullableNumber(value: unknown) {
  if (value === null) {
    return null;
  }
  return asNumber(value);
}

function stringifyJsonQuery(value: unknown) {
  const object = asNullableObject(value);
  if (!object) {
    return undefined;
  }
  return JSON.stringify(object);
}

function requireNonEmptyStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }

  const normalized = value.filter((item): item is string => typeof item === "string" && !!item);
  if (normalized.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }

  return normalized;
}

function mapInsight(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: requireInsightId(payload),
    short_id: optionalRawString(payload.short_id),
    name: asNullableString(payload.name),
    derived_name: asNullableString(payload.derived_name),
    query: asNullableObject(payload.query),
    order: asNumber(payload.order),
    deleted: optionalBoolean(payload.deleted),
    dashboards: normalizeUnknownArray(payload.dashboards),
    dashboard_tiles: normalizeUnknownArray(payload.dashboard_tiles).map((item) => asLooseObject(item)),
    last_refresh: asNullableString(payload.last_refresh),
    cache_target_age: asNullableString(payload.cache_target_age),
    next_allowed_client_refresh: asNullableString(payload.next_allowed_client_refresh),
    result: payload.result,
    hasMore: asNullableBoolean(payload.hasMore),
    columns: Array.isArray(payload.columns)
      ? payload.columns.filter((item): item is string => typeof item === "string")
      : undefined,
    created_at: asNullableString(payload.created_at),
    created_by: asNullableObject(payload.created_by),
    description: asNullableString(payload.description),
    updated_at: optionalRawString(payload.updated_at),
    tags: normalizeUnknownArray(payload.tags),
    favorited: optionalBoolean(payload.favorited),
    last_modified_at: optionalRawString(payload.last_modified_at),
    last_modified_by: asNullableObject(payload.last_modified_by),
    is_sample: optionalBoolean(payload.is_sample),
    effective_restriction_level: asNumber(payload.effective_restriction_level),
    effective_privilege_level: asNumber(payload.effective_privilege_level),
    user_access_level: asNullableString(payload.user_access_level),
    timezone: asNullableString(payload.timezone),
    is_cached: optionalBoolean(payload.is_cached),
    query_status: asNullableObject(payload.query_status),
    hogql: asNullableString(payload.hogql),
    types: Array.isArray(payload.types) ? payload.types : undefined,
    resolved_date_range: asNullableObject(payload.resolved_date_range),
    alerts: normalizeUnknownArray(payload.alerts),
    last_viewed_at: asNullableString(payload.last_viewed_at),
    raw: payload,
  };
}

function mapDashboardBasic(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: requireDashboardId(payload),
    name: asNullableString(payload.name),
    description: optionalRawString(payload.description),
    pinned: optionalBoolean(payload.pinned),
    created_at: optionalRawString(payload.created_at),
    created_by: asNullableObject(payload.created_by),
    last_accessed_at: asNullableString(payload.last_accessed_at),
    last_viewed_at: asNullableString(payload.last_viewed_at),
    is_shared: optionalBoolean(payload.is_shared),
    deleted: optionalBoolean(payload.deleted),
    creation_mode: optionalRawString(payload.creation_mode),
    tags: normalizeUnknownArray(payload.tags),
    restriction_level: asNumber(payload.restriction_level),
    effective_restriction_level: asNumber(payload.effective_restriction_level),
    effective_privilege_level: asNumber(payload.effective_privilege_level),
    user_access_level: asNullableString(payload.user_access_level),
    access_control_version: optionalRawString(payload.access_control_version),
    last_refresh: asNullableString(payload.last_refresh),
    team_id: asNumber(payload.team_id),
  };
}

function mapDashboard(value: unknown) {
  const payload = asLooseObject(value);
  return {
    ...mapDashboardBasic(payload),
    filters: asNullableObject(payload.filters),
    variables: asNullableObject(payload.variables),
    breakdown_colors: payload.breakdown_colors,
    data_color_theme_id: asNullableNumber(payload.data_color_theme_id),
    persisted_filters: asNullableObject(payload.persisted_filters),
    persisted_variables: asNullableObject(payload.persisted_variables),
    quick_filter_ids: Array.isArray(payload.quick_filter_ids)
      ? payload.quick_filter_ids.filter((item): item is string => typeof item === "string")
      : undefined,
    tiles: Array.isArray(payload.tiles) ? payload.tiles.map((item) => asLooseObject(item)) : null,
    raw: payload,
  };
}

function mapAnnotationList(payload: Record<string, unknown>) {
  const results = normalizeUnknownArray(payload.results).map((item) => mapAnnotation(item));
  return {
    count: asNumber(payload.count) ?? results.length,
    next: asNullableString(payload.next),
    previous: asNullableString(payload.previous),
    results,
    raw: payload,
  };
}

function mapAnnotation(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: requireNumericId(payload, "annotation"),
    content: asNullableString(payload.content),
    date_marker: asNullableString(payload.date_marker),
    creation_type: optionalRawString(payload.creation_type),
    dashboard_item: asNullableNumber(payload.dashboard_item),
    dashboard_id: asNullableNumber(payload.dashboard_id),
    dashboard_name: asNullableString(payload.dashboard_name),
    insight_short_id: asNullableString(payload.insight_short_id),
    insight_name: asNullableString(payload.insight_name),
    insight_derived_name: asNullableString(payload.insight_derived_name),
    created_by: asNullableObject(payload.created_by),
    created_at: asNullableString(payload.created_at),
    updated_at: optionalRawString(payload.updated_at),
    deleted: optionalBoolean(payload.deleted),
    scope: optionalRawString(payload.scope),
    raw: payload,
  };
}

function mapBulkUpdateTags(payload: Record<string, unknown>) {
  return {
    updated: normalizeUnknownArray(payload.updated),
    skipped: normalizeUnknownArray(payload.skipped),
    raw: payload,
  };
}

function mapDashboardCollaborator(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: optionalRawString(payload.id),
    dashboard_id: asNumber(payload.dashboard_id),
    user: asNullableObject(payload.user) ?? {},
    level: asNumber(payload.level),
    added_at: optionalRawString(payload.added_at),
    updated_at: optionalRawString(payload.updated_at),
    raw: payload,
  };
}

function mapFeatureFlagList(payload: Record<string, unknown>) {
  const results = normalizeUnknownArray(payload.results).map((item) => mapFeatureFlag(item));
  return {
    count: asNumber(payload.count) ?? results.length,
    next: asNullableString(payload.next),
    previous: asNullableString(payload.previous),
    results,
    raw: payload,
  };
}

function mapFeatureFlag(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: requireFeatureFlagId(payload),
    key: optionalRawString(payload.key),
    name: optionalRawString(payload.name),
    active: optionalBoolean(payload.active),
    filters: asNullableObject(payload.filters) ?? {},
    deleted: optionalBoolean(payload.deleted),
    created_at: asNullableString(payload.created_at),
    updated_at: asNullableString(payload.updated_at),
    created_by: asNullableObject(payload.created_by),
    last_modified_by: asNullableObject(payload.last_modified_by),
    version: asNumber(payload.version),
    ensure_experience_continuity: asNullableBoolean(payload.ensure_experience_continuity),
    experiment_set: normalizeNumberArray(payload.experiment_set),
    experiment_set_metadata: normalizeUnknownArray(payload.experiment_set_metadata).map((item) => asLooseObject(item)),
    surveys: asNullableObject(payload.surveys),
    features: asNullableObject(payload.features),
    rollback_conditions: payload.rollback_conditions === null ? null : payload.rollback_conditions,
    performed_rollback: asNullableBoolean(payload.performed_rollback),
    can_edit: asNullableBoolean(payload.can_edit),
    status: asNullableString(payload.status),
    evaluation_runtime: asNullableString(payload.evaluation_runtime),
    bucketing_identifier: asNullableString(payload.bucketing_identifier),
    last_called_at: asNullableString(payload.last_called_at),
    user_access_level: asNullableString(payload.user_access_level),
    rollout_percentage: asNullableNumber(payload.rollout_percentage),
    tags: normalizeUnknownArray(payload.tags),
    evaluation_contexts: normalizeStringArray(payload.evaluation_contexts),
    usage_dashboard: asNumber(payload.usage_dashboard),
    analytics_dashboards: normalizeNumberArray(payload.analytics_dashboards),
    has_enriched_analytics: asNullableBoolean(payload.has_enriched_analytics),
    is_remote_configuration: asNullableBoolean(payload.is_remote_configuration),
    has_encrypted_payloads: asNullableBoolean(payload.has_encrypted_payloads),
    is_used_in_replay_settings: asNullableBoolean(payload.is_used_in_replay_settings),
    raw: payload,
  };
}

function mapFeatureFlagStatus(payload: Record<string, unknown>) {
  return {
    status: optionalRawString(payload.status),
    reason: optionalRawString(payload.reason),
    active: asNullableBoolean(payload.active),
    deleted: asNullableBoolean(payload.deleted),
    last_called_at: asNullableString(payload.last_called_at),
    status_code: asNullableNumber(payload.status_code),
    raw: payload,
  };
}

function mapDependentFlags(payload: unknown) {
  return {
    results: normalizeUnknownArray(payload).map((item) => mapDependentFlag(item)),
    raw: Array.isArray(payload) ? payload : {},
  };
}

function mapDependentFlag(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: requireFeatureFlagId(payload),
    key: optionalRawString(payload.key),
    name: optionalRawString(payload.name),
  };
}

function mapFeatureFlagLocalEvaluation(payload: Record<string, unknown>) {
  return {
    flags: normalizeUnknownArray(payload.flags).map((item) => mapMinimalFeatureFlag(item)),
    group_type_mapping: asNullableObject(payload.group_type_mapping) ?? {},
    cohorts: asNullableObject(payload.cohorts) ?? {},
    raw: payload,
  };
}

function mapMinimalFeatureFlag(value: unknown) {
  const payload = asLooseObject(value);
  return {
    id: requireFeatureFlagId(payload),
    team_id: asNumber(payload.team_id),
    name: optionalRawString(payload.name),
    key: optionalRawString(payload.key),
    filters: asNullableObject(payload.filters) ?? {},
    deleted: optionalBoolean(payload.deleted),
    active: optionalBoolean(payload.active),
    ensure_experience_continuity: asNullableBoolean(payload.ensure_experience_continuity),
    version: asNumber(payload.version),
    evaluation_runtime: asNullableString(payload.evaluation_runtime),
    bucketing_identifier: asNullableString(payload.bucketing_identifier),
    evaluation_contexts: normalizeStringArray(payload.evaluation_contexts),
    raw: payload,
  };
}

function requireInsightId(payload: Record<string, unknown>) {
  const id = asNumber(payload.id);
  if (id !== undefined) {
    return id;
  }
  throw new ProviderRequestError(502, "posthog insight response is missing id");
}

function requireDashboardId(payload: Record<string, unknown>) {
  const id = asNumber(payload.id);
  if (id !== undefined) {
    return id;
  }
  throw new ProviderRequestError(502, "posthog dashboard response is missing id");
}

function requireFeatureFlagId(payload: Record<string, unknown>) {
  const id = asNumber(payload.id);
  if (id !== undefined) {
    return id;
  }
  throw new ProviderRequestError(502, "posthog feature flag response is missing id");
}

function requireNumericId(payload: Record<string, unknown>, label: string) {
  const id = asNumber(payload.id);
  if (id !== undefined) {
    return id;
  }
  throw new ProviderRequestError(502, `posthog ${label} response is missing id`);
}

function mapQueryStatus(payload: Record<string, unknown>) {
  return {
    id: optionalString(payload.id) ?? normalizeUnknownString(payload.query_id),
    query_status: asNullableObject(payload.query_status) ?? payload,
    complete: optionalBoolean(payload.complete),
    results: Array.isArray(payload.results) ? payload.results : undefined,
    error: payload.error,
    raw: payload,
  };
}

function normalizeStringArray(value: unknown) {
  return normalizeUnknownArray(value).filter((item): item is string => typeof item === "string");
}

function normalizeStringArrayOrUndefined(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function normalizeNumberArray(value: unknown) {
  return normalizeUnknownArray(value).filter((item): item is number => typeof item === "number");
}

function joinStringArray(value: unknown) {
  const items = normalizeStringArray(value);
  return items.length > 0 ? items.join(",") : undefined;
}
