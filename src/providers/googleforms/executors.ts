import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { GoogleFormsActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { googleJsonRequest } from "../google-runtime.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

export const googleFormsApiBaseUrl = "https://forms.googleapis.com/v1/forms";

const service = "googleforms";
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
const allowedPublishUpdateMasks = new Set(["publishState", "*"]);

type GoogleFormsRuntimeContext = OAuthProviderContext;
type GoogleFormsActionHandler = (
  input: Record<string, unknown>,
  context: GoogleFormsRuntimeContext,
) => Promise<unknown>;

interface FormInfoPayload {
  title?: string;
  description?: string;
  documentTitle?: string;
}

interface PublishStatePayload {
  isPublished?: boolean;
  isAcceptingResponses?: boolean;
}

interface PublishState {
  isPublished: boolean;
  isAcceptingResponses: boolean;
}

interface FormPayload {
  formId?: string;
  info?: FormInfoPayload | null;
  revisionId?: string;
  responderUri?: string;
  linkedSheetId?: string;
  settings?: unknown;
  publishSettings?: {
    publishState?: PublishStatePayload | null;
  } | null;
  items?: unknown;
}

interface BatchUpdatePayload {
  replies?: unknown;
  writeControl?: {
    requiredRevisionId?: string;
    targetRevisionId?: string;
  } | null;
  form?: Record<string, unknown> | null;
}

interface FormResponsePayload {
  responseId?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  totalScore?: number;
  answers?: unknown;
}

interface ListResponsesPayload {
  responses?: unknown;
  nextPageToken?: string | null;
}

export const googleFormsActionHandlers: Record<GoogleFormsActionName, GoogleFormsActionHandler> = {
  create_form: createForm,
  get_form: getForm,
  batch_update_form: batchUpdateForm,
  set_publish_settings: setPublishSettings,
  list_responses: listResponses,
  get_response: getResponse,
  list_watches: listWatches,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleFormsActionHandlers);

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
        accountId: profile.email ?? profile.sub ?? "googleforms:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Forms User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function createForm(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const title = requireString(input.title, "title is required");
  const description = optionalString(input.description);
  const documentTitle = optionalString(input.documentTitle);
  const unpublished = optionalBoolean(input.unpublished);

  const created = await googleFormsJsonRequest<FormPayload>(googleFormsApiBaseUrl, {
    context,
    method: "POST",
    body: {
      info: compactObject({
        title,
        documentTitle,
      }),
    },
    query: compactObject({
      unpublished: unpublished == null ? undefined : String(unpublished),
    }),
  });

  const result = normalizeFormSummary(created, description ? { description } : undefined);
  if (!description) {
    return result;
  }

  const formId = requireString(created.formId, "missing googleforms formId");
  const update = await googleFormsJsonRequest<BatchUpdatePayload>(
    `${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}:batchUpdate`,
    {
      context,
      method: "POST",
      body: {
        requests: [
          {
            updateFormInfo: {
              info: {
                description,
              },
              updateMask: "description",
            },
          },
        ],
      },
    },
  );

  const nextRevisionId =
    optionalString(update.writeControl?.requiredRevisionId) ?? optionalString(update.writeControl?.targetRevisionId);

  return compactObject({
    ...result,
    description,
    revisionId: nextRevisionId ?? result.revisionId,
  });
}

async function getForm(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const formId = requireString(input.formId, "formId is required");
  const payload = await googleFormsJsonRequest<FormPayload>(`${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}`, {
    context,
  });

  return normalizeFormDetail(payload);
}

async function batchUpdateForm(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const formId = requireString(input.formId, "formId is required");
  const requests = objectArray(input.requests, "requests", providerRequestError);
  const includeFormInResponse = input.includeFormInResponse === true;

  const payload = await googleFormsJsonRequest<BatchUpdatePayload>(
    `${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}:batchUpdate`,
    {
      context,
      method: "POST",
      body: compactObject({
        requests,
        writeControl: buildWriteControl(input),
        includeFormInResponse: includeFormInResponse ? true : undefined,
      }),
    },
  );

  return compactObject({
    formId,
    requestCount: requests.length,
    replies: Array.isArray(payload.replies) ? payload.replies : [],
    requiredRevisionId: optionalString(payload.writeControl?.requiredRevisionId),
    targetRevisionId: optionalString(payload.writeControl?.targetRevisionId),
    form: includeFormInResponse && optionalRecord(payload.form) ? payload.form : undefined,
  });
}

async function setPublishSettings(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const formId = requireString(input.formId, "formId is required");
  const updateMask = optionalString(input.updateMask);
  if (updateMask && !allowedPublishUpdateMasks.has(updateMask)) {
    throw new ProviderRequestError(400, "updateMask must be publishState or *");
  }
  const requestedState = readPublishStateInput(input);

  const payload = await googleFormsJsonRequest<FormPayload>(
    `${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}:setPublishSettings`,
    {
      context,
      method: "POST",
      body: buildPublishSettingsRequestBody(requestedState, updateMask),
    },
  );

  return normalizeSetPublishSettingsResult(formId, requestedState, payload);
}

async function listResponses(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const formId = requireString(input.formId, "formId is required");
  const payload = await googleFormsJsonRequest<ListResponsesPayload>(
    `${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}/responses`,
    {
      context,
      query: compactObject({
        filter: optionalString(input.filter),
        pageSize: integerQuery(input.pageSize),
        pageToken: optionalString(input.pageToken),
      }),
    },
  );

  return {
    responses: Array.isArray(payload.responses)
      ? payload.responses.map((response) => normalizeFormResponse(response))
      : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getResponse(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const formId = requireString(input.formId, "formId is required");
  const responseId = requireString(input.responseId, "responseId is required");

  const payload = await googleFormsJsonRequest<FormResponsePayload>(
    `${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}/responses/${encodeURIComponent(responseId)}`,
    {
      context,
    },
  );

  return normalizeFormResponse(payload);
}

async function listWatches(input: Record<string, unknown>, context: GoogleFormsRuntimeContext) {
  const formId = requireString(input.formId, "formId is required");
  const payload = await googleFormsJsonRequest<{ watches?: unknown }>(
    `${googleFormsApiBaseUrl}/${encodeURIComponent(formId)}/watches`,
    {
      context,
    },
  );

  return {
    watches: Array.isArray(payload.watches) ? payload.watches.map((watch) => normalizeWatch(watch)) : [],
  };
}

function readPublishStateInput(input: Record<string, unknown>): PublishState {
  const publishSettings = optionalRecord(input.publishSettings);
  const publishState = optionalRecord(publishSettings?.publishState);

  const state = {
    isPublished: requireBoolean(publishState?.isPublished, "isPublished is required"),
    isAcceptingResponses: requireBoolean(publishState?.isAcceptingResponses, "isAcceptingResponses is required"),
  };
  if (!state.isPublished && state.isAcceptingResponses) {
    throw new ProviderRequestError(400, "isAcceptingResponses cannot be true when isPublished is false");
  }
  return state;
}

function buildPublishSettingsRequestBody(state: PublishState, updateMask: string | undefined): Record<string, unknown> {
  return compactObject({
    publishSettings: {
      publishState: {
        isPublished: state.isPublished,
        isAcceptingResponses: state.isAcceptingResponses,
      },
    },
    updateMask,
  });
}

function normalizeSetPublishSettingsResult(
  formId: string,
  requestedState: PublishState,
  payload: FormPayload,
): Record<string, unknown> {
  const responseState = normalizePublishSettings(payload.publishSettings);
  const state = responseState ?? requestedState;
  return {
    formId: optionalString(payload.formId) ?? formId,
    isPublished: state.isPublished,
    isAcceptingResponses: state.isAcceptingResponses,
  };
}

function normalizeFormSummary(
  payload: FormPayload,
  overrides?: {
    description?: string;
  },
): Record<string, unknown> {
  const info = optionalRecord(payload.info);
  const publishSettings = normalizePublishSettings(payload.publishSettings);

  return compactObject({
    formId: requireString(payload.formId, "missing googleforms formId"),
    title: requireString(info?.title, "missing googleforms form title"),
    description: overrides?.description ?? optionalString(info?.description),
    documentTitle: optionalString(info?.documentTitle),
    revisionId: optionalString(payload.revisionId),
    responderUri: optionalString(payload.responderUri),
    linkedSheetId: optionalString(payload.linkedSheetId),
    isPublished: publishSettings?.isPublished,
    isAcceptingResponses: publishSettings?.isAcceptingResponses,
  });
}

function normalizeFormDetail(payload: FormPayload): Record<string, unknown> {
  const info = optionalRecord(payload.info);
  const settings = normalizeSettings(payload.settings);
  const publishSettings = normalizePublishSettings(payload.publishSettings);
  return compactObject({
    formId: requireString(payload.formId, "missing googleforms formId"),
    title: requireString(info?.title, "missing googleforms form title"),
    description: optionalString(info?.description),
    documentTitle: optionalString(info?.documentTitle),
    revisionId: optionalString(payload.revisionId),
    responderUri: optionalString(payload.responderUri),
    linkedSheetId: optionalString(payload.linkedSheetId),
    settings,
    publishSettings,
    items: Array.isArray(payload.items) ? payload.items.map((item) => normalizeItem(item)) : [],
  });
}

function normalizeSettings(value: unknown): Record<string, unknown> | undefined {
  const settings = optionalRecord(value);
  const quizSettings = optionalRecord(settings?.quizSettings);
  if (!quizSettings) {
    return undefined;
  }

  const isQuiz = optionalBoolean(quizSettings.isQuiz);
  if (isQuiz == null) {
    return undefined;
  }

  return {
    quizSettings: {
      isQuiz,
    },
  };
}

function normalizeItem(value: unknown): Record<string, unknown> {
  const item = optionalRecord(value);
  if (!item) {
    return {};
  }

  return compactObject({
    itemId: optionalString(item.itemId),
    title: optionalString(item.title),
    description: optionalString(item.description),
    questionItem: optionalRecord(item.questionItem),
    questionGroupItem: optionalRecord(item.questionGroupItem),
    pageBreakItem: optionalRecord(item.pageBreakItem),
    textItem: optionalRecord(item.textItem),
    imageItem: optionalRecord(item.imageItem),
    videoItem: optionalRecord(item.videoItem),
  });
}

function normalizePublishSettings(value: unknown): PublishState | undefined {
  const publishSettings = optionalRecord(value);
  const publishState = optionalRecord(publishSettings?.publishState);
  if (!publishState) {
    return undefined;
  }

  return {
    isPublished: optionalBoolean(publishState.isPublished) ?? false,
    isAcceptingResponses: optionalBoolean(publishState.isAcceptingResponses) ?? false,
  };
}

function normalizeFormResponse(value: unknown): Record<string, unknown> {
  const response = optionalRecord(value);
  if (!response) {
    throw new ProviderRequestError(502, "invalid googleforms response payload");
  }

  return compactObject({
    responseId: requireString(response.responseId, "missing googleforms responseId"),
    createTime: optionalString(response.createTime),
    lastSubmittedTime: optionalString(response.lastSubmittedTime),
    respondentEmail: optionalString(response.respondentEmail),
    totalScore: typeof response.totalScore === "number" ? response.totalScore : undefined,
    answers: normalizeAnswersMap(response.answers),
  });
}

function normalizeAnswersMap(value: unknown): Record<string, Record<string, unknown>> {
  const rawAnswers = optionalRecord(value);
  if (!rawAnswers) {
    return {};
  }

  const answers: Record<string, Record<string, unknown>> = {};
  for (const [key, answer] of Object.entries(rawAnswers)) {
    const answerObject = optionalRecord(answer);
    if (!answerObject) {
      continue;
    }

    answers[key] = compactObject({
      questionId: optionalString(answerObject.questionId),
      grade: optionalRecord(answerObject.grade),
      textAnswers: optionalRecord(answerObject.textAnswers),
      fileUploadAnswers: optionalRecord(answerObject.fileUploadAnswers),
    });
  }
  return answers;
}

function normalizeWatch(value: unknown): Record<string, unknown> {
  const watch = optionalRecord(value);
  if (!watch) {
    throw new ProviderRequestError(502, "invalid googleforms watch payload");
  }

  const target = optionalRecord(watch.target);
  const topic = optionalRecord(target?.topic);

  return compactObject({
    id: requireString(watch.id, "missing googleforms watch id"),
    eventType: requireString(watch.eventType, "missing googleforms watch eventType"),
    state: optionalString(watch.state),
    errorType: optionalString(watch.errorType),
    createTime: optionalString(watch.createTime),
    expireTime: optionalString(watch.expireTime),
    target: {
      topicName: requireString(topic?.topicName, "missing googleforms watch target topicName"),
    },
  });
}

function buildWriteControl(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const requiredRevisionId = optionalString(input.requiredRevisionId);
  const targetRevisionId = optionalString(input.targetRevisionId);
  if (requiredRevisionId && targetRevisionId) {
    throw new ProviderRequestError(400, "requiredRevisionId and targetRevisionId are mutually exclusive");
  }
  if (!requiredRevisionId && !targetRevisionId) {
    return undefined;
  }

  return compactObject({
    requiredRevisionId,
    targetRevisionId,
  });
}

async function googleFormsJsonRequest<T>(
  url: string,
  input: {
    context: Pick<GoogleFormsRuntimeContext, "accessToken" | "fetcher" | "signal">;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<T> {
  return googleJsonRequest<T>(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function requireString(value: unknown, message: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, message);
  }
  return resolved;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, message);
  }
  return value;
}

function integerQuery(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer !== undefined ? String(integer) : undefined;
}

function providerRequestError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
