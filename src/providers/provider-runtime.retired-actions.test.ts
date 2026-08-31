import { describe, expect, it } from "vitest";
import { openweatherApiActionHandlers } from "./openweather_api/executors.ts";
import { ProviderRequestError } from "./provider-runtime.ts";

// An action the upstream API retired is a caller error, and the runtime derives
// the outward HTTP status from the error code alone: `RuntimeStatus` in
// src/server/api/runtime-api.ts has no 410, so a 410 raised here would survive
// only as a misleading `data.status`. Sub-500 statuses report as invalid_input
// with HTTP 400, so 400 is the status this branch has to raise.

describe("provider retired actions", () => {
  it("reports the retired OpenWeather weather-triggers action with a status the runtime can express", async () => {
    const error = await Promise.resolve()
      .then(() =>
        openweatherApiActionHandlers.get_weather_triggers(
          {},
          {
            apiKey: "test-key",
            fetcher: () => Promise.reject(new Error("the retired action must not reach the network")),
          },
        ),
      )
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect((error as ProviderRequestError).status).toBe(400);
    expect((error as ProviderRequestError).message).toBe(
      "OpenWeather retired Weather Triggers API on August 1, 2025; this action is no longer available.",
    );
  });
});
