import type { JsonValue } from "./common/types.ts";

import { expect, test, vi } from "vitest";
import { reconcileManagedWebhook } from "./managed-webhook.ts";

test.each([false, true])("persists provider verification state before alignment (existing=%s)", async (existing) => {
  const saved: Readonly<Record<string, JsonValue>>[] = [];
  const hook = {
    id: "hook",
    secret: "secret",
    state: { callbackURL: "https://flow.example/callback", hookId: "untrusted" },
  };
  const create = vi.fn(async () => hook);
  await reconcileManagedWebhook(
    {
      active: true,
      callbackSecret: "secret",
      config: {},
      connector: { execute: async () => ({ status: 200, data: {} }) },
      endpointUrl: "https://flow.example/callback",
      idempotencyKey: "key",
      now: new Date(0),
      state: {
        subscription: {},
        checkpoint: null,
        saveCheckpoint: async () => {},
        saveSubscription: async (value) => {
          saved.push(value);
        },
      },
    },
    {
      find: async () => (existing ? [hook] : []),
      create,
      remove: async () => {},
      align: async () => {
        expect(saved.at(-1)).toEqual({
          callbackURL: "https://flow.example/callback",
          hookId: "hook",
          secret: "secret",
        });
      },
    },
  );
  expect(create).toHaveBeenCalledTimes(existing ? 0 : 1);
  expect(saved.at(-1)).toEqual({ callbackURL: "https://flow.example/callback", hookId: "hook", secret: "secret" });
});
