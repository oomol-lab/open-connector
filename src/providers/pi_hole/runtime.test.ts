import type { PiHoleActionContext } from "./runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  clearPiHoleSessionCache,
  normalizePiHoleApiPath,
  normalizePiHoleBaseUrl,
  piHoleActionHandlers,
  validatePiHoleCredential,
} from "./runtime.ts";
import { createTestContext, sessionResponse } from "./test-helpers.ts";

afterEach(() => {
  setPrivateNetworkAccessAllowed(false);
  clearPiHoleSessionCache();
});

describe("normalizePiHoleBaseUrl", () => {
  it("allows a public host", () => {
    expect(normalizePiHoleBaseUrl("https://pi.example.com")).toBe("https://pi.example.com");
  });

  it("keeps an instance mounted below a path prefix", () => {
    expect(normalizePiHoleBaseUrl("https://example.com/pihole/")).toBe("https://example.com/pihole");
  });

  it("strips a trailing api segment users often paste from API docs", () => {
    expect(normalizePiHoleBaseUrl("https://pi.hole/api")).toBe("https://pi.hole");
    expect(normalizePiHoleBaseUrl("http://pi.hole/API/")).toBe("http://pi.hole");
    expect(normalizePiHoleBaseUrl("https://example.com/pihole/api")).toBe("https://example.com/pihole");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizePiHoleBaseUrl("http://10.0.0.2")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizePiHoleBaseUrl("http://10.0.0.2")).toBe("http://10.0.0.2");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizePiHoleBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizePiHoleBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizePiHoleBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });

  it("rejects URLs carrying user info, query, or hash", () => {
    expect(() => normalizePiHoleBaseUrl("https://user:pass@pi.hole")).toThrow("clean instance root URL");
    expect(() => normalizePiHoleBaseUrl("https://pi.hole?x=1")).toThrow("clean instance root URL");
  });
});

describe("normalizePiHoleApiPath", () => {
  it("defaults to the standard api segment", () => {
    expect(normalizePiHoleApiPath(undefined)).toBe("api");
  });

  it("strips surrounding slashes", () => {
    expect(normalizePiHoleApiPath("/pihole/api/")).toBe("pihole/api");
  });
});

describe("Pi-hole session handling", () => {
  it("shares one login across concurrent cold-start requests", async () => {
    let authCalls = 0;
    let resolved = 0;
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        authCalls += 1;
        return sessionResponse("sid-1");
      }
      if (request.url.pathname === "/api/stats/summary") {
        return Promise.resolve().then(() => {
          resolved += 1;
          return Response.json({ domains_being_blocked: 2, took: 0.1 });
        });
      }
      return undefined;
    });

    const results = await Promise.all([
      piHoleActionHandlers.get_overview!({}, context),
      piHoleActionHandlers.get_overview!({}, context),
      piHoleActionHandlers.get_overview!({}, context),
    ]);

    expect(results).toHaveLength(3);
    expect(authCalls).toBe(1);
    expect(resolved).toBe(3);
  });

  it("logs in with the application password and reuses the session", async () => {
    let authCalls = 0;
    let summaryCalls = 0;
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        authCalls += 1;
        expect(request.body).toEqual({ password: "app-password" });
        return sessionResponse("sid-1");
      }
      if (request.url.pathname === "/api/stats/summary") {
        summaryCalls += 1;
        expect(request.headers.get("x-ftl-sid")).toBe("sid-1");
        return Response.json({ domains_being_blocked: 5, took: 0.1 });
      }
      return undefined;
    });

    const first = await piHoleActionHandlers.get_overview!({}, context);
    expect(first).toEqual({ summary: { domains_being_blocked: 5 } });

    const second = await piHoleActionHandlers.get_overview!({}, context);
    expect(second).toEqual({ summary: { domains_being_blocked: 5 } });

    expect(authCalls).toBe(1);
    expect(summaryCalls).toBe(2);
    expect(
      requests.filter((request) => request.method === "POST" && request.url.pathname === "/api/auth"),
    ).toHaveLength(1);
  });

  it("re-authenticates once when the server rejects the cached session", async () => {
    let dnsCalls = 0;
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse(`sid-${dnsCalls}`);
      }
      if (request.url.pathname === "/api/dns/blocking") {
        dnsCalls += 1;
        if (dnsCalls === 1) {
          return Response.json(
            { error: { key: "unauthorized", message: "Unauthorized", hint: null }, took: 0.1 },
            { status: 401 },
          );
        }
        expect(request.headers.get("x-ftl-sid")).toBe("sid-1");
        return Response.json({ blocking: "enabled", timer: null, took: 0.1 });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.get_dns_blocking_status!({}, context);
    expect(result).toEqual({ blocking: "enabled", timer: null });
    expect(dnsCalls).toBe(2);
    expect(requests.filter((request) => request.url.pathname === "/api/auth")).toHaveLength(2);
  });

  it("surfaces an invalid application password", async () => {
    const { context } = createTestContext((request) => {
      if (request.url.pathname === "/api/auth") {
        // The spec reports a rejected password as 200 with an invalid session.
        return Response.json({
          session: { valid: false, sid: null, validity: -1, totp: false, message: "password incorrect" },
          took: 0.1,
        });
      }
      return undefined;
    });

    await expect(piHoleActionHandlers.get_overview!({}, context)).rejects.toThrow(
      "Invalid Pi-hole application password",
    );
  });
});

describe("update_config", () => {
  it("sends the config under a root config key", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "PATCH" && request.url.pathname === "/api/config") {
        return Response.json({ config: { dns: { upstreams: ["9.9.9.9"] } }, took: 0.1 });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.update_config!({ config: { dns: { upstreams: ["9.9.9.9"] } } }, context);
    expect(result).toEqual({ config: { dns: { upstreams: ["9.9.9.9"] } } });

    const patch = requests.find((request) => request.method === "PATCH" && request.url.pathname === "/api/config")!;
    expect(patch.body).toEqual({ config: { dns: { upstreams: ["9.9.9.9"] } } });
    expect(patch.url.searchParams.has("restart")).toBe(false);
  });

  it("passes restart=false through to the query string", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "PATCH" && request.url.pathname === "/api/config") {
        return Response.json({ config: {}, took: 0.1 });
      }
      return undefined;
    });

    await piHoleActionHandlers.update_config!({ config: { dns: { upstreams: ["9.9.9.9"] } }, restart: false }, context);

    const patch = requests.find((request) => request.method === "PATCH" && request.url.pathname === "/api/config")!;
    expect(patch.url.searchParams.get("restart")).toBe("false");
  });

  it("coerces a string restart value instead of silently restarting DNS", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "PATCH" && request.url.pathname === "/api/config") {
        return Response.json({ config: {}, took: 0.1 });
      }
      return undefined;
    });

    await piHoleActionHandlers.update_config!(
      { config: { dns: { upstreams: ["9.9.9.9"] } }, restart: "false" },
      context,
    );

    const patch = requests.find((request) => request.method === "PATCH" && request.url.pathname === "/api/config")!;
    expect(patch.url.searchParams.get("restart")).toBe("false");
  });
});

describe("action endpoints", () => {
  it.each([
    ["restart_dns", "/api/action/restartdns"],
    ["flush_dns_logs", "/api/action/flush/logs"],
  ] as const)("maps %s to its status response", async (name, pathname) => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === pathname) {
        return Response.json({ status: "success", took: 0.1 });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers[name]!({}, context);
    expect(result).toEqual({ status: "success" });
  });

  it("relays the gravity log stream with a best-effort status", async () => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/action/gravity") {
        return new Response("  [i] Pulling blocklist source list...\n  [✓] Done.\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return undefined;
    });

    const result = (await piHoleActionHandlers.run_gravity!({}, context)) as { status: string | null; output: string };
    expect(result).toEqual({
      status: "success",
      output: "[i] Pulling blocklist source list...\n  [✓] Done.",
    });
  });

  it("flags a failed gravity run from error markers in the stream", async () => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/action/gravity") {
        return new Response("  [✗] Failed to download https://invalid.example/blocklist\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return undefined;
    });

    const result = (await piHoleActionHandlers.run_gravity!({}, context)) as { status: string | null; output: string };
    expect(result.status).toBe("failed");
  });

  it("leaves the status unknown when the stream gives no clear signal", async () => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/action/gravity") {
        return new Response("  [i] Starting...\n", { status: 200, headers: { "content-type": "text/plain" } });
      }
      return undefined;
    });

    const result = (await piHoleActionHandlers.run_gravity!({}, context)) as { status: string | null; output: string };
    expect(result.status).toBeNull();
    expect(result.output).toBe("[i] Starting...");
  });
});

describe("set_dns_blocking", () => {
  it("maps blocking and timer to the request body", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/dns/blocking") {
        return Response.json({ blocking: "disabled", timer: 60, took: 0.1 });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.set_dns_blocking!({ blocking: false, timer: 60 }, context);
    expect(result).toEqual({ blocking: "disabled", timer: 60 });

    const blockingRequest = requests.find(
      (request) => request.method === "POST" && request.url.pathname === "/api/dns/blocking",
    )!;
    expect(blockingRequest.body).toEqual({ blocking: false, timer: 60 });
  });

  it("omits the timer when not provided and cancels it when explicitly null", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/dns/blocking") {
        return Response.json({ blocking: "enabled", timer: null, took: 0.1 });
      }
      return undefined;
    });

    await piHoleActionHandlers.set_dns_blocking!({ blocking: true }, context);
    await piHoleActionHandlers.set_dns_blocking!({ blocking: true, timer: null }, context);

    const blockingRequests = requests.filter(
      (request) => request.method === "POST" && request.url.pathname === "/api/dns/blocking",
    );
    expect(blockingRequests[0]!.body).toEqual({ blocking: true });
    expect(blockingRequests[1]!.body).toEqual({ blocking: true, timer: null });
  });
});

describe("get_queries", () => {
  it("maps input filters to query parameters", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.url.pathname === "/api/queries") {
        return Response.json({
          queries: [{ id: 1, domain: "example.com", status: "FORWARDED" }],
          cursor: 42,
          recordsTotal: 100,
          recordsFiltered: 1,
          earliest_timestamp: 1580000000,
          earliest_timestamp_disk: 1580000000,
          took: 0.1,
        });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.get_queries!(
      { domain: "example.com", length: 50, status: "FORWARDED", disk: true },
      context,
    );
    expect(result).toEqual({
      queries: [{ id: 1, domain: "example.com", status: "FORWARDED" }],
      cursor: 42,
      recordsTotal: 100,
      recordsFiltered: 1,
      earliestTimestamp: 1580000000,
      earliestTimestampDisk: 1580000000,
    });

    const queryUrl = requests.find((request) => request.url.pathname === "/api/queries")!.url;
    expect(queryUrl.searchParams.get("domain")).toBe("example.com");
    expect(queryUrl.searchParams.get("length")).toBe("50");
    expect(queryUrl.searchParams.get("status")).toBe("FORWARDED");
    expect(queryUrl.searchParams.get("disk")).toBe("true");
  });
});

describe("search_domain", () => {
  it("builds the path and limits from the input", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.url.pathname === "/api/search/doubleclick.net") {
        return Response.json({ search: { domains: [], gravity: [], results: { total: 0 } }, took: 0.1 });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.search_domain!({ domain: "doubleclick.net", maxResults: 20 }, context);
    expect(result).toEqual({ search: { domains: [], gravity: [], results: { total: 0 } } });

    const searchUrl = requests.find((request) => request.url.pathname === "/api/search/doubleclick.net")!.url;
    expect(searchUrl.searchParams.get("N")).toBe("20");
  });
});

describe("teleporter backup and restore", () => {
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

  it("stores the exported archive in the transit file store", async () => {
    const create = vi.fn(async (file: File) => ({
      fileId: "tf-1",
      downloadUrl: "http://download/tf-1",
      sizeBytes: file.size,
      name: file.name,
      mimeType: file.type,
    }));
    const transitFiles = { maxBytes: 2 ** 20, create, read: vi.fn(), delete: vi.fn(async () => true) };
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.url.pathname === "/api/teleporter") {
        return new Response(zipBytes, { status: 200, headers: { "content-type": "application/zip" } });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.export_backup!({}, { ...context, transitFiles });

    expect(result).toEqual({
      file: {
        fileId: "tf-1",
        downloadUrl: "http://download/tf-1",
        name: "teleporter.zip",
        mimeType: "application/zip",
        sizeBytes: zipBytes.length,
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const uploaded = create.mock.calls[0]![0] as File;
    expect(uploaded.name).toBe("teleporter.zip");
    expect(uploaded.type).toBe("application/zip");
  });

  it("falls back to base64 data when transit storage is unavailable", async () => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.url.pathname === "/api/teleporter") {
        return new Response(zipBytes, { status: 200, headers: { "content-type": "application/zip" } });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.export_backup!({}, context);

    expect(result).toEqual({
      file: {
        name: "teleporter.zip",
        mimeType: "application/zip",
        sizeBytes: zipBytes.length,
        data: Buffer.from(zipBytes).toString("base64"),
      },
    });
  });

  it("uploads the transit file as a multipart form on import", async () => {
    const stored = {
      name: "teleporter.zip",
      mimeType: "application/zip",
      sizeBytes: 4,
      file: new File(["abcd"], "teleporter.zip", { type: "application/zip" }),
    };
    const transitFiles = {
      maxBytes: 2 ** 20,
      create: vi.fn(),
      read: vi.fn(async () => stored),
      delete: vi.fn(async () => true),
    };
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/teleporter") {
        // FTL returns the list of restored file paths as strings, not objects.
        return Response.json({
          files: ["etc/pihole/pihole.toml", "etc/pihole/gravity.db->group"],
          took: 0.1,
        });
      }
      return undefined;
    });

    const result = await piHoleActionHandlers.import_backup!(
      { file: { fileId: "tf-1" } },
      { ...context, transitFiles },
    );

    expect(result).toEqual({ files: ["etc/pihole/pihole.toml", "etc/pihole/gravity.db->group"] });
    const post = requests.find((request) => request.method === "POST" && request.url.pathname === "/api/teleporter")!;
    // The multipart boundary is generated by the transport, so the request
    // must not carry a fixed content-type header.
    expect(post.headers.get("content-type")).toBeNull();
    // FTL only accepts the upload in a "file" field (field_found in
    // teleporter.c), so the wire contract must expose exactly that field.
    expect(post.body instanceof FormData).toBe(true);
    const uploadedFile = (post.body as FormData).get("file");
    expect(uploadedFile instanceof File).toBe(true);
    expect((uploadedFile as File).name).toBe("teleporter.zip");
  });
});

describe("validatePiHoleCredential", () => {
  it("returns profile metadata after a successful login", async () => {
    const fetcher: typeof fetch = async (input) => {
      expect(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname).toBe(
        "/api/auth",
      );
      return sessionResponse("sid");
    };

    const result = await validatePiHoleCredential(
      { apiKey: "app-password", values: { baseUrl: "http://pi.hole", apiPath: "api" } },
      fetcher,
    );
    expect(result.profile?.accountId).toBe("pi_hole:http://pi.hole");
    expect(result.profile?.displayName).toBe("Pi-hole (http://pi.hole)");
    expect(result.metadata?.baseUrl).toBe("http://pi.hole");
    expect(result.metadata?.apiPath).toBe("api");
  });

  it("rejects an invalid application password", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        session: { valid: false, sid: null, validity: -1, totp: false, message: "password incorrect" },
        took: 0.1,
      });

    await expect(
      validatePiHoleCredential({ apiKey: "wrong", values: { baseUrl: "http://pi.hole" } }, fetcher),
    ).rejects.toThrow("Invalid Pi-hole application password");
  });

  it("hints at application passwords when two-factor authentication is enabled", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        session: { valid: false, sid: null, validity: -1, totp: true, message: "password incorrect" },
        took: 0.1,
      });

    await expect(
      validatePiHoleCredential({ apiKey: "password", values: { baseUrl: "http://pi.hole" } }, fetcher),
    ).rejects.toThrow("two-factor authentication");
  });
});
