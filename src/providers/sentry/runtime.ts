import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRawString, rawStringOrNull } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { sentryProviderScopes } from "./scopes.ts";

export const sentryApiBaseUrl: string = "https://sentry.io/api/0/";
const sentryCurrentUserUrl = `${sentryApiBaseUrl}users/me/`;

type SentryJsonResponse = {
  payload: unknown;
  headers: Headers;
};

type SentryActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

export const sentryActionHandlers: ProviderActionHandlers<"sentry", SentryActionHandler> = {
  list_organization_integrations(input, context) {
    return sentryListOrganizationIntegrations(input, context.accessToken, context.fetcher);
  },
  get_organization_integration(input, context) {
    return sentryGetOrganizationIntegration(input, context.accessToken, context.fetcher);
  },
  get_organization_integration_config(input, context) {
    return sentryGetOrganizationIntegrationConfig(input, context.accessToken, context.fetcher);
  },
  list_organization_sentry_apps(input, context) {
    return sentryListOrganizationSentryApps(input, context.accessToken, context.fetcher);
  },
  get_sentry_app(input, context) {
    return sentryGetSentryApp(input, context.accessToken, context.fetcher);
  },
  list_organization_projects(input, context) {
    return sentryListOrganizationProjects(input, context.accessToken, context.fetcher);
  },
  get_project(input, context) {
    return sentryGetProject(input, context.accessToken, context.fetcher);
  },
  list_organization_issues(input, context) {
    return sentryListOrganizationIssues(input, context.accessToken, context.fetcher);
  },
  get_issue(input, context) {
    return sentryGetIssue(input, context.accessToken, context.fetcher);
  },
  get_issue_event(input, context) {
    return sentryGetIssueEvent(input, context.accessToken, context.fetcher);
  },
  list_issue_events(input, context) {
    return sentryListIssueEvents(input, context.accessToken, context.fetcher);
  },
  update_issue(input, context) {
    return sentryUpdateIssue(input, context.accessToken, context.fetcher);
  },
  list_organization_releases(input, context) {
    return sentryListOrganizationReleases(input, context.accessToken, context.fetcher);
  },
  get_organization_release(input, context) {
    return sentryGetOrganizationRelease(input, context.accessToken, context.fetcher);
  },
  get_release_health_stats(input, context) {
    return sentryGetReleaseHealthStats(input, context.accessToken, context.fetcher);
  },
  list_organization_replays(input, context) {
    return sentryListOrganizationReplays(input, context.accessToken, context.fetcher);
  },
  get_replay(input, context) {
    return sentryGetReplay(input, context.accessToken, context.fetcher);
  },
  list_alerts(input, context) {
    return sentryListAlerts(input, context.accessToken, context.fetcher);
  },
  get_alert(input, context) {
    return sentryGetAlert(input, context.accessToken, context.fetcher);
  },
};

export async function validateSentryCredential(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const { payload } = await requestSentryJson(accessToken, sentryCurrentUserUrl, fetcher, {}, "validate");
  const user = asRecord(payload);
  if (!user) {
    throw new ProviderRequestError(502, "sentry current user payload is invalid");
  }
  const userId = pickString(user.id, user.username, user.email);
  const displayName = pickString(user.name, user.username, user.email, user.id);
  if (!userId || !displayName) {
    throw new ProviderRequestError(502, "sentry current user payload is invalid");
  }

  return {
    profile: {
      accountId: userId,
      displayName,
    },
    grantedScopes: sentryProviderScopes,
    metadata: compactObject({
      validationEndpoint: "/users/me/",
      userId,
      username: optionalRawString(user.username),
      email: optionalRawString(user.email),
      name: optionalRawString(user.name),
    }),
  };
}

async function sentryListOrganizationIntegrations(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/integrations/`,
      compactObject({
        providerKey: asOptionalString(input.providerKey),
        includeConfig: typeof input.includeConfig === "boolean" ? input.includeConfig : undefined,
        features: asOptionalStringArray(input.features),
      }),
    ),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry integrations response is invalid");
  }

  return {
    integrations: payload.map((item) => normalizeOrganizationIntegration(item)),
  };
}

async function sentryGetOrganizationIntegration(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const integrationId = String(input.integrationId);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/integrations/${encodeSentryPathSegment(integrationId)}/`,
    ),
    fetcher,
  );

  return {
    integration: normalizeOrganizationIntegration(expectRecord(payload, "sentry integration payload is invalid")),
  };
}

async function sentryGetOrganizationIntegrationConfig(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/config/integrations/`, {
      providerKey: asOptionalString(input.providerKey),
    }),
    fetcher,
  );
  const providers = unwrapIntegrationProviders(payload).map((item) => normalizeIntegrationProvider(item));

  return { providers };
}

async function sentryListOrganizationSentryApps(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/sentry-apps/`),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry apps response is invalid");
  }

  return {
    sentryApps: payload.map((item) => normalizeSentryApp(item)),
  };
}

async function sentryGetSentryApp(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const sentryAppIdOrSlug = String(input.sentryAppIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`sentry-apps/${encodeSentryPathSegment(sentryAppIdOrSlug)}/`),
    fetcher,
  );

  return {
    sentryApp: normalizeSentryApp(expectRecord(payload, "sentry app payload is invalid")),
  };
}

async function sentryListOrganizationProjects(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload, headers } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/projects/`, {
      cursor: asOptionalString(input.cursor),
    }),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry projects response is invalid");
  }

  return {
    projects: payload.map((item) => normalizeSentryProject(item)),
    ...parseSentryPaginationCursors(headers),
  };
}

async function sentryGetProject(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const projectIdOrSlug = String(input.projectIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `projects/${encodeSentryPathSegment(organizationIdOrSlug)}/${encodeSentryPathSegment(projectIdOrSlug)}/`,
    ),
    fetcher,
  );

  return {
    project: normalizeSentryProject(expectRecord(payload, "sentry project payload is invalid")),
  };
}

async function sentryListOrganizationIssues(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload, headers } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/issues/`, {
      query: asOptionalString(input.query),
      sort: asOptionalString(input.sort),
      limit: asOptionalInteger(input.limit),
      start: asOptionalString(input.start),
      end: asOptionalString(input.end),
      cursor: asOptionalString(input.cursor),
      expand: asOptionalStringArray(input.expand),
      collapse: asOptionalStringArray(input.collapse),
      environment: asOptionalStringArray(input.environments),
      project: asOptionalIntegerArray(input.projectIds),
      statsPeriod: asOptionalString(input.statsPeriod),
      shortIdLookup: typeof input.shortIdLookup === "boolean" ? oneZeroFlag(input.shortIdLookup) : undefined,
      groupStatsPeriod: asOptionalString(input.groupStatsPeriod),
      viewId: asOptionalString(input.viewId),
    }),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry issues response is invalid");
  }

  return {
    issues: payload.map((item) => normalizeSentryIssue(item)),
    ...parseSentryPaginationCursors(headers),
  };
}

async function sentryGetIssue(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const issueId = String(input.issueId);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/issues/${encodeSentryPathSegment(issueId)}/`,
    ),
    fetcher,
  );

  return {
    issue: normalizeSentryIssue(expectRecord(payload, "sentry issue payload is invalid")),
  };
}

async function sentryGetIssueEvent(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const issueId = String(input.issueId);
  const eventId = String(input.eventId);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/issues/${encodeSentryPathSegment(issueId)}/events/${encodeSentryPathSegment(eventId)}/`,
      {
        environment: asOptionalStringArray(input.environments),
      },
    ),
    fetcher,
  );

  return {
    event: normalizeSentryIssueEvent(expectRecord(payload, "sentry issue event payload is invalid")),
  };
}

async function sentryListIssueEvents(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const issueId = String(input.issueId);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/issues/${encodeSentryPathSegment(issueId)}/events/`,
      {
        full: typeof input.full === "boolean" ? input.full : undefined,
        sample: typeof input.sample === "boolean" ? input.sample : undefined,
        query: asOptionalString(input.query),
        start: asOptionalString(input.start),
        end: asOptionalString(input.end),
        environment: asOptionalStringArray(input.environments),
        statsPeriod: asOptionalString(input.statsPeriod),
      },
    ),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry issue events response is invalid");
  }

  return {
    events: payload.map((item) => normalizeSentryIssueEvent(item)),
  };
}

async function sentryUpdateIssue(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const issueId = String(input.issueId);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/issues/${encodeSentryPathSegment(issueId)}/`,
    ),
    fetcher,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(
        compactObject({
          status: asOptionalString(input.status),
          hasSeen: typeof input.hasSeen === "boolean" ? input.hasSeen : undefined,
          isPublic: typeof input.isPublic === "boolean" ? input.isPublic : undefined,
          assignedTo: asOptionalString(input.assignedTo),
          isBookmarked: typeof input.isBookmarked === "boolean" ? input.isBookmarked : undefined,
          isSubscribed: typeof input.isSubscribed === "boolean" ? input.isSubscribed : undefined,
          statusDetails: normalizeIssueStatusDetailsInput(input.statusDetails),
        }),
      ),
    },
  );

  return {
    issue: normalizeSentryIssue(expectRecord(payload, "sentry issue payload is invalid")),
  };
}

async function sentryListOrganizationReleases(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/releases/`, {
      query: asOptionalString(input.query),
    }),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry releases response is invalid");
  }

  return {
    releases: payload.map((item) => normalizeSentryRelease(item)),
  };
}

async function sentryGetOrganizationRelease(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const version = String(input.version);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/releases/${encodeSentryPathSegment(version)}/`,
      compactObject({
        sort: asOptionalString(input.sort),
        query: asOptionalString(input.query),
        health: typeof input.health === "boolean" ? input.health : undefined,
        status: asOptionalString(input.status),
        project: asOptionalString(input.projectId),
        adoptionStages: typeof input.adoptionStages === "boolean" ? input.adoptionStages : undefined,
        healthStatsPeriod: asOptionalString(input.healthStatsPeriod),
        summaryStatsPeriod: asOptionalString(input.summaryStatsPeriod),
      }),
    ),
    fetcher,
  );

  return {
    release: normalizeSentryRelease(expectRecord(payload, "sentry release payload is invalid")),
  };
}

async function sentryGetReleaseHealthStats(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const version = String(input.version);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/sessions/`, {
      field: asOptionalStringArray(input.fields),
      groupBy: asOptionalStringArray(input.groupBy),
      query: joinSentrySearchClauses(`release:${version}`, asOptionalString(input.query)),
      start: asOptionalString(input.start),
      end: asOptionalString(input.end),
      environment: asOptionalStringArray(input.environments),
      project: asOptionalIntegerArray(input.projectIds),
      interval: asOptionalString(input.interval),
      statsPeriod: asOptionalString(input.statsPeriod),
      includeSeries: asOptionalInteger(input.includeSeries),
      includeTotals: asOptionalInteger(input.includeTotals),
      per_page: asOptionalInteger(input.perPage),
      orderBy: asOptionalString(input.orderBy),
    }),
    fetcher,
  );

  const body = expectRecord(payload, "sentry release health stats payload is invalid");
  return {
    groups: normalizeReleaseHealthGroups(body.groups),
    intervals: stringArray(body.intervals),
    start: rawStringOrNull(body.start),
    end: rawStringOrNull(body.end),
  };
}

async function sentryListOrganizationReplays(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload, headers } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/replays/`, {
      start: asOptionalString(input.start),
      end: asOptionalString(input.end),
      sort: asOptionalString(input.sort),
      field: asOptionalStringArray(input.field),
      query: asOptionalString(input.query),
      cursor: asOptionalString(input.cursor),
      project: asOptionalIntegerArray(input.projectIds),
      per_page: asOptionalInteger(input.perPage),
      environment: asOptionalString(input.environment),
      statsPeriod: asOptionalString(input.statsPeriod),
    }),
    fetcher,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "sentry replays response is invalid");
  }

  return {
    replays: payload.map((item) => normalizeSentryReplay(item)),
    ...parseSentryPaginationCursors(headers),
  };
}

async function sentryGetReplay(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const replayId = String(input.replayId);
  const { payload, headers } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/replays/${encodeSentryPathSegment(replayId)}/`,
      {
        start: asOptionalString(input.start),
        end: asOptionalString(input.end),
        sort: asOptionalString(input.sort),
        field: asOptionalStringArray(input.field),
        query: asOptionalString(input.query),
        cursor: asOptionalString(input.cursor),
        project: asOptionalIntegerArray(input.projectIds),
        per_page: asOptionalInteger(input.perPage),
        environment: asOptionalString(input.environment),
        statsPeriod: asOptionalString(input.statsPeriod),
      },
    ),
    fetcher,
  );

  return {
    replay: normalizeSentryReplay(expectRecord(payload, "sentry replay payload is invalid")),
    ...parseSentryPaginationCursors(headers),
  };
}

async function sentryListAlerts(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(`organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/workflows/`, {
      id: asOptionalStringArray(input.ids),
      query: asOptionalString(input.query),
      sortBy: asOptionalString(input.sortBy),
      project: asOptionalIntegerArray(input.projectIds),
    }),
    fetcher,
  );

  return {
    alerts: unwrapSentryWorkflowList(payload).map((item) => normalizeSentryAlert(item)),
  };
}

async function sentryGetAlert(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const organizationIdOrSlug = String(input.organizationIdOrSlug);
  const alertId = String(input.alertId);
  const { payload } = await requestSentryJson(
    accessToken,
    buildSentryApiUrl(
      `organizations/${encodeSentryPathSegment(organizationIdOrSlug)}/workflows/${encodeSentryPathSegment(alertId)}/`,
    ),
    fetcher,
  );

  return {
    alert: normalizeSentryAlert(expectRecord(unwrapSentryWorkflowItem(payload), "sentry alert payload is invalid")),
  };
}

async function requestSentryJson(
  accessToken: string,
  url: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
  phase: "validate" | "execute" = "execute",
): Promise<SentryJsonResponse> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept", "application/json");

  const response = await fetcher(url, {
    ...init,
    headers,
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeSentryError(response.status, payload, "sentry api request failed", phase);
  }

  return {
    payload,
    headers: response.headers,
  };
}

function parseSentryPaginationCursors(headers: Headers) {
  const pagination = {
    nextCursor: null as string | null,
    previousCursor: null as string | null,
  };
  const linkHeader = headers.get("link");
  if (!isNonEmptyString(linkHeader)) {
    return pagination;
  }

  for (const entry of splitLinkHeader(linkHeader)) {
    const rel = entry.match(/\brel="([^"]+)"/)?.[1];
    if (rel !== "next" && rel !== "previous") {
      continue;
    }

    const hasResults = entry.match(/\bresults="([^"]+)"/)?.[1] !== "false";
    if (!hasResults) {
      continue;
    }

    const cursor = parseSentryLinkCursor(entry);
    if (!cursor) {
      continue;
    }

    if (rel === "next") {
      pagination.nextCursor = cursor;
      continue;
    }

    pagination.previousCursor = cursor;
  }

  return pagination;
}

function splitLinkHeader(value: string) {
  const entries: string[] = [];
  let current = "";
  let insideQuotes = false;
  let insideAngleBrackets = false;

  for (const character of value) {
    if (character === '"') {
      insideQuotes = !insideQuotes;
      current += character;
      continue;
    }

    if (!insideQuotes) {
      if (character === "<") {
        insideAngleBrackets = true;
      } else if (character === ">") {
        insideAngleBrackets = false;
      } else if (character === "," && !insideAngleBrackets) {
        const entry = current.trim();
        if (entry) {
          entries.push(entry);
        }
        current = "";
        continue;
      }
    }

    current += character;
  }

  const entry = current.trim();
  if (entry) {
    entries.push(entry);
  }

  return entries;
}

function parseSentryLinkCursor(value: string) {
  const directCursor = value.match(/\bcursor="([^"]*)"/)?.[1];
  if (isNonEmptyString(directCursor)) {
    return directCursor;
  }

  const urlString = value.match(/<([^>]*)>/)?.[1];
  if (!isNonEmptyString(urlString)) {
    return null;
  }

  try {
    return new URL(urlString).searchParams.get("cursor");
  } catch {
    return null;
  }
}

function buildSentryApiUrl(
  path: string,
  query?: Record<string, string | number | boolean | Array<string | number> | undefined>,
) {
  const url = new URL(path, sentryApiBaseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function normalizeOrganizationIntegration(value: unknown) {
  const body = expectRecord(value, "sentry integration payload is invalid");

  return {
    id: optionalRawString(body.id) ?? "",
    name: optionalRawString(body.name) ?? "",
    icon: rawStringOrNull(body.icon),
    domainName: rawStringOrNull(body.domainName),
    accountType: rawStringOrNull(body.accountType),
    scopes: nullableStringArray(body.scopes),
    status: rawStringOrNull(body.status),
    provider: normalizeIntegrationProvider(body.provider),
    configOrganization: looseArray(body.configOrganization),
    configData: asRecord(body.configData ?? body.config_data) ?? {},
    externalId: rawStringOrNull(body.externalId),
    organizationId: nullableInteger(body.organizationId),
    organizationIntegrationStatus: rawStringOrNull(body.organizationIntegrationStatus),
    gracePeriodEnd: rawStringOrNull(body.gracePeriodEnd),
  };
}

function normalizeIntegrationProvider(value: unknown) {
  const body = expectRecord(value, "sentry integration provider payload is invalid");

  return {
    key: optionalRawString(body.key) ?? "",
    slug: optionalRawString(body.slug) ?? "",
    name: optionalRawString(body.name) ?? "",
    canAdd: booleanValue(body.canAdd),
    canDisable: booleanValue(body.canDisable),
    features: stringArray(body.features),
    aspects: asRecord(body.aspects) ?? {},
    metadata: normalizeIntegrationProviderMetadata(body.metadata),
    setupDialog: normalizeSetupDialog(body.setupDialog),
  };
}

function unwrapIntegrationProviders(value: unknown) {
  const body = expectRecord(value, "sentry integration config payload is invalid");
  if (!Array.isArray(body.providers)) {
    throw new ProviderRequestError(502, "sentry integration config payload is missing providers");
  }

  return body.providers;
}

function normalizeIntegrationProviderMetadata(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    noun: rawStringOrNull(body.noun),
    author: rawStringOrNull(body.author),
    description: rawStringOrNull(body.description),
    issueUrl: rawStringOrNull(body.issueUrl ?? body.issue_url),
    sourceUrl: rawStringOrNull(body.sourceUrl ?? body.source_url),
    aspects: asRecord(body.aspects) ?? null,
    features: looseArray(body.features),
  };
}

function normalizeSetupDialog(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    url: rawStringOrNull(body.url),
    width: nullableInteger(body.width),
    height: nullableInteger(body.height),
  };
}

function normalizeSentryApp(value: unknown) {
  const body = expectRecord(value, "sentry app payload is invalid");

  return {
    name: optionalRawString(body.name) ?? "",
    slug: optionalRawString(body.slug) ?? "",
    uuid: optionalRawString(body.uuid) ?? "",
    owner: normalizeSentryAppOwner(body.owner),
    author: rawStringOrNull(body.author),
    events: stringArray(body.events),
    schema: body.schema ?? null,
    scopes: stringArray(body.scopes),
    status: optionalRawString(body.status) ?? "",
    avatars: normalizeSentryAppAvatars(body.avatars),
    clientId: rawStringOrNull(body.clientId),
    metadata: body.metadata ?? null,
    overview: rawStringOrNull(body.overview),
    popularity: nullableInteger(body.popularity),
    webhookUrl: rawStringOrNull(body.webhookUrl),
    featureData: looseArray(body.featureData),
    isAlertable: booleanValue(body.isAlertable),
    redirectUrl: rawStringOrNull(body.redirectUrl),
    hasClientSecret: isNonEmptyString(body.clientSecret),
    verifyInstall: booleanValue(body.verifyInstall),
    allowedOrigins: stringArray(body.allowedOrigins),
  };
}

function normalizeSentryAppOwner(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: nullableInteger(body.id),
    slug: rawStringOrNull(body.slug),
  };
}

function normalizeSentryAppAvatars(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const body = asRecord(item);
    if (!body) {
      return [];
    }

    return [
      {
        avatarType: optionalRawString(body.avatarType) ?? "",
        avatarUuid: optionalRawString(body.avatarUuid) ?? "",
        avatarUrl: optionalRawString(body.avatarUrl) ?? "",
        color: booleanValue(body.color),
        photoType: optionalRawString(body.photoType) ?? "",
      },
    ];
  });
}

function normalizeSentryProject(value: unknown) {
  const body = expectRecord(value, "sentry project payload is invalid");

  return {
    id: optionalRawString(body.id) ?? "",
    slug: optionalRawString(body.slug) ?? "",
    name: optionalRawString(body.name) ?? "",
    platform: rawStringOrNull(body.platform),
    status: rawStringOrNull(body.status),
    dateCreated: rawStringOrNull(body.dateCreated),
    isBookmarked: booleanValue(body.isBookmarked),
    isMember: booleanValue(body.isMember),
    hasAccess: booleanValue(body.hasAccess),
    features: stringArray(body.features),
    environments: stringArray(body.environments),
    team: normalizeSentryTeam(body.team),
    teams: normalizeSentryTeams(body.teams),
  };
}

function normalizeSentryTeam(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: rawStringOrNull(body.id),
    slug: rawStringOrNull(body.slug),
    name: rawStringOrNull(body.name),
  };
}

function normalizeSentryTeams(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const team = normalizeSentryTeam(item);
    return team ? [team] : [];
  });
}

function normalizeSentryProjectSummary(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: optionalRawString(body.id) ?? "",
    slug: optionalRawString(body.slug) ?? "",
    name: optionalRawString(body.name) ?? "",
    platform: rawStringOrNull(body.platform),
  };
}

function normalizeSentryIssue(value: unknown) {
  const body = expectRecord(value, "sentry issue payload is invalid");

  return {
    id: optionalRawString(body.id) ?? "",
    shortId: rawStringOrNull(body.shortId),
    title: rawStringOrNull(body.title),
    culprit: rawStringOrNull(body.culprit),
    level: rawStringOrNull(body.level),
    status: rawStringOrNull(body.status),
    count: rawStringOrNull(body.count),
    userCount: nullableInteger(body.userCount),
    firstSeen: rawStringOrNull(body.firstSeen),
    lastSeen: rawStringOrNull(body.lastSeen),
    permalink: rawStringOrNull(body.permalink),
    logger: rawStringOrNull(body.logger),
    isBookmarked: booleanValue(body.isBookmarked),
    isSubscribed: booleanValue(body.isSubscribed),
    hasSeen: booleanValue(body.hasSeen),
    isPublic: booleanValue(body.isPublic),
    project: normalizeSentryProjectSummary(body.project),
    assignedTo: normalizeSentryIssueActor(body.assignedTo),
    statusDetails: normalizeSentryIssueStatusDetails(body.statusDetails),
    metadata: body.metadata ?? null,
    stats: body.stats ?? null,
    tags: normalizeSentryIssueTags(body.tags),
  };
}

function normalizeSentryIssueActor(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: rawStringOrNull(body.id),
    type: rawStringOrNull(body.type),
    name: rawStringOrNull(body.name),
    email: rawStringOrNull(body.email),
    username: rawStringOrNull(body.username),
  };
}

function normalizeSentryIssueStatusDetails(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    inRelease: rawStringOrNull(body.inRelease ?? body.in_release),
    inCommit: rawStringOrNull(body.inCommit ?? body.in_commit),
    inNextRelease:
      typeof (body.inNextRelease ?? body.in_next_release) === "boolean"
        ? (body.inNextRelease ?? body.in_next_release)
        : null,
  };
}

function normalizeSentryIssueTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const body = asRecord(item);
    if (!body || !isNonEmptyString(body.key)) {
      return [];
    }

    return [
      {
        key: body.key,
        name: rawStringOrNull(body.name),
        value: rawStringOrNull(body.value),
      },
    ];
  });
}

function normalizeSentryIssueEvent(value: unknown) {
  const body = expectRecord(value, "sentry issue event payload is invalid");

  return {
    id: optionalRawString(body.id) ?? optionalRawString(body.eventID) ?? "",
    eventId: rawStringOrNull(body.eventID ?? body.eventId),
    issueId: rawStringOrNull(body.groupID ?? body.groupId),
    title: rawStringOrNull(body.title),
    message: rawStringOrNull(body.message),
    platform: rawStringOrNull(body.platform),
    dateCreated: rawStringOrNull(body.dateCreated),
    user: normalizeSentryEventUser(body.user),
    tags: normalizeSentryEventTags(body.tags),
  };
}

function normalizeSentryEventUser(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: rawStringOrNull(body.id),
    email: rawStringOrNull(body.email),
    username: rawStringOrNull(body.username),
    ipAddress: rawStringOrNull(body.ipAddress ?? body.ip_address ?? body.ip),
    name: rawStringOrNull(body.name),
  };
}

function normalizeSentryEventTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const body = asRecord(item);
    if (!body || !isNonEmptyString(body.key) || !isNonEmptyString(body.value)) {
      return [];
    }

    return [
      {
        key: body.key,
        value: body.value,
      },
    ];
  });
}

function normalizeIssueStatusDetailsInput(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return undefined;
  }

  return compactObject({
    inCommit: asOptionalString(body.inCommit),
    inRelease: asOptionalString(body.inRelease),
    inNextRelease: typeof body.inNextRelease === "boolean" ? body.inNextRelease : undefined,
  });
}

function normalizeSentryRelease(value: unknown) {
  const body = expectRecord(value, "sentry release payload is invalid");

  return {
    version: optionalRawString(body.version) ?? "",
    shortVersion: rawStringOrNull(body.shortVersion),
    status: rawStringOrNull(body.status),
    dateCreated: rawStringOrNull(body.dateCreated),
    dateReleased: rawStringOrNull(body.dateReleased),
    ref: rawStringOrNull(body.ref),
    url: rawStringOrNull(body.url),
    newGroups: nullableInteger(body.newGroups),
    projects: normalizeSentryReleaseProjects(body.projects),
    lastCommit: body.lastCommit ?? body.last_commit ?? null,
    lastDeploy: body.lastDeploy ?? body.last_deploy ?? null,
    healthData: body.healthData ?? body.health_data ?? null,
    stats: body.stats ?? null,
  };
}

function normalizeSentryReleaseProjects(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const body = asRecord(item);
    if (!body) {
      return [];
    }

    return [
      {
        id: nullableInteger(body.id),
        slug: rawStringOrNull(body.slug),
        name: rawStringOrNull(body.name),
      },
    ];
  });
}

function normalizeReleaseHealthGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const body = asRecord(item);
    if (!body) {
      return [];
    }

    return [
      {
        by: asRecord(body.by) ?? {},
        totals: asRecord(body.totals) ?? {},
        series: asRecord(body.series) ?? null,
      },
    ];
  });
}

function normalizeSentryReplay(value: unknown) {
  const body = expectRecord(value, "sentry replay payload is invalid");

  return {
    id: optionalRawString(body.id) ?? "",
    projectId: nullableInteger(body.projectId ?? body.project_id),
    environment: rawStringOrNull(body.environment),
    platform: rawStringOrNull(body.platform),
    startedAt: rawStringOrNull(body.startedAt ?? body.started_at),
    finishedAt: rawStringOrNull(body.finishedAt ?? body.finished_at),
    duration: nullableInteger(body.duration),
    countErrors: nullableInteger(body.countErrors ?? body.count_errors),
    countRageClicks: nullableInteger(body.countRageClicks ?? body.count_rage_clicks),
    countDeadClicks: nullableInteger(body.countDeadClicks ?? body.count_dead_clicks),
    countSegments: nullableInteger(body.countSegments ?? body.count_segments),
    user: normalizeSentryReplayUser(body.user),
    browser: normalizeSentryNamedValue(body.browser),
    os: normalizeSentryNamedValue(body.os),
    device: normalizeSentryNamedValue(body.device),
    releases: normalizeSentryReplayReleases(body.releases),
  };
}

function normalizeSentryReplayUser(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: rawStringOrNull(body.id),
    email: rawStringOrNull(body.email),
    username: rawStringOrNull(body.username),
    ip: rawStringOrNull(body.ip ?? body.ipAddress ?? body.ip_address),
  };
}

function normalizeSentryNamedValue(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    name: rawStringOrNull(body.name),
    version: rawStringOrNull(body.version),
  };
}

function normalizeSentryReplayReleases(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [item];
    }

    const body = asRecord(item);
    const version = body ? optionalRawString(body.version) : undefined;
    return version ? [version] : [];
  });
}

function normalizeSentryAlert(value: unknown) {
  const body = expectRecord(value, "sentry alert payload is invalid");

  return {
    id: optionalRawString(body.id) ?? "",
    name: optionalRawString(body.name) ?? "",
    organizationId: rawStringOrNull(body.organizationId ?? body.organization_id),
    enabled: booleanValue(body.enabled),
    createdBy: normalizeCreatedBy(body.createdBy),
    dateCreated: rawStringOrNull(body.dateCreated),
    dateUpdated: rawStringOrNull(body.dateUpdated),
    environment: rawStringOrNull(body.environment),
    lastTriggered: rawStringOrNull(body.lastTriggered),
    detectorIds: stringArray(body.detectorIds),
    config: asRecord(body.config) ?? {},
    triggers: normalizeSentryAlertTrigger(body.triggers),
    actionFilters: normalizeSentryAlertActionFilters(body.actionFilters),
  };
}

function normalizeCreatedBy(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return rawStringOrNull(body.id ?? body.email ?? body.username);
}

function normalizeSentryAlertTrigger(value: unknown) {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  return {
    id: rawStringOrNull(body.id),
    logicType: rawStringOrNull(body.logicType),
    actions: body.actions ?? null,
    conditions: body.conditions ?? null,
    organizationId: rawStringOrNull(body.organizationId ?? body.organization_id),
  };
}

function normalizeSentryAlertActionFilters(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const body = asRecord(item);
    if (!body) {
      return [];
    }

    return [
      {
        id: rawStringOrNull(body.id),
        actions: body.actions ?? null,
        logicType: rawStringOrNull(body.logicType),
        conditions: body.conditions ?? null,
        organizationId: rawStringOrNull(body.organizationId ?? body.organization_id),
      },
    ];
  });
}

function unwrapSentryWorkflowList(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const body = asRecord(payload);
  if (!body || !Array.isArray(body.data)) {
    throw new ProviderRequestError(502, "sentry alerts response is invalid");
  }
  return body.data;
}

function unwrapSentryWorkflowItem(payload: unknown) {
  const body = asRecord(payload);
  if (body && "data" in body) {
    return body.data;
  }
  return payload;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeSentryError(
  status: number,
  payload: unknown,
  fallbackMessage: string,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractSentryErrorMessage(payload) ?? fallbackMessage;

  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function extractSentryErrorMessage(payload: unknown): string | null {
  const body = asRecord(payload);
  if (!body) {
    return null;
  }

  return (
    pickString(body.error_description, body.detail, body.error, body.message) ??
    readNestedString(body, "detail", "message") ??
    null
  );
}

function readNestedString(body: Record<string, unknown>, key: string, nestedKey: string) {
  const nested = asOptionalRecord(body[key]);
  return optionalRawString(nested?.[nestedKey]);
}

function expectRecord(value: unknown, message: string) {
  const record = asRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown) {
  return asRecord(value);
}

function asOptionalString(value: unknown) {
  return optionalRawString(value);
}

function asOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

function asOptionalInteger(value: unknown) {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function asOptionalIntegerArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item) => {
    const parsed = asOptionalInteger(item);
    return parsed === undefined ? [] : [parsed];
  });
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function nullableStringArray(value: unknown) {
  if (value === null) {
    return null;
  }
  return stringArray(value);
}

function nullableInteger(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function encodeSentryPathSegment(value: string) {
  return encodeURIComponent(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function joinSentrySearchClauses(...clauses: Array<string | undefined>) {
  const normalized = clauses.filter((clause): clause is string => isNonEmptyString(clause));
  return normalized.length > 0 ? normalized.join(" ") : undefined;
}

function oneZeroFlag(value: boolean) {
  return value ? "1" : "0";
}
