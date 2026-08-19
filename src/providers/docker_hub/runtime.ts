import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, nullableString, optionalInteger, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const dockerHubApiBaseUrl = "https://hub.docker.com";
const dockerHubAccessTokenPath = "/v2/auth/token";
const dockerHubUserAgent = providerUserAgent;

type QueryValue = boolean | number | string | undefined;
type DockerHubRequestMode = "validate" | "execute";

interface DockerHubCredential {
  identifier: string;
  secret: string;
}

export type DockerHubActionContext = {
  bearerToken: string;
  credential: DockerHubCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};

export type DockerHubActionHandler = (
  input: Record<string, unknown>,
  context: DockerHubActionContext,
) => Promise<unknown>;

export const dockerHubActionHandlers: ProviderActionHandlers<"docker_hub", DockerHubActionHandler> = {
  list_repositories: listDockerHubRepositories,
  get_repository: getDockerHubRepository,
  create_repository: createDockerHubRepository,
  get_tag: getDockerHubTag,
  get_image: getDockerHubImage,
  list_org_members: listDockerHubOrgMembers,
  add_org_member: addDockerHubOrgMember,
  remove_org_member: removeDockerHubOrgMember,
  list_org_access_tokens: listDockerHubOrgAccessTokens,
  list_teams: listDockerHubTeams,
  get_team: getDockerHubTeam,
  delete_team: deleteDockerHubTeam,
  list_team_members: listDockerHubTeamMembers,
  remove_team_member: removeDockerHubTeamMember,
};

export async function validateDockerHubApiKey(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const { credential } = await exchangeDockerHubAccessToken(apiKey, fetcher, "validate", signal);
  return {
    profile: {
      accountId: credential.identifier,
      displayName: credential.identifier,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: dockerHubApiBaseUrl,
      credentialFormat: "identifier:secret",
      identifier: credential.identifier,
      validationEndpoint: dockerHubAccessTokenPath,
    },
  };
}

export async function createDockerHubActionContext(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<DockerHubActionContext> {
  const { accessToken, credential } = await exchangeDockerHubAccessToken(apiKey, fetcher, "execute", signal);
  return {
    bearerToken: accessToken,
    credential,
    fetcher,
    signal,
  };
}

async function dockerHubRequestJson<T>(input: {
  path: string;
  bearerToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  mode?: DockerHubRequestMode;
  signal?: AbortSignal;
}): Promise<T> {
  const { response, payload } = await dockerHubRequest(input);
  if (!response.ok) {
    throw normalizeDockerHubError(response, payload, "docker hub request failed", input.mode ?? "execute");
  }
  return payload as T;
}

async function dockerHubRequestNoContent(input: {
  path: string;
  bearerToken: string;
  fetcher: typeof fetch;
  method: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  mode?: DockerHubRequestMode;
  signal?: AbortSignal;
}) {
  const { response, payload } = await dockerHubRequest(input);
  if (!response.ok) {
    throw normalizeDockerHubError(response, payload, "docker hub request failed", input.mode ?? "execute");
  }
}

async function dockerHubRequest(input: {
  path: string;
  bearerToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  try {
    const response = await input.fetcher(buildDockerHubUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: dockerHubHeaders(input.bearerToken, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    return {
      response,
      payload: await readDockerHubPayload(response),
    };
  } catch (error) {
    throw normalizeDockerHubTransportError(error, "docker hub request failed");
  }
}

function buildDockerHubUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path, dockerHubApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function normalizeDockerHubError(
  response: Response,
  payload: unknown,
  fallbackMessage: string,
  mode: DockerHubRequestMode,
) {
  const message = readDockerHubErrorMessage(payload) ?? `${fallbackMessage} with ${response.status}`;

  if (mode === "validate") {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return new ProviderRequestError(400, message, payload);
    }
    return new ProviderRequestError(response.status || 502, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

async function listDockerHubRepositories(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/namespaces/${encodeURIComponent(String(input.namespace))}/repositories`,
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.pageSize),
      name: optionalString(input.name),
      ordering: optionalString(input.ordering),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return normalizeRepositoryPage(payload);
}

async function getDockerHubRepository(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/namespaces/${encodeURIComponent(String(input.namespace))}/repositories/${encodeURIComponent(String(input.repository))}`,
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    repository: normalizeRepositoryDetail(payload),
  };
}

async function createDockerHubRepository(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/namespaces/${encodeURIComponent(String(input.namespace))}/repositories`,
    method: "POST",
    body: compactObject({
      namespace: String(input.namespace),
      name: String(input.name),
      description: optionalString(input.description),
      full_description: optionalString(input.fullDescription),
      registry: optionalString(input.registry),
      is_private: input.isPrivate === undefined ? undefined : Boolean(input.isPrivate),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    repository: normalizeRepositoryDetail(payload),
  };
}

async function getDockerHubTag(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/namespaces/${encodeURIComponent(String(input.namespace))}/repositories/${encodeURIComponent(String(input.repository))}/tags/${encodeURIComponent(String(input.tag))}`,
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    tag: normalizeTag(payload),
  };
}

async function getDockerHubImage(input: Record<string, unknown>, context: DockerHubActionContext) {
  const namespace = String(input.namespace);
  const repository = String(input.repository);
  const digest = String(input.digest);
  const pageSize = optionalInteger(input.pageSize) ?? 25;
  const maxPages = optionalInteger(input.maxPages) ?? 20;

  let page = 1;
  while (page <= maxPages) {
    const payload = await dockerHubRequestJson<unknown>({
      path: `/v2/namespaces/${encodeURIComponent(namespace)}/repositories/${encodeURIComponent(repository)}/tags`,
      query: {
        page,
        page_size: pageSize,
      },
      bearerToken: context.bearerToken,
      fetcher: context.fetcher,
      signal: context.signal,
    });

    const normalizedPage = normalizeTagPage(payload);
    for (const tag of normalizedPage.results) {
      const image = tag.images.find((candidate) => candidate.digest === digest);
      if (image) {
        return {
          tag,
          image,
        };
      }
    }

    if (!normalizedPage.next) {
      break;
    }
    page += 1;
  }

  throw new ProviderRequestError(404, `docker hub image not found for digest: ${digest}`);
}

async function listDockerHubOrgMembers(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/members`,
    query: compactObject({
      search: optionalString(input.search),
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.pageSize),
      invites: input.invites === undefined ? undefined : Boolean(input.invites),
      type: optionalString(input.type),
      role: optionalString(input.role),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return normalizeOrgMemberPage(payload);
}

async function addDockerHubOrgMember(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: "/v2/invites/bulk",
    method: "POST",
    body: compactObject({
      org: String(input.orgName),
      team: optionalString(input.teamName),
      role: optionalString(input.role),
      invitees: [String(input.invitee)],
      dry_run: input.dryRun === undefined ? undefined : Boolean(input.dryRun),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    invitees: normalizeBulkInviteResults(payload),
  };
}

async function removeDockerHubOrgMember(input: Record<string, unknown>, context: DockerHubActionContext) {
  await dockerHubRequestNoContent({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/members/${encodeURIComponent(String(input.username))}`,
    method: "DELETE",
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    removed: true,
  };
}

async function listDockerHubOrgAccessTokens(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/access-tokens`,
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.pageSize),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return normalizeOrgAccessTokenPage(payload);
}

async function listDockerHubTeams(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/groups`,
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.pageSize),
      username: optionalString(input.username),
      search: optionalString(input.search),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return normalizeTeamPage(payload);
}

async function getDockerHubTeam(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/groups/${encodeURIComponent(String(input.teamName))}`,
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    team: normalizeTeam(payload),
  };
}

async function deleteDockerHubTeam(input: Record<string, unknown>, context: DockerHubActionContext) {
  await dockerHubRequestNoContent({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/groups/${encodeURIComponent(String(input.teamName))}`,
    method: "DELETE",
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    deleted: true,
  };
}

async function listDockerHubTeamMembers(input: Record<string, unknown>, context: DockerHubActionContext) {
  const payload = await dockerHubRequestJson<unknown>({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/groups/${encodeURIComponent(String(input.teamName))}/members`,
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.pageSize),
      search: optionalString(input.search),
    }),
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return normalizeTeamMemberPage(payload);
}

async function removeDockerHubTeamMember(input: Record<string, unknown>, context: DockerHubActionContext) {
  await dockerHubRequestNoContent({
    path: `/v2/orgs/${encodeURIComponent(String(input.orgName))}/groups/${encodeURIComponent(String(input.teamName))}/members/${encodeURIComponent(String(input.username))}`,
    method: "DELETE",
    bearerToken: context.bearerToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    removed: true,
  };
}

function dockerHubHeaders(bearerToken: string, hasJsonBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${bearerToken}`,
    "user-agent": dockerHubUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function normalizeDockerHubTransportError(error: unknown, fallbackMessage: string) {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const detail = error instanceof Error && error.message.trim().length > 0 ? `: ${error.message.trim()}` : "";
  return new ProviderRequestError(502, `${fallbackMessage}${detail}`);
}

async function exchangeDockerHubAccessToken(
  apiKey: string,
  fetcher: typeof fetch,
  mode: DockerHubRequestMode,
  signal?: AbortSignal,
) {
  const credential = parseDockerHubCredential(apiKey);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(buildDockerHubUrl(dockerHubAccessTokenPath), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": dockerHubUserAgent,
      },
      body: JSON.stringify({
        identifier: credential.identifier,
        secret: credential.secret,
      }),
      signal,
    });
    payload = await readDockerHubPayload(response);
  } catch (error) {
    throw normalizeDockerHubTransportError(error, "docker hub access token request failed");
  }

  if (!response.ok) {
    throw normalizeDockerHubError(response, payload, "docker hub access token request failed", mode);
  }

  const accessToken = optionalString(readRecord(payload).access_token);
  if (!accessToken) {
    throw new ProviderRequestError(502, "docker hub access token response did not include access_token");
  }

  return {
    credential,
    accessToken,
  };
}

function parseDockerHubCredential(apiKey: string): DockerHubCredential {
  const trimmed = apiKey.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new ProviderRequestError(400, "docker_hub apiKey must use identifier:secret format");
  }

  const identifier = trimmed.slice(0, separatorIndex).trim();
  const secret = trimmed.slice(separatorIndex + 1).trim();
  if (!identifier || !secret) {
    throw new ProviderRequestError(400, "docker_hub apiKey must use identifier:secret format");
  }

  return {
    identifier,
    secret,
  };
}

async function readDockerHubPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function readDockerHubErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directMessage = optionalString(record.message) ?? optionalString(record.detail);
  if (directMessage) {
    return directMessage;
  }

  const errinfo = record.errinfo;
  if (!errinfo || typeof errinfo !== "object" || Array.isArray(errinfo)) {
    return null;
  }

  for (const value of Object.values(errinfo)) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const firstString = value.find((item) => typeof item === "string" && item.trim());
      if (typeof firstString === "string") {
        return firstString.trim();
      }
    }
  }

  return null;
}

function normalizeRepositoryPage(payload: unknown) {
  const page = normalizePageContainer(payload);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    results: page.results.map((item) => normalizeRepositorySummary(item)),
  };
}

function normalizeRepositoryDetail(payload: unknown) {
  const record = readRecord(payload);
  return {
    ...normalizeRepositorySummary(record),
    user: readNullableText(record.user),
    hubUser: readNullableText(record.hub_user),
    collaboratorCount: optionalInteger(record.collaborator_count) ?? null,
    fullDescription: readNullableText(record.full_description),
    hasStarred: typeof record.has_starred === "boolean" ? record.has_starred : null,
    permissions: normalizeRepoPermissions(record.permissions),
    immutableTagsSettings: normalizeImmutableTagsSettings(record.immutable_tags_settings),
    source: readNullableText(record.source),
  };
}

function normalizeRepositorySummary(payload: unknown) {
  const record = readRecord(payload);
  return {
    name: optionalString(record.name) ?? "",
    namespace: optionalString(record.namespace) ?? "",
    repositoryType: readNullableText(record.repository_type),
    status: optionalInteger(record.status) ?? 0,
    statusDescription: optionalString(record.status_description) ?? "",
    description: readNullableText(record.description),
    isPrivate: Boolean(record.is_private),
    starCount: optionalInteger(record.star_count) ?? 0,
    pullCount: optionalInteger(record.pull_count) ?? 0,
    lastUpdated: readNullableText(record.last_updated),
    lastModified: readNullableText(record.last_modified),
    dateRegistered: readNullableText(record.date_registered),
    affiliation: readNullableText(record.affiliation),
    mediaTypes: readStringArray(record.media_types),
    contentTypes: readStringArray(record.content_types),
    categories: readObjectArray(record.categories).map((item) => ({
      name: optionalString(item.name) ?? "",
      slug: optionalString(item.slug) ?? "",
    })),
    storageSize: optionalInteger(record.storage_size) ?? null,
  };
}

function normalizeRepoPermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    read: Boolean(record.read),
    write: Boolean(record.write),
    admin: Boolean(record.admin),
  };
}

function normalizeImmutableTagsSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    enabled: Boolean(record.enabled),
    rules: readStringArray(record.rules),
  };
}

function normalizeTagPage(payload: unknown) {
  const page = normalizePageContainer(payload);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    results: page.results.map((item) => normalizeTag(item)),
  };
}

function normalizeTag(payload: unknown) {
  const record = readRecord(payload);
  return {
    id: optionalInteger(record.id) ?? null,
    name: optionalString(record.name) ?? "",
    creator: optionalInteger(record.creator) ?? null,
    lastUpdated: readNullableText(record.last_updated),
    lastUpdater: optionalInteger(record.last_updater) ?? null,
    lastUpdaterUsername: readNullableText(record.last_updater_username),
    repository: optionalInteger(record.repository) ?? null,
    fullSize: optionalInteger(record.full_size) ?? null,
    status: readNullableText(record.status),
    tagLastPulled: readNullableText(record.tag_last_pulled),
    tagLastPushed: readNullableText(record.tag_last_pushed),
    images: normalizeImageCollection(record.images),
  };
}

function normalizeImageCollection(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeImage(item));
  }
  if (value && typeof value === "object") {
    return [normalizeImage(value)];
  }
  return [];
}

function normalizeImage(value: unknown) {
  const record = readRecord(value);
  return {
    architecture: readNullableText(record.architecture),
    features: readNullableText(record.features),
    variant: readNullableText(record.variant),
    digest: readNullableText(record.digest),
    layers: readObjectArray(record.layers).map((layer) => ({
      digest: readNullableText(layer.digest),
      size: optionalInteger(layer.size) ?? null,
      instruction: readNullableText(layer.instruction),
    })),
    os: readNullableText(record.os),
    osFeatures: readNullableText(record.os_features),
    osVersion: readNullableText(record.os_version),
    size: optionalInteger(record.size) ?? null,
    status: readNullableText(record.status),
    lastPulled: readNullableText(record.last_pulled),
    lastPushed: readNullableText(record.last_pushed),
  };
}

function normalizeOrgMemberPage(payload: unknown) {
  if (Array.isArray(payload) && payload.every((item) => item && typeof item === "object")) {
    const firstPage = payload[0];
    if (firstPage && typeof firstPage === "object" && !Array.isArray(firstPage)) {
      return normalizeOrgMemberPage(firstPage);
    }
  }

  const page = normalizePageContainer(payload);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    results: page.results.map((item) => normalizeOrgMember(item)),
  };
}

function normalizeOrgMember(payload: unknown) {
  const record = readRecord(payload);
  return {
    id: readNullableText(record.id),
    username: readNullableText(record.username),
    fullName: readNullableText(record.full_name),
    email: readNullableText(record.email),
    type: readNullableText(record.type),
    role: readNullableText(record.role),
    groups: readStringArray(record.groups),
    isGuest: typeof record.is_guest === "boolean" ? record.is_guest : null,
    dateJoined: readNullableText(record.date_joined),
    lastLoggedInAt: readNullableText(record.last_logged_in_at),
    lastSeenAt: readNullableText(record.last_seen_at),
    lastDesktopVersion: readNullableText(record.last_desktop_version),
  };
}

function normalizeTeamPage(payload: unknown) {
  const page = normalizePageContainer(payload);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    results: page.results.map((item) => normalizeTeam(item)),
  };
}

function normalizeTeam(payload: unknown) {
  const record = readRecord(payload);
  return {
    id: optionalInteger(record.id) ?? null,
    uuid: readNullableText(record.uuid),
    name: readNullableText(record.name),
    description: readNullableText(record.description),
    memberCount: optionalInteger(record.member_count) ?? null,
  };
}

function normalizeTeamMemberPage(payload: unknown) {
  const page = normalizePageContainer(payload);
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    results: page.results.map((item) => normalizeTeamMember(item)),
  };
}

function normalizeTeamMember(payload: unknown) {
  const record = readRecord(payload);
  return {
    id: readNullableText(record.id),
    username: readNullableText(record.username),
    fullName: readNullableText(record.full_name),
    email: readNullableText(record.email),
    company: readNullableText(record.company),
    location: readNullableText(record.location),
    profileUrl: readNullableText(record.profile_url),
    type: readNullableText(record.type),
    dateJoined: readNullableText(record.date_joined),
  };
}

function normalizeOrgAccessTokenPage(payload: unknown) {
  const record = readRecord(payload);
  return {
    total: optionalInteger(record.total) ?? 0,
    next: readNullableText(record.next),
    previous: readNullableText(record.previous),
    results: readObjectArray(record.results).map((item) => normalizeOrgAccessToken(item)),
  };
}

function normalizeOrgAccessToken(payload: unknown) {
  const record = readRecord(payload);
  return compactObject({
    id: readNullableText(record.id),
    label: readNullableText(record.label),
    createdBy: readNullableText(record.created_by),
    isActive: typeof record.is_active === "boolean" ? record.is_active : null,
    createdAt: readNullableText(record.created_at),
    expiresAt: readNullableText(record.expires_at),
    lastUsedAt: readNullableText(record.last_used_at),
    resources: Array.isArray(record.resources)
      ? record.resources.map((item) => normalizeOrgAccessTokenResource(item))
      : undefined,
  });
}

function normalizeOrgAccessTokenResource(payload: unknown) {
  const record = readRecord(payload);
  return {
    type: readNullableText(record.type),
    path: readNullableText(record.path),
    scopes: readStringArray(record.scopes),
  };
}

function normalizeBulkInviteResults(payload: unknown) {
  const record = readRecord(payload);
  const nestedInvitees =
    record.invitees && typeof record.invitees === "object" && !Array.isArray(record.invitees)
      ? (record.invitees as Record<string, unknown>).invitees
      : record.invitees;
  return readObjectArray(nestedInvitees).map((item) => {
    const invite = item.invite;
    return {
      invitee: readNullableText(item.invitee),
      status: readNullableText(item.status),
      invite:
        invite && typeof invite === "object" && !Array.isArray(invite)
          ? {
              id: readNullableText((invite as Record<string, unknown>).id),
              inviterUsername: readNullableText((invite as Record<string, unknown>).inviter_username),
              invitee: readNullableText((invite as Record<string, unknown>).invitee),
              org: readNullableText((invite as Record<string, unknown>).org),
              team: readNullableText((invite as Record<string, unknown>).team),
              createdAt: readNullableText((invite as Record<string, unknown>).created_at),
            }
          : null,
    };
  });
}

function normalizePageContainer(payload: unknown) {
  const record = readRecord(payload);
  return {
    count: optionalInteger(record.count) ?? 0,
    next: readNullableText(record.next),
    previous: readNullableText(record.previous),
    results: readObjectArray(record.results),
  };
}

function readNullableText(value: unknown) {
  return nullableString(value) ?? null;
}

function readRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, "docker hub response is not an object");
  }
  return value as Record<string, unknown>;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
  );
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
