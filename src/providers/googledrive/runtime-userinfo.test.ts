import { expect, it, vi } from "vitest";
import { readGoogleUserInfo } from "./runtime-userinfo.ts";

it("reads Google identity with the supplied token", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ sub: "google-sub", email: "user@example.com", name: "User", ignored: "unused" });
  });
  await expect(
    readGoogleUserInfo({ accessToken: "access-token", fetcher, signal: controller.signal }),
  ).resolves.toEqual({
    sub: "google-sub",
    email: "user@example.com",
    name: "User",
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[0]).toBe("https://openidconnect.googleapis.com/v1/userinfo");
});

it("cancels the UserInfo request when the caller aborts", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    controller.abort();
    init?.signal?.throwIfAborted();
    throw new Error("Expected an aborted signal");
  });
  await expect(
    readGoogleUserInfo({ accessToken: "access-token", fetcher, signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each([
  null,
  {},
  { email: "user@example.com" },
  { sub: " ", email: "user@example.com" },
  { sub: "google-sub" },
  { sub: "google-sub", email: " " },
])("rejects missing identity fields instead of inventing an account: %j", async (payload) => {
  await expect(
    readGoogleUserInfo({
      accessToken: "access-token",
      fetcher: async () => Response.json(payload),
    }),
  ).rejects.toMatchObject({ status: 502 });
});

it("propagates an upstream authorization failure without trying another endpoint", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ error: { message: "Unauthorized" } }, { status: 401 }),
  );
  await expect(readGoogleUserInfo({ accessToken: "expired-token", fetcher })).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledOnce();
});
