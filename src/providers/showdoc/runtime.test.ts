import type { TransitFileWriter } from "../../core/types.ts";

import { afterEach, expect, it, vi } from "vitest";
import { providerFetch } from "../provider-runtime.ts";
import { requestShowdoc, uploadAttachment } from "./runtime.ts";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));
afterEach(() => vi.unstubAllGlobals());

it("refuses redirects without replaying JSON credentials", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      status: 307,
      headers: { location: "https://other.example/collect" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    requestShowdoc(
      "getCatalogTree",
      {},
      {
        apiKey: "key",
        apiToken: "token",
        fetcher: providerFetch,
      },
    ),
  ).rejects.toMatchObject({ status: 307 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("manual");
});

it.each([200, 307])("uploads through a buffered transit backend and cleans up after HTTP %i", async (status) => {
  let stored: File | undefined;
  const store: TransitFileWriter = {
    maxBytes: 1024,
    async create(file) {
      stored = file;
      return {
        fileId: "staged.txt",
        downloadUrl: "https://files.example/staged.txt",
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      };
    },
    async read() {
      throw new Error("Unexpected buffered read");
    },
    async response() {
      return new Response(stored);
    },
    delete: vi.fn(async () => {
      stored = undefined;
      return true;
    }),
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url) === "https://files.example/a.txt") return new Response("file bytes");
    const form = await new Request(url, init).formData();
    expect(form.get("api_key")).toBe("key");
    expect(form.get("api_token")).toBe("token");
    expect(await (form.get("file") as File).text()).toBe("file bytes");
    return status === 200
      ? Response.json({ error_code: 0, data: { attachment_id: 1 } })
      : new Response(null, { status, headers: { location: "https://other.example/collect" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = uploadAttachment(
    { fileUrl: "https://files.example/a.txt" },
    {
      apiKey: "key",
      apiToken: "token",
      fetcher: providerFetch,
      transitFiles: store,
    },
  );
  if (status === 200) await expect(result).resolves.toEqual({ attachment_id: 1 });
  else await expect(result).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[1]?.redirect).toBe("manual");
  expect(store.delete).toHaveBeenCalledWith("staged.txt");
  expect(stored).toBeUndefined();
});
