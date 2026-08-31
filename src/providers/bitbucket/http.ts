import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const bitbucketRequestTimeoutMs = 30_000;
const bitbucketMaxResponseBytes = 10 * 1024 * 1024;

export async function fetchBitbucketText(
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit,
): Promise<{ response: Response; text: string }> {
  const timeout = createProviderTimeout(init.signal ?? undefined, bitbucketRequestTimeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("user-agent", providerUserAgent);
    const response = await fetcher(input, {
      ...init,
      headers,
      signal: timeout.signal,
    });
    return {
      response,
      text: await readLimitedText(response),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "bitbucket request timed out");
    }
    const message = error instanceof Error ? error.message : "network error";
    throw new ProviderRequestError(502, `bitbucket request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readLimitedText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > bitbucketMaxResponseBytes) {
    throw responseTooLargeError();
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > bitbucketMaxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw responseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function responseTooLargeError() {
  return new ProviderRequestError(502, "bitbucket response is too large");
}
