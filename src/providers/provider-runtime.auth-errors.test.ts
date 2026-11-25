import { expect, it, vi } from "vitest";
import { credentialValidators as jinshuju } from "./jinshuju/executors.ts";
import { credentialValidators as onomeo } from "./onomeo/executors.ts";
import { providerRequestErrorCode, ProviderRequestError } from "./provider-runtime.ts";
import { credentialValidators as teamorouter } from "./teamorouter/executors.ts";
import { credentialValidators as yuque } from "./yuque/executors.ts";

for (const [service, validators] of Object.entries({ jinshuju, yuque, onomeo, teamorouter })) {
  it.each([
    [400, "invalid_input"],
    [401, "provider_error"],
    [403, "provider_error"],
    [404, "invalid_input"],
    [429, "rate_limited"],
    [503, "provider_error"],
  ])(`${service} preserves the error classification for HTTP %i`, async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: "Upstream error" }, { status: Number(status) }));
    const error = await validators.apiKey!({ apiKey: "key", values: {} }, { fetcher }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(providerRequestErrorCode(error as ProviderRequestError)).toBe(code);
  });
}
