import { expect, it } from "vitest";
import { createProviderFetch } from "../providers/provider-runtime.ts";
import { withProviderHttpDispatch } from "./provider-http-dispatch.ts";
import { getProviderNetworkPolicy } from "./provider-network-policy.ts";
import { withRuntimeExecution } from "./runtime-execution.ts";

it("isolates concurrent runtime network policies and dispatch identity", async () => {
  const attempts: string[] = [];
  const fetcher = createProviderFetch({ fetch: async () => Response.json({ ok: true }), skipDnsValidation: true });
  await Promise.all(
    ["first", "second"].map((service) =>
      withRuntimeExecution(
        {
          network: { trustedHosts: [service] },
          providerHttpDispatch: {
            beforeAttempt: (attempt) => {
              attempts.push(`${attempt.context.service}:${getProviderNetworkPolicy().trustedHosts?.[0]}`);
              return { allow: true };
            },
          },
        },
        { operation: "action", service },
        async () => {
          await Promise.resolve();
          expect(getProviderNetworkPolicy().trustedHosts).toEqual([service]);
          await fetcher("https://example.com");
        },
      ),
    ),
  );
  expect(attempts.sort()).toEqual(["first:first", "second:second"]);
  expect(getProviderNetworkPolicy().trustedHosts).toBeUndefined();
});

it("inherits entry policy while a nested invocation enriches dispatch identity", async () => {
  const identities: unknown[] = [];
  const fetcher = createProviderFetch({ fetch: async () => Response.json({}), skipDnsValidation: true });
  await withRuntimeExecution(
    {
      network: { allowPrivateNetwork: true },
      providerHttpDispatch: {
        beforeAttempt: (attempt) => {
          identities.push(attempt.context);
          expect(getProviderNetworkPolicy().allowPrivateNetwork).toBe(true);
          return { allow: true };
        },
      },
    },
    { operation: "runtime" },
    () =>
      withRuntimeExecution({}, { operation: "action", service: "example" }, () =>
        withProviderHttpDispatch({ operation: "action", service: "example", connectionId: "account" }, () =>
          fetcher("https://example.com"),
        ),
      ),
  );
  expect(identities).toMatchObject([{ operation: "action", service: "example", connectionId: "account" }]);
});

it("restores the parent network policy after a failed invocation", async () => {
  await withRuntimeExecution({ network: { trustedHosts: ["parent"] } }, { operation: "runtime" }, async () => {
    await expect(
      withRuntimeExecution({ network: { trustedHosts: ["child"] } }, { operation: "trigger" }, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(getProviderNetworkPolicy().trustedHosts).toEqual(["parent"]);
  });
});
