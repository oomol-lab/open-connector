import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  booleanString,
  compactObject,
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  rawStringOrNull,
  recordOrEmpty,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

export const appStoreConnectApiBaseUrl = "https://api.appstoreconnect.apple.com";

/** Label used in the shared timeout and transport failure messages. */
const providerLabel = "App Store Connect";

/**
 * Whether a failure happens while an action runs or while a credential is being
 * verified. A rejected token is a field error on the connect form but a
 * reconnect prompt during execution, so the two phases map 401 differently.
 */
type AppStoreConnectPhase = "execute" | "validate";

export interface AppStoreConnectContext {
  /** Resolves the `Bearer <ES256 JWT>` header value, signed once per action run. */
  authorization: () => Promise<string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AppStoreConnectRequest {
  path: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase?: AppStoreConnectPhase;
}

interface AppStoreConnectResponse {
  status: number;
  payload: unknown;
}

/** Included resources indexed by `<type>:<id>`, the linkage key JSON:API uses. */
type IncludedResources = Map<string, Record<string, unknown>>;

interface AppStoreConnectPage {
  resources: Array<Record<string, unknown>>;
  included: IncludedResources;
  nextCursor: string | null;
  total: number | null;
}

interface ListRequest {
  path: string;
  label: string;
  query?: Record<string, string | undefined>;
}

type AppStoreConnectHandler = (input: Record<string, unknown>, context: AppStoreConnectContext) => Promise<unknown>;

export const appStoreConnectActionHandlers: ProviderActionHandlers<"app_store_connect", AppStoreConnectHandler> = {
  async list_apps(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/apps",
      label: "App Store Connect app list",
      query: {
        "filter[bundleId]": optionalString(input.bundleId),
        "filter[name]": optionalString(input.name),
        "filter[sku]": optionalString(input.sku),
        sort: optionalString(input.sort),
      },
    });
    return {
      apps: page.resources.map((resource) => normalizeResource(resource, "App Store Connect app")),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: `/v1/apps/${encodePathSegment(readAppStoreConnectId(input.appId, "appId"))}`,
    });
    return { app: normalizeResource(readResource(payload, "App Store Connect app"), "App Store Connect app") };
  },

  async list_builds(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/builds",
      label: "App Store Connect build list",
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[version]": optionalString(input.version),
        "filter[preReleaseVersion.version]": optionalString(input.preReleaseVersion),
        "filter[preReleaseVersion.platform]": optionalString(input.platform),
        "filter[processingState]": optionalString(input.processingState),
        "filter[betaAppReviewSubmission.betaReviewState]": optionalString(input.betaReviewState),
        "filter[expired]": booleanString(input.expired),
        sort: optionalString(input.sort),
        include: "preReleaseVersion",
      },
    });
    return {
      builds: page.resources.map((resource) => ({
        ...normalizeResource(resource, "App Store Connect build"),
        preReleaseVersion: readPreReleaseVersionSummary(
          readIncludedResource(resource, "preReleaseVersion", page.included),
        ),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_build(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: `/v1/builds/${encodePathSegment(readAppStoreConnectId(input.buildId, "buildId"))}`,
      query: { include: "preReleaseVersion,betaAppReviewSubmission,app" },
    });
    const resource = readResource(payload, "App Store Connect build");
    const included = indexIncludedResources(payload);
    return {
      build: {
        ...normalizeResource(resource, "App Store Connect build"),
        preReleaseVersion: readPreReleaseVersionSummary(readIncludedResource(resource, "preReleaseVersion", included)),
        betaAppReviewSubmission: readBetaReviewSubmissionSummary(
          readIncludedResource(resource, "betaAppReviewSubmission", included),
        ),
        app: readAppSummary(readIncludedResource(resource, "app", included)),
      },
    };
  },

  async list_pre_release_versions(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/preReleaseVersions",
      label: "App Store Connect prerelease version list",
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[platform]": optionalString(input.platform),
        "filter[version]": optionalString(input.version),
        sort: optionalString(input.sort),
      },
    });
    return {
      preReleaseVersions: page.resources.map((resource) =>
        normalizeResource(resource, "App Store Connect prerelease version"),
      ),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_beta_groups(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/betaGroups",
      label: "App Store Connect beta group list",
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[name]": optionalString(input.name),
        "filter[isInternalGroup]": booleanString(input.isInternalGroup),
        "filter[publicLinkEnabled]": booleanString(input.publicLinkEnabled),
      },
    });
    return {
      betaGroups: page.resources.map((resource) => normalizeResource(resource, "App Store Connect beta group")),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_beta_group(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/betaGroups",
      body: {
        data: {
          type: "betaGroups",
          attributes: compactObject({
            name: requiredInputString(input.name, "name"),
            publicLinkEnabled: optionalBoolean(input.publicLinkEnabled),
            publicLinkLimitEnabled: optionalBoolean(input.publicLinkLimitEnabled),
            publicLinkLimit: optionalInteger(input.publicLinkLimit),
            feedbackEnabled: optionalBoolean(input.feedbackEnabled),
            hasAccessToAllBuilds: optionalBoolean(input.hasAccessToAllBuilds),
          }),
          relationships: { app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")) },
        },
      },
    });
    return {
      betaGroup: normalizeResource(
        readResource(payload, "App Store Connect beta group"),
        "App Store Connect beta group",
      ),
    };
  },

  async delete_beta_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const response = await requestAppStoreConnect(context, {
      method: "DELETE",
      path: `/v1/betaGroups/${encodePathSegment(betaGroupId)}`,
    });
    assertNoContent(response, [204], "Deleting the App Store Connect beta group");
    return { id: betaGroupId, deleted: true };
  },

  async list_beta_testers(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/betaTesters",
      label: "App Store Connect beta tester list",
      query: {
        "filter[email]": optionalString(input.email),
        "filter[firstName]": optionalString(input.firstName),
        "filter[lastName]": optionalString(input.lastName),
        "filter[inviteType]": optionalString(input.inviteType),
        "filter[apps]": optionalString(input.appId),
        "filter[betaGroups]": optionalString(input.betaGroupId),
        "filter[builds]": optionalString(input.buildId),
        sort: optionalString(input.sort),
      },
    });
    return {
      betaTesters: page.resources.map((resource) => normalizeResource(resource, "App Store Connect beta tester")),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_beta_tester(input, context) {
    const betaGroupIds = optionalStringArray(input.betaGroupIds);
    const buildIds = optionalStringArray(input.buildIds);
    // App Store Connect only creates a tester that is assigned to something,
    // and answers an unassigned create with a 409 the caller cannot act on.
    if (!betaGroupIds?.length && !buildIds?.length) {
      throw providerInputError("betaGroupIds or buildIds must contain at least one identifier");
    }

    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/betaTesters",
      body: {
        data: {
          type: "betaTesters",
          attributes: compactObject({
            email: requiredInputString(input.email, "email"),
            firstName: optionalString(input.firstName),
            lastName: optionalString(input.lastName),
          }),
          relationships: compactObject({
            betaGroups: betaGroupIds?.length ? toManyLinkage("betaGroups", betaGroupIds) : undefined,
            builds: buildIds?.length ? toManyLinkage("builds", buildIds) : undefined,
          }),
        },
      },
    });
    return {
      betaTester: normalizeResource(
        readResource(payload, "App Store Connect beta tester"),
        "App Store Connect beta tester",
      ),
    };
  },

  async delete_beta_tester(input, context) {
    const betaTesterId = readAppStoreConnectId(input.betaTesterId, "betaTesterId");
    const response = await requestAppStoreConnect(context, {
      method: "DELETE",
      path: `/v1/betaTesters/${encodePathSegment(betaTesterId)}`,
    });
    // Removing a tester is the one delete App Store Connect may answer
    // asynchronously, so it documents 202 alongside 204.
    assertNoContent(response, [202, 204], "Removing the App Store Connect beta tester");
    return { id: betaTesterId, deleted: true };
  },

  async add_beta_testers_to_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const betaTesterIds = readIdentifierList(input.betaTesterIds, "betaTesterIds");
    const response = await requestAppStoreConnect(context, {
      method: "POST",
      path: `/v1/betaGroups/${encodePathSegment(betaGroupId)}/relationships/betaTesters`,
      body: toManyLinkage("betaTesters", betaTesterIds),
    });
    assertNoContent(response, [204], "Adding testers to the App Store Connect beta group");
    return { betaGroupId, betaTesterIds, added: true };
  },

  async remove_beta_testers_from_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const betaTesterIds = readIdentifierList(input.betaTesterIds, "betaTesterIds");
    const response = await requestAppStoreConnect(context, {
      method: "DELETE",
      path: `/v1/betaGroups/${encodePathSegment(betaGroupId)}/relationships/betaTesters`,
      body: toManyLinkage("betaTesters", betaTesterIds),
    });
    assertNoContent(response, [204], "Removing testers from the App Store Connect beta group");
    return { betaGroupId, betaTesterIds, removed: true };
  },

  async add_build_to_beta_groups(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const betaGroupIds = readIdentifierList(input.betaGroupIds, "betaGroupIds");
    const response = await requestAppStoreConnect(context, {
      method: "POST",
      path: `/v1/builds/${encodePathSegment(buildId)}/relationships/betaGroups`,
      body: toManyLinkage("betaGroups", betaGroupIds),
    });
    assertNoContent(response, [204], "Adding the build to App Store Connect beta groups");
    return { buildId, betaGroupIds, added: true };
  },

  async submit_build_for_beta_review(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/betaAppReviewSubmissions",
      body: {
        data: {
          type: "betaAppReviewSubmissions",
          relationships: { build: toOneLinkage("builds", readAppStoreConnectId(input.buildId, "buildId")) },
        },
      },
    });
    return readBetaReviewSubmissionSummary(readResource(payload, "App Store Connect beta app review submission"));
  },

  async update_build_test_notes(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const locale = requiredInputString(input.locale, "locale");
    const whatsNew = requiredInputString(input.whatsNew, "whatsNew");
    // The filterable collection answers with the single localization that
    // covers this build and locale, so there is no page of locales to walk.
    const existing = await requestAppStoreConnect(context, {
      path: "/v1/betaBuildLocalizations",
      query: { "filter[build]": buildId, "filter[locale]": locale, limit: "1" },
    });
    const localizationId = readLocalizationId(existing.payload);
    if (localizationId) {
      const { payload } = await requestAppStoreConnect(context, {
        method: "PATCH",
        path: `/v1/betaBuildLocalizations/${encodePathSegment(localizationId)}`,
        body: { data: { type: "betaBuildLocalizations", id: localizationId, attributes: { whatsNew } } },
      });
      return { ...readTestNotes(readResource(payload, "App Store Connect beta build localization")), created: false };
    }

    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/betaBuildLocalizations",
      body: {
        data: {
          type: "betaBuildLocalizations",
          attributes: { locale, whatsNew },
          relationships: { build: toOneLinkage("builds", buildId) },
        },
      },
    });
    return { ...readTestNotes(readResource(payload, "App Store Connect beta build localization")), created: true };
  },

  async list_app_store_versions(input, context) {
    const page = await listResources(context, input, {
      path: `/v1/apps/${encodePathSegment(readAppStoreConnectId(input.appId, "appId"))}/appStoreVersions`,
      label: "App Store Connect version list",
      query: {
        "filter[platform]": optionalString(input.platform),
        "filter[versionString]": optionalString(input.versionString),
        "filter[appVersionState]": optionalString(input.appVersionState),
      },
    });
    return {
      appStoreVersions: page.resources.map(normalizeAppStoreVersion),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_store_version(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: `/v1/appStoreVersions/${encodePathSegment(
        readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
      )}`,
    });
    return { appStoreVersion: normalizeAppStoreVersion(readResource(payload, "App Store Connect version")) };
  },

  async list_customer_reviews(input, context) {
    const rating = optionalInteger(input.rating);
    const page = await listResources(context, input, {
      path: `/v1/apps/${encodePathSegment(readAppStoreConnectId(input.appId, "appId"))}/customerReviews`,
      label: "App Store Connect customer review list",
      query: {
        "filter[rating]": rating === undefined ? undefined : String(rating),
        "filter[territory]": optionalString(input.territory),
        "exists[publishedResponse]": booleanString(input.hasResponse),
        sort: optionalString(input.sort),
        include: "response",
      },
    });
    return {
      customerReviews: page.resources.map((resource) => ({
        ...normalizeResource(resource, "App Store Connect customer review"),
        response: readReviewResponseSummary(readIncludedResource(resource, "response", page.included)),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_customer_review(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: `/v1/customerReviews/${encodePathSegment(readAppStoreConnectId(input.customerReviewId, "customerReviewId"))}`,
      query: { include: "response" },
    });
    const resource = readResource(payload, "App Store Connect customer review");
    return {
      customerReview: {
        ...normalizeResource(resource, "App Store Connect customer review"),
        response: readReviewResponseSummary(
          readIncludedResource(resource, "response", indexIncludedResources(payload)),
        ),
      },
    };
  },

  async respond_to_customer_review(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/customerReviewResponses",
      body: {
        data: {
          type: "customerReviewResponses",
          attributes: { responseBody: requiredInputString(input.responseBody, "responseBody") },
          relationships: {
            review: toOneLinkage("customerReviews", readAppStoreConnectId(input.customerReviewId, "customerReviewId")),
          },
        },
      },
    });
    const customerReviewResponse = readReviewResponseSummary(
      readResource(payload, "App Store Connect customer review response"),
    );
    if (!customerReviewResponse) {
      throw providerResponseError("App Store Connect did not return the created customer review response");
    }

    return { customerReviewResponse };
  },

  async delete_customer_review_response(input, context) {
    const customerReviewResponseId = readAppStoreConnectId(input.customerReviewResponseId, "customerReviewResponseId");
    const response = await requestAppStoreConnect(context, {
      method: "DELETE",
      path: `/v1/customerReviewResponses/${encodePathSegment(customerReviewResponseId)}`,
    });
    assertNoContent(response, [204], "Removing the App Store Connect customer review response");
    return { id: customerReviewResponseId, deleted: true };
  },

  async list_users(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/users",
      label: "App Store Connect user list",
      query: {
        "filter[roles]": readCommaSeparatedList(input.roles),
        "filter[username]": optionalString(input.username),
        "filter[visibleApps]": optionalString(input.visibleAppId),
        sort: optionalString(input.sort),
      },
    });
    return {
      users: page.resources.map((resource) => normalizeResource(resource, "App Store Connect user")),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_user(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: `/v1/users/${encodePathSegment(readAppStoreConnectId(input.userId, "userId"))}`,
    });
    return { user: normalizeResource(readResource(payload, "App Store Connect user"), "App Store Connect user") };
  },
};

/**
 * Verify a configured key by asking for a single app.
 *
 * Both rejections are field errors on the connect form. A 401 means the token
 * itself was refused. A 403 does not single out a narrow role: Apple answers it
 * for a revoked key and a malformed token too, so a key that cannot read apps
 * is reported as unusable rather than stored as a working connection.
 */
export async function requestAppStoreConnectCredentialValidation(context: AppStoreConnectContext): Promise<void> {
  await requestAppStoreConnect(context, { path: "/v1/apps", query: { limit: "1" }, phase: "validate" });
}

async function listResources(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: ListRequest,
): Promise<AppStoreConnectPage> {
  const limit = optionalInteger(input.limit);
  const { payload } = await requestAppStoreConnect(context, {
    path: request.path,
    query: {
      ...request.query,
      limit: limit === undefined ? undefined : String(limit),
      cursor: optionalString(input.cursor),
    },
  });
  return {
    resources: readCollection(payload, request.label),
    included: indexIncludedResources(payload),
    nextCursor: readNextCursor(payload),
    total: readTotal(payload),
  };
}

async function requestAppStoreConnect(
  context: AppStoreConnectContext,
  input: AppStoreConnectRequest,
): Promise<AppStoreConnectResponse> {
  const url = new URL(`${appStoreConnectApiBaseUrl}${input.path}`);
  setSearchParams(url, input.query ?? {});
  return runProviderRequest({ signal: context.signal, label: providerLabel }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      authorization: await context.authorization(),
      "user-agent": providerUserAgent,
    });
    if (input.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createAppStoreConnectError(response.status, payload, input.phase ?? "execute");
    }
    return { status: response.status, payload };
  });
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "App Store Connect returned a response that is not JSON",
    // A 406 answer is plain text rather than JSON, so keep the text for the
    // error message instead of failing to parse it.
    invalidJsonFallback: (text) => text,
  });
}

function createAppStoreConnectError(
  status: number,
  payload: unknown,
  phase: AppStoreConnectPhase,
): ProviderRequestError {
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(
      400,
      "App Store Connect rejected the key. Check the Key ID, Issuer ID and private key.",
      payload,
    );
  }

  if (phase === "validate" && status === 403) {
    return new ProviderRequestError(
      400,
      "App Store Connect authenticated the key but refused to list apps. Grant the key a role that can read apps (for example Developer, App Manager or Admin), and check that the key has not been revoked.",
      payload,
    );
  }

  return new ProviderRequestError(status, readErrorMessage(status, payload), payload);
}

function readErrorMessage(status: number, payload: unknown): string {
  const errors = looseArray(recordOrEmpty(payload).errors);
  const first = optionalRecord(errors[0]);
  // Apple's `code` is the only machine-readable discriminator in an error body,
  // so it leads the message that reaches the caller.
  const summary = [optionalString(first?.code), optionalString(first?.title), optionalString(first?.detail)]
    .filter((part) => part !== undefined)
    .join(": ");
  if (!summary) {
    return `App Store Connect request failed with HTTP ${status}`;
  }

  return errors.length > 1 ? `${summary} (+${errors.length - 1} more)` : summary;
}

function assertNoContent(response: AppStoreConnectResponse, allowedStatuses: readonly number[], label: string): void {
  // A redirect the guarded fetch rewrites to GET can answer 200, so accepting
  // any 2xx would report a resource as deleted while it still exists.
  if (!allowedStatuses.includes(response.status)) {
    throw providerResponseError(`${label} answered HTTP ${response.status} instead of ${allowedStatuses.join(" or ")}`);
  }
}

function readResource(payload: unknown, label: string): Record<string, unknown> {
  const envelope = requiredResponseRecord(payload, label);
  return requiredResponseRecord(envelope.data, `${label} data`);
}

function readCollection(payload: unknown, label: string): Array<Record<string, unknown>> {
  const envelope = requiredResponseRecord(payload, label);
  return looseArray(envelope.data).map((item) => requiredResponseRecord(item, `${label} item`));
}

function normalizeResource(resource: Record<string, unknown>, label: string): Record<string, unknown> {
  const id = optionalString(resource.id);
  if (!id) {
    throw providerResponseError(`${label} is missing an id`);
  }

  return { id, ...recordOrEmpty(resource.attributes) };
}

/**
 * App Store Connect still returns `appStoreState` and `usesIdfa` on every
 * version record, but both are deprecated: `appVersionState` replaces the
 * release state, and the IDFA declaration moved to app privacy. Drop them so
 * the attribute spread does not publish an answer callers should not branch on.
 */
function normalizeAppStoreVersion(resource: Record<string, unknown>): Record<string, unknown> {
  const version = normalizeResource(resource, "App Store Connect version");
  delete version.appStoreState;
  delete version.usesIdfa;
  return version;
}

function indexIncludedResources(payload: unknown): IncludedResources {
  const included: IncludedResources = new Map();
  for (const item of looseArray(recordOrEmpty(payload).included)) {
    const resource = optionalRecord(item);
    const key = linkageKey(resource);
    if (resource && key) {
      included.set(key, resource);
    }
  }
  return included;
}

function readIncludedResource(
  resource: Record<string, unknown>,
  relationship: string,
  included: IncludedResources,
): Record<string, unknown> | undefined {
  const key = linkageKey(optionalRecord(recordOrEmpty(recordOrEmpty(resource.relationships)[relationship]).data));
  return key === undefined ? undefined : included.get(key);
}

function linkageKey(resource: Record<string, unknown> | undefined): string | undefined {
  const type = optionalString(resource?.type);
  const id = optionalString(resource?.id);
  return type && id ? `${type}:${id}` : undefined;
}

/**
 * The cursor for the next page. App Store Connect always publishes it inside
 * the absolute `links.next` URL and only sometimes repeats it as a bare token
 * in `meta.paging.nextCursor`.
 */
function readNextCursor(payload: unknown): string | null {
  const next = optionalString(recordOrEmpty(recordOrEmpty(payload).links).next);
  if (next) {
    try {
      const cursor = new URL(next).searchParams.get("cursor");
      if (cursor) {
        return cursor;
      }
    } catch {
      // Fall through to the paging metadata when links.next is not a URL.
    }
  }

  return optionalString(readPaging(payload).nextCursor) ?? null;
}

function readTotal(payload: unknown): number | null {
  return optionalInteger(readPaging(payload).total) ?? null;
}

function readPaging(payload: unknown): Record<string, unknown> {
  return recordOrEmpty(recordOrEmpty(recordOrEmpty(payload).meta).paging);
}

function readAppSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const app = normalizeResource(resource, "App Store Connect app");
  return { id: app.id, name: rawStringOrNull(app.name), bundleId: rawStringOrNull(app.bundleId) };
}

function readPreReleaseVersionSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const version = normalizeResource(resource, "App Store Connect prerelease version");
  return { id: version.id, version: rawStringOrNull(version.version), platform: rawStringOrNull(version.platform) };
}

function readBetaReviewSubmissionSummary(
  resource: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const submission = normalizeResource(resource, "App Store Connect beta app review submission");
  return {
    id: submission.id,
    betaReviewState: rawStringOrNull(submission.betaReviewState),
    submittedDate: rawStringOrNull(submission.submittedDate),
  };
}

function readReviewResponseSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const response = normalizeResource(resource, "App Store Connect customer review response");
  return {
    id: response.id,
    responseBody: rawStringOrNull(response.responseBody),
    lastModifiedDate: rawStringOrNull(response.lastModifiedDate),
    state: rawStringOrNull(response.state),
  };
}

function readTestNotes(resource: Record<string, unknown>): Record<string, unknown> {
  const localization = normalizeResource(resource, "App Store Connect beta build localization");
  return {
    id: localization.id,
    locale: rawStringOrNull(localization.locale),
    whatsNew: rawStringOrNull(localization.whatsNew),
  };
}

function readLocalizationId(payload: unknown): string | undefined {
  const localizations = readCollection(payload, "App Store Connect beta build localization list");
  return optionalString(localizations[0]?.id);
}

/**
 * Read a caller-supplied App Store Connect resource identifier.
 *
 * `.` and `..` are never identifiers, and the shared `encodePathSegment` leaves
 * them for the URL parser to collapse: `buildId: ".."` would turn a build
 * subresource path into the team-wide collection and let the action write to an
 * unrelated build. Reject them while the id is read, so every identifier is
 * guarded whether it ends up in a path, a filter, or a relationship linkage.
 */
function readAppStoreConnectId(value: unknown, fieldName: string): string {
  const id = requiredInputString(value, fieldName);
  if (id === "." || id === "..") {
    throw providerInputError(`${fieldName} must not be . or ..`);
  }

  return id;
}

function readIdentifierList(value: unknown, fieldName: string): string[] {
  const identifiers = optionalStringArray(value);
  if (!identifiers?.length) {
    throw providerInputError(`${fieldName} must contain at least one identifier`);
  }

  return identifiers;
}

function readCommaSeparatedList(value: unknown): string | undefined {
  const values = optionalStringArray(value);
  return values?.length ? values.join(",") : undefined;
}

function toOneLinkage(type: string, id: string): { data: { type: string; id: string } } {
  return { data: { type, id } };
}

function toManyLinkage(type: string, ids: readonly string[]): { data: Array<{ type: string; id: string }> } {
  return { data: ids.map((id) => ({ type, id })) };
}
