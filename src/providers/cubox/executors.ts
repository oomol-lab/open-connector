import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requireCustomCredential,
} from "../provider-runtime.ts";

const service = "cubox";
const cuboxApiHost = "cubox.pro";
const cuboxSavePathPattern = /^\/c\/api\/save\/[^/]+\/?$/u;
const cuboxSuccessCode = 200;

interface CuboxContext {
  apiUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type CuboxActionHandler = ProviderRuntimeHandler<CuboxContext>;

export const cuboxActionHandlers: ProviderActionHandlers<typeof service, CuboxActionHandler> = {
  async save_url(input, context) {
    const contentUrl = assertPublicHttpUrl(requiredString(input.url, "url", providerInputError), {
      fieldName: "url",
      createError: providerInputError,
    });
    const response = await context.fetcher(context.apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(
        compactObject({
          type: "url",
          content: contentUrl.toString(),
          title: optionalString(input.title),
          description: optionalString(input.description),
          tags: optionalStringArray(input.tags),
          folder: optionalString(input.folder),
        }),
      ),
      signal: context.signal,
    });

    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "Cubox returned an invalid JSON response.",
        maxBytes: 64 * 1024,
      }),
    );
    const code = optionalInteger(payload?.code);
    if (!response.ok) {
      throw new ProviderRequestError(response.status, `Cubox request failed with HTTP ${response.status}.`);
    }
    if (code !== cuboxSuccessCode) {
      throw new ProviderRequestError(502, "Cubox did not accept the page.");
    }

    return { queued: true };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CuboxContext>({
  service,
  handlers: cuboxActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<CuboxContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      apiUrl: normalizeCuboxApiUrl(requiredString(credential.values.apiUrl, "apiUrl", providerInputError)),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Cubox request failed.",
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input) {
    normalizeCuboxApiUrl(requiredString(input.values.apiUrl, "apiUrl", providerInputError));
  },
};

/** Normalize and restrict the secret Cubox API URL before provider egress. */
export function normalizeCuboxApiUrl(value: string): string {
  const url = assertPublicHttpUrl(value, {
    fieldName: "apiUrl",
    createError: providerInputError,
  });

  if (url.protocol !== "https:") {
    throw providerInputError("apiUrl must use https");
  }
  if (url.hostname !== cuboxApiHost || url.port !== "") {
    throw providerInputError(`apiUrl must use https://${cuboxApiHost}`);
  }
  if (url.username || url.password) {
    throw providerInputError("apiUrl must not include URL credentials");
  }
  if (!cuboxSavePathPattern.test(url.pathname) || url.search || url.hash) {
    throw providerInputError("apiUrl must be a Cubox API Extension save URL");
  }

  return url.toString();
}
