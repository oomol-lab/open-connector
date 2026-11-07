import { looseArray, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredResponseRecord, runProviderRequest } from "../provider-runtime.ts";
export async function readEbayResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "eBay returned invalid JSON", undefined, "provider_error");
  }
  if (!response.ok) {
    const body = optionalRecord(payload);
    const messages = looseArray(body?.errors)
      .map((value) => {
        const error = optionalRecord(value);
        return [optionalNumber(error?.errorId), optionalString(error?.message), optionalString(error?.longMessage)]
          .filter((part) => part != null)
          .join(": ");
      })
      .filter(Boolean);
    const oauthError = [optionalString(body?.error), optionalString(body?.error_description)]
      .filter(Boolean)
      .join(": ");
    throw new ProviderRequestError(
      response.status,
      `eBay request failed (HTTP ${response.status})${messages.length || oauthError ? `: ${messages.join("; ") || oauthError}` : ""}`,
      undefined,
      "provider_error",
    );
  }
  return requiredResponseRecord(payload, "eBay response");
}

export async function requestEbay(
  url: string | URL,
  accessToken: string,
  fetcher: typeof fetch,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "eBay" }, async (signal) => {
    const response = await fetcher(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
      redirect: "manual",
    });
    if (body && response.ok) {
      const location = response.headers.get("location");
      if (!location)
        throw new ProviderRequestError(502, "eBay shipment response is missing Location", undefined, "provider_error");
      const resourceUrl = new URL(location, url);
      const encodedId = resourceUrl.pathname.split("/").filter(Boolean).at(-1);
      if (!encodedId || !resourceUrl.pathname.includes("/shipping_fulfillment/"))
        throw new ProviderRequestError(502, "eBay returned an invalid shipment Location", undefined, "provider_error");
      return { fulfillmentId: decodeURIComponent(encodedId), location: resourceUrl.toString() };
    }
    return readEbayResponse(response);
  });
}
