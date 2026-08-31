import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { providerResponseError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { zeplinReadScope } from "./scopes.ts";

const zeplinApiBaseUrl = "https://api.zeplin.dev/v1";

type ZeplinRequestPhase = "validate" | "execute";
type ZeplinActionHandler = ProviderRuntimeHandler<OAuthProviderContext>;

export const zeplinActionHandlers: ProviderActionHandlers<"zeplin", ZeplinActionHandler> = {
  get_current_user(_input, context) {
    return zeplinGetCurrentUser(context);
  },
  list_personal_projects(input, context) {
    return zeplinListPersonalProjects(input, context);
  },
  get_project(input, context) {
    return zeplinGetProject(input, context);
  },
  list_project_colors(input, context) {
    return zeplinListProjectColors(input, context);
  },
  list_project_text_styles(input, context) {
    return zeplinListProjectTextStyles(input, context);
  },
  list_screen_versions(input, context) {
    return zeplinListScreenVersions(input, context);
  },
};

export async function validateZeplinCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await zeplinRequestJson<Record<string, unknown>>({
    path: "/users/me",
    accessToken,
    fetcher,
    signal,
    phase: "validate",
  });
  const accountId = requiredProviderString(user.id, "zeplin current user id");
  const username = optionalString(user.username);
  const fullName = optionalString(user.full_name) ?? optionalString(user.fullName);
  const email = optionalString(user.email);

  return {
    profile: {
      accountId,
      displayName: fullName ?? username ?? email ?? accountId,
    },
    grantedScopes: [zeplinReadScope],
    metadata: {
      apiBaseUrl: zeplinApiBaseUrl,
      validationEndpoint: "/users/me",
      currentUser: compactObject({
        id: accountId,
        username,
        full_name: fullName,
        email,
        avatar_url: optionalString(user.avatar_url) ?? optionalString(user.avatarUrl),
      }),
    },
  };
}

async function zeplinGetCurrentUser(context: OAuthProviderContext): Promise<unknown> {
  return {
    user: await zeplinRequestJson<Record<string, unknown>>({
      path: "/users/me",
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  };
}

async function zeplinListPersonalProjects(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await zeplinRequestJson<unknown[]>({
    path: "/users/me/projects",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
  });

  return {
    projects: objectArray(payload, "zeplin personal projects", providerResponseError).map(toZeplinProjectSummary),
  };
}

async function zeplinGetProject(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const project = await zeplinRequestJson<Record<string, unknown>>({
    path: `/projects/${encodePathSegment(input.projectId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    project: {
      ...toZeplinProjectSummary(project),
      styleguide: optionalRecord(project.styleguide),
    },
  };
}

async function zeplinListProjectColors(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await zeplinRequestJson<unknown[]>({
    path: `/projects/${encodePathSegment(input.projectId)}/colors`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
  });

  return {
    colors: objectArray(payload, "zeplin project colors", providerResponseError).map(toZeplinColor),
  };
}

async function zeplinListProjectTextStyles(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await zeplinRequestJson<unknown[]>({
    path: `/projects/${encodePathSegment(input.projectId)}/text_styles`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
  });

  return {
    textStyles: objectArray(payload, "zeplin project text styles", providerResponseError).map(toZeplinTextStyle),
  };
}

async function zeplinListScreenVersions(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await zeplinRequestJson<unknown[]>({
    path: `/projects/${encodePathSegment(input.projectId)}/screens/${encodePathSegment(input.screenId)}/versions`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
  });

  return {
    versions: objectArray(payload, "zeplin screen versions", providerResponseError).map(toZeplinScreenVersion),
  };
}

async function zeplinRequestJson<T>(input: {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ZeplinRequestPhase;
  query?: Record<string, string | number | boolean | null | undefined>;
}): Promise<T> {
  const url = new URL(input.path, zeplinApiBaseUrl);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.accessToken}`,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zeplin request failed: ${error.message}` : "Zeplin request failed",
    );
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw mapZeplinError(response.status, text, input.phase);
  }
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, "Zeplin returned invalid JSON");
  }
}

function mapZeplinError(status: number, text: string, phase: ZeplinRequestPhase): ProviderRequestError {
  const message = extractZeplinErrorMessage(text) ?? `Zeplin request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractZeplinErrorMessage(text: string): string | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed = optionalRecord(JSON.parse(text) as unknown);
    return (
      optionalString(parsed?.error_description) ?? optionalString(parsed?.message) ?? optionalString(parsed?.error)
    );
  } catch {
    return text;
  }
}

function toZeplinProjectSummary(project: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requiredProviderString(project.id, "zeplin project id"),
    name: requiredProviderString(project.name, "zeplin project name"),
    platform: requiredProviderString(project.platform, "zeplin project platform"),
    status: requiredProviderString(project.status, "zeplin project status"),
    created: requiredProviderInteger(project.created, "zeplin project created"),
    updated: optionalInteger(project.updated),
    numberOfMembers: requiredProviderInteger(project.number_of_members, "zeplin project number_of_members"),
    numberOfScreens: requiredProviderInteger(project.number_of_screens, "zeplin project number_of_screens"),
    numberOfComponents: requiredProviderInteger(project.number_of_components, "zeplin project number_of_components"),
    numberOfConnectedComponents: requiredProviderInteger(
      project.number_of_connected_components,
      "zeplin project number_of_connected_components",
    ),
    numberOfTextStyles: requiredProviderInteger(project.number_of_text_styles, "zeplin project number_of_text_styles"),
    numberOfColors: requiredProviderInteger(project.number_of_colors, "zeplin project number_of_colors"),
    numberOfSpacingTokens: requiredProviderInteger(
      project.number_of_spacing_tokens,
      "zeplin project number_of_spacing_tokens",
    ),
    description: optionalString(project.description),
    sceneUrl: optionalString(project.scene_url),
    thumbnail: optionalString(project.thumbnail),
    organization: optionalRecord(project.organization),
    remPreferences: optionalRecord(project.rem_preferences),
    workflowStatus: optionalRecord(project.workflow_status),
  });
}

function toZeplinColor(color: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requiredProviderString(color.id, "zeplin color id"),
    name: requiredProviderString(color.name, "zeplin color name"),
    source: requiredRecord(color.source, "zeplin color source", providerResponseError),
    created: requiredProviderInteger(color.created, "zeplin color created"),
    color: toZeplinRgba(
      {
        r: requiredProviderNumber(color.r, "zeplin color r"),
        g: requiredProviderNumber(color.g, "zeplin color g"),
        b: requiredProviderNumber(color.b, "zeplin color b"),
        a: optionalNumber(color.a) ?? 1,
      },
      "zeplin color color",
    ),
    description: optionalString(color.description),
    hex: optionalString(color.hex),
  });
}

function toZeplinTextStyle(textStyle: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requiredProviderString(textStyle.id, "zeplin text style id"),
    name: requiredProviderString(textStyle.name, "zeplin text style name"),
    source: requiredRecord(textStyle.source, "zeplin text style source", providerResponseError),
    created: requiredProviderInteger(textStyle.created, "zeplin text style created"),
    fontFamily: requiredProviderString(textStyle.font_family, "zeplin text style font_family"),
    fontSize: requiredProviderNumber(textStyle.font_size, "zeplin text style font_size"),
    fontWeight: requiredProviderNumber(textStyle.font_weight, "zeplin text style font_weight"),
    fontStyle: requiredProviderString(textStyle.font_style, "zeplin text style font_style"),
    fontStretch: requiredProviderNumber(textStyle.font_stretch, "zeplin text style font_stretch"),
    lineHeight: optionalNumber(textStyle.line_height),
    letterSpacing: optionalNumber(textStyle.letter_spacing),
    textAlign: optionalString(textStyle.text_align),
    color: toZeplinRgba(
      requiredRecord(textStyle.color, "zeplin text style color", providerResponseError),
      "zeplin text style color",
    ),
    description: optionalString(textStyle.description),
  });
}

function toZeplinScreenVersion(version: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requiredProviderString(version.id, "zeplin screen version id"),
    created: optionalInteger(version.created),
    commitMessage: optionalString(version.commit_message) ?? optionalString(version.description),
    version: optionalInteger(version.version),
    author: optionalRecord(version.author),
  });
}

function toZeplinRgba(color: Record<string, unknown>, fieldName: string): Record<string, number> {
  return {
    r: requiredProviderInteger(color.r, `${fieldName}.r`),
    g: requiredProviderInteger(color.g, `${fieldName}.g`),
    b: requiredProviderInteger(color.b, `${fieldName}.b`),
    a: requiredProviderNumber(color.a, `${fieldName}.a`),
  };
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerResponseError);
}

function requiredProviderInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) {
    return parsed;
  }
  throw providerResponseError(`malformed zeplin response: ${fieldName}`);
}

function requiredProviderNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed !== undefined) {
    return parsed;
  }
  throw providerResponseError(`malformed zeplin response: ${fieldName}`);
}
