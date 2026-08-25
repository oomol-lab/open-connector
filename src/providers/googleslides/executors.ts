import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { googleJsonRequest } from "../google-runtime.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

export const slidesApiBaseUrl = "https://slides.googleapis.com/v1";
export const googleDriveApiBaseUrl = "https://www.googleapis.com/drive/v3";

const service = "googleslides";
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
const googleSlidesMimeType = "application/vnd.google-apps.presentation";

type GoogleSlidesRuntimeContext = OAuthProviderContext;
type GoogleSlidesActionHandler = (
  input: Record<string, unknown>,
  context: GoogleSlidesRuntimeContext,
) => Promise<unknown>;

type PagePayload = Record<string, unknown> & {
  objectId?: string;
  pageType?: string;
  pageElements?: Array<Record<string, unknown>>;
  pageProperties?: Record<string, unknown>;
  slideProperties?: Record<string, unknown>;
  layoutProperties?: Record<string, unknown>;
  masterProperties?: Record<string, unknown>;
  notesProperties?: Record<string, unknown>;
};

type PresentationPayload = Record<string, unknown> & {
  presentationId?: string;
  title?: string;
  locale?: string;
  revisionId?: string;
  pageSize?: Record<string, unknown>;
  slides?: PagePayload[];
  layouts?: PagePayload[];
  masters?: PagePayload[];
};

interface BatchUpdatePayload {
  presentationId?: string;
  replies?: Array<Record<string, unknown>>;
  writeControl?: Record<string, unknown>;
}

export const googleSlidesActionHandlers: ProviderActionHandlers<"googleslides", GoogleSlidesActionHandler> = {
  create_presentation: createPresentation,
  presentations_get: getPresentation,
  presentations_batch_update: batchUpdatePresentation,
  presentations_pages_get: getPresentationPage,
  get_page_thumbnail2: getPageThumbnail,
  presentations_pages_get_thumbnail: getPageThumbnail,
  presentations_copy_from_template: copyPresentationFromTemplate,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleSlidesActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>(googleUserInfoUrl, {
      accessToken: input.accessToken,
      fetcher,
      signal,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googleslides:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Slides User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function createPresentation(input: Record<string, unknown>, context: GoogleSlidesRuntimeContext) {
  const payload = await slidesJsonRequest<PresentationPayload>("/presentations", {
    context,
    method: "POST",
    body: compactObject({
      title: optionalString(input.title),
      locale: optionalString(input.locale),
      pageSize: optionalRecord(input.pageSize),
      presentationId: optionalString(input.presentationId),
    }),
  });

  return normalizePresentation(payload);
}

async function getPresentation(input: Record<string, unknown>, context: GoogleSlidesRuntimeContext) {
  let presentationId = optionalString(input.presentationId);
  if (!presentationId) {
    const presentationName = optionalString(input.presentationName);
    if (!presentationName) {
      throw new ProviderRequestError(400, "presentationName is required when presentationId is missing");
    }
    presentationId = await findPresentationIdByName(presentationName, context);
  }

  const payload = await slidesJsonRequest<PresentationPayload>(`/presentations/${encodeURIComponent(presentationId)}`, {
    context,
    query: {
      fields: optionalString(input.fields),
    },
  });

  return normalizePresentation(payload);
}

async function batchUpdatePresentation(input: Record<string, unknown>, context: GoogleSlidesRuntimeContext) {
  const presentationId = resolvePresentationId(input);
  const payload = await slidesJsonRequest<BatchUpdatePayload>(
    `/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    {
      context,
      method: "POST",
      body: compactObject({
        requests: objectArray(input.requests, "requests", providerRequestError),
        writeControl: optionalRecord(input.writeControl),
      }),
    },
  );

  return compactObject({
    presentationId: requireString(payload.presentationId ?? presentationId, "missing presentationId"),
    replies: Array.isArray(payload.replies) ? payload.replies : [],
    writeControl: optionalRecord(payload.writeControl),
  });
}

async function getPresentationPage(input: Record<string, unknown>, context: GoogleSlidesRuntimeContext) {
  const payload = await slidesJsonRequest<PagePayload>(
    `/presentations/${encodeURIComponent(resolvePresentationId(input))}/pages/${encodeURIComponent(resolvePageObjectId(input))}`,
    {
      context,
    },
  );

  return normalizePage(payload);
}

async function getPageThumbnail(input: Record<string, unknown>, context: GoogleSlidesRuntimeContext) {
  const payload = await slidesJsonRequest<Record<string, unknown>>(
    `/presentations/${encodeURIComponent(resolvePresentationId(input))}/pages/${encodeURIComponent(resolvePageObjectId(input))}/thumbnail`,
    {
      context,
      query: resolveThumbnailQuery(input),
    },
  );

  return compactObject({
    width: optionalInteger(payload.width),
    height: optionalInteger(payload.height),
    contentUrl: requireString(optionalString(payload.contentUrl), "missing contentUrl"),
  });
}

async function copyPresentationFromTemplate(input: Record<string, unknown>, context: GoogleSlidesRuntimeContext) {
  const templatePresentationId = optionalString(input.templatePresentationId);
  if (!templatePresentationId) {
    throw new ProviderRequestError(400, "templatePresentationId is required");
  }
  const parentFolderId = optionalString(input.parentFolderId);
  const templateMetadata = await driveJsonRequest<{ mimeType?: string }>(
    `/files/${encodeURIComponent(templatePresentationId)}`,
    {
      context,
      query: {
        fields: "mimeType",
        supportsAllDrives: "true",
      },
    },
  );
  if (optionalString(templateMetadata.mimeType) !== googleSlidesMimeType) {
    throw new ProviderRequestError(400, "templatePresentationId must reference a Google Slides presentation");
  }

  const payload = await driveJsonRequest<Record<string, unknown>>(
    `/files/${encodeURIComponent(templatePresentationId)}/copy`,
    {
      context,
      method: "POST",
      query: {
        supportsAllDrives: "true",
      },
      body: compactObject({
        name: optionalString(input.newTitle),
        parents: parentFolderId ? [parentFolderId] : undefined,
      }),
    },
  );
  const driveFileId = requireString(optionalString(payload.id), "missing drive file id");

  return compactObject({
    presentationId: driveFileId,
    driveFileId,
    name: requireString(optionalString(payload.name), "missing copied presentation name"),
    mimeType: requireString(optionalString(payload.mimeType), "missing copied presentation mimeType"),
    webViewLink: optionalString(payload.webViewLink),
    parents: Array.isArray(payload.parents) ? payload.parents.map((item) => String(item)) : undefined,
  });
}

async function findPresentationIdByName(
  presentationName: string,
  context: GoogleSlidesRuntimeContext,
): Promise<string> {
  const payload = await driveJsonRequest<{ files?: Array<{ id?: string }> }>("/files", {
    context,
    query: {
      q: `mimeType='${googleSlidesMimeType}' and name='${escapeDriveQueryValue(presentationName)}' and trashed=false`,
      fields: "files(id,name)",
      orderBy: "modifiedTime desc",
      pageSize: "2",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    },
  });

  const files = Array.isArray(payload.files) ? payload.files : [];
  if (files.length === 0) {
    throw new ProviderRequestError(400, `no googleslides presentation found for presentationName: ${presentationName}`);
  }
  if (files.length > 1) {
    throw new ProviderRequestError(
      400,
      `multiple googleslides presentations found for presentationName: ${presentationName}; use presentationId instead`,
    );
  }

  const presentationId = optionalString(files[0]?.id);
  if (!presentationId) {
    throw new ProviderRequestError(502, "missing presentation id in Drive search result");
  }

  return presentationId;
}

function slidesJsonRequest<T>(
  path: string,
  input: {
    context: GoogleSlidesRuntimeContext;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  return googleJsonRequest<T>(`${slidesApiBaseUrl}${path}`, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function driveJsonRequest<T>(
  path: string,
  input: {
    context: GoogleSlidesRuntimeContext;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  return googleJsonRequest<T>(`${googleDriveApiBaseUrl}${path}`, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function resolvePresentationId(input: Record<string, unknown>): string {
  const presentationId = optionalString(input.presentationId);
  if (!presentationId) {
    throw new ProviderRequestError(400, "presentationId is required");
  }
  return presentationId;
}

function resolvePageObjectId(input: Record<string, unknown>): string {
  const pageObjectId = optionalString(input.pageObjectId);
  if (!pageObjectId) {
    throw new ProviderRequestError(400, "pageObjectId is required");
  }
  return pageObjectId;
}

function resolveThumbnailQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const thumbnailProperties = optionalRecord(input.thumbnailProperties);
  return compactObject({
    "thumbnailProperties.mimeType": optionalString(thumbnailProperties?.mimeType),
    "thumbnailProperties.thumbnailSize": optionalString(thumbnailProperties?.thumbnailSize),
  });
}

function normalizePresentation(payload: PresentationPayload): Record<string, unknown> {
  return compactObject({
    presentationId: optionalString(payload.presentationId),
    title: optionalString(payload.title),
    locale: optionalString(payload.locale),
    revisionId: optionalString(payload.revisionId),
    pageSize: optionalRecord(payload.pageSize),
    slides: Array.isArray(payload.slides) ? payload.slides.map(normalizePage) : undefined,
    layouts: Array.isArray(payload.layouts) ? payload.layouts.map(normalizePage) : undefined,
    masters: Array.isArray(payload.masters) ? payload.masters.map(normalizePage) : undefined,
  });
}

function normalizePage(payload: PagePayload): Record<string, unknown> {
  return compactObject({
    objectId: optionalString(payload.objectId),
    pageType: optionalString(payload.pageType),
    pageElements: Array.isArray(payload.pageElements) ? payload.pageElements : undefined,
    pageProperties: optionalRecord(payload.pageProperties),
    slideProperties: optionalRecord(payload.slideProperties),
    layoutProperties: optionalRecord(payload.layoutProperties),
    masterProperties: optionalRecord(payload.masterProperties),
    notesProperties: optionalRecord(payload.notesProperties),
  });
}

function escapeDriveQueryValue(value: string): string {
  return value.split("\\").join("\\\\").split("'").join("\\'");
}

function requireString(value: string | undefined, message: string): string {
  if (value) {
    return value;
  }
  throw new ProviderRequestError(502, message);
}

function providerRequestError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://slides.googleapis.com/v1",
  auth: { type: "oauth_bearer" },
});
