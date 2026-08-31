import { describe, expect, it } from "vitest";
import { abuseipdbActionHandlers } from "./abuseipdb/executors.ts";
import { datadogActionHandlers } from "./datadog/executors.ts";
import { gammaActionHandlers } from "./gamma/executors.ts";
import { ProviderRequestError } from "./provider-runtime.ts";

// `AbortSignal.timeout()` aborts with a `TimeoutError`, not an `AbortError`, so
// a provider whose timeout branch only recognizes `AbortError` reports its own
// budget expiry as a generic upstream failure. These cases pin the timeout
// branch of the providers that used to carry such a predicate, and the 502 that
// an ordinary transport failure still has to produce, so a guard widened to
// match every error is caught here rather than mislabeling every failure.

function timeoutAbortError(): DOMException {
  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

async function caught(promise: Promise<unknown>): Promise<ProviderRequestError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderRequestError);
  return error as ProviderRequestError;
}

describe("provider timeout branches", () => {
  it("reports an AbuseIPDB timeout as 504 rather than a generic failure", async () => {
    const error = await caught(
      abuseipdbActionHandlers.blacklist(
        {},
        {
          apiKey: "test-key",
          fetcher: () => Promise.reject(timeoutAbortError()),
        },
      ),
    );

    expect(error.status).toBe(504);
    expect(error.message).toBe("AbuseIPDB request timed out");
  });

  it("still reports a non-abort AbuseIPDB failure as 502", async () => {
    const error = await caught(
      abuseipdbActionHandlers.blacklist(
        {},
        {
          apiKey: "test-key",
          fetcher: () => Promise.reject(new TypeError("fetch failed")),
        },
      ),
    );

    expect(error.status).toBe(502);
    expect(error.message).toBe("AbuseIPDB request failed: fetch failed");
  });

  it("reports a Datadog timeout as 504 rather than a generic failure", async () => {
    const error = await caught(
      datadogActionHandlers.list_monitors(
        {},
        {
          baseUrl: "https://api.datadoghq.com",
          apiKey: "test-key",
          applicationKey: "test-app-key",
          fetcher: () => Promise.reject(timeoutAbortError()),
        },
      ),
    );

    expect(error.status).toBe(504);
    expect(error.message).toBe("Datadog request timed out");
  });

  it("still reports a non-abort Datadog failure as 502", async () => {
    const error = await caught(
      datadogActionHandlers.list_monitors(
        {},
        {
          baseUrl: "https://api.datadoghq.com",
          apiKey: "test-key",
          applicationKey: "test-app-key",
          fetcher: () => Promise.reject(new TypeError("fetch failed")),
        },
      ),
    );

    expect(error.status).toBe(502);
    expect(error.message).toBe("Datadog request failed: fetch failed");
  });

  it("reports a Gamma request that outruns a real AbortSignal.timeout budget as 504", async () => {
    const error = await caught(
      gammaActionHandlers.wait_for_generation(
        { generationId: "gen-1", timeoutSeconds: 0.005 },
        {
          apiKey: "test-key",
          async fetcher(_url, init) {
            const signal = init?.signal;
            if (!signal) {
              throw new Error("gamma must pass an abort signal to the fetcher");
            }
            await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
            throw signal.reason;
          },
        },
      ),
    );

    expect(error.status).toBe(504);
    expect(error.message).toBe("Gamma request timed out");
  });
});
