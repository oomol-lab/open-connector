import type { ZLibraryRuntimeContext } from "./runtime.ts";

import { describe, expect, it } from "vitest";
import { resolveEapiDomain, zlibraryActionHandlers } from "./runtime.ts";

function context(overrides: Partial<ZLibraryRuntimeContext> = {}): ZLibraryRuntimeContext {
  return {
    email: "user@example.com",
    password: "secret",
    fetcher: async () => new Response("{}", { status: 200 }),
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveEapiDomain", () => {
  it("defaults to the first fallback domain", () => {
    expect(resolveEapiDomain({ email: "a@b.c", password: "x" })).toBe("z-library.ec");
  });

  it("honors an explicit override and strips scheme and trailing slashes", () => {
    expect(resolveEapiDomain({ email: "a@b.c", password: "x", eapiDomain: "https://1lib.sk/" })).toBe("1lib.sk");
  });

  it("rejects an override containing a path", () => {
    expect(() => resolveEapiDomain({ email: "a@b.c", password: "x", eapiDomain: "https://1lib.sk/eapi" })).toThrow(
      "without a path",
    );
  });
});

describe("zlibrary search_books", () => {
  it("posts a form-encoded search and normalizes the books", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
      const raw = String(url);
      calls.push({ url: raw, init: init ?? {} });
      if (raw.endsWith("/eapi/user/login")) {
        return jsonResponse({ success: 1, user: { id: 42, remix_userkey: "key123" } });
      }
      return jsonResponse({
        success: 1,
        total: 1,
        books: [
          {
            id: 7,
            title: "Example Book",
            author: "Jane Doe",
            year: "2020",
            language: "english",
            extension: "pdf",
            filesize: "1.2MB",
            rating: "4.5",
            qualityScore: "8",
            hash: "abc123",
            pages: "300",
            href: "https://z-lib.org/book/7",
          },
        ],
      });
    };

    const result = await zlibraryActionHandlers.search_books?.(
      { message: "example", limit: 5, languages: ["english"] },
      context({ fetcher }),
    );

    expect(result).toEqual({
      books: [
        expect.objectContaining({
          id: "7",
          title: "Example Book",
          author: "Jane Doe",
          hash: "abc123",
        }),
      ],
      total: 1,
    });
    const searchCall = calls.find((call) => call.url.endsWith("/eapi/book/search"));
    expect(searchCall).toBeDefined();
    const body = searchCall?.init.body as URLSearchParams;
    expect(body.get("message")).toBe("example");
    expect(body.get("limit")).toBe("5");
    expect(body.getAll("languages[]")).toEqual(["english"]);
  });

  it("throws a 401 on failed login", async () => {
    const fetcher = async () => jsonResponse({ success: 0, error: "wrong credentials" }, 200);

    await expect(zlibraryActionHandlers.search_books?.({ message: "x" }, context({ fetcher }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("falls back when the preferred domain returns an anti-bot page", async () => {
    const calls: string[] = [];
    const fetcher = async (url: RequestInfo | URL) => {
      const raw = String(url);
      calls.push(raw);
      if (raw.startsWith("https://blocked.example")) {
        return new Response("<html>blocked</html>", { status: 403 });
      }
      if (raw.endsWith("/eapi/user/login")) {
        return jsonResponse({ success: 1, user: { id: 42, remix_userkey: "key123" } });
      }
      return jsonResponse({ success: 1, total: 0, books: [] });
    };

    await expect(
      zlibraryActionHandlers.search_books?.(
        { message: "example" },
        context({ fetcher, eapiDomain: "blocked.example" }),
      ),
    ).resolves.toEqual({ books: [], total: 0 });
    expect(calls.some((url) => url.startsWith("https://z-library.ec"))).toBe(true);
  });

  it("surfaces an EAPI business error", async () => {
    const fetcher = async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/eapi/user/login")) {
        return jsonResponse({ success: 1, user: { id: 42, remix_userkey: "key123" } });
      }
      return jsonResponse({ success: 0, error: "search unavailable" });
    };

    await expect(zlibraryActionHandlers.search_books?.({ message: "x" }, context({ fetcher }))).rejects.toThrow(
      "search unavailable",
    );
  });
});

describe("zlibrary get_download_limits", () => {
  it("reads the quota from the profile endpoint", async () => {
    const fetcher = async (url: RequestInfo | URL) => {
      const raw = String(url);
      if (raw.endsWith("/eapi/user/login")) {
        return jsonResponse({ success: 1, user: { id: 1, remix_userkey: "k" } });
      }
      return jsonResponse({ success: 1, user: { downloads_today: 3, downloads_limit: 10 } });
    };

    const result = await zlibraryActionHandlers.get_download_limits?.({}, context({ fetcher }));

    expect(result).toEqual({
      limits: { daily_amount: 3, daily_allowed: 10, daily_remaining: 7 },
    });
  });
});

describe("zlibrary download_book_to_file", () => {
  it("uploads the file to transit storage and returns the download url", async () => {
    let loginCount = 0;
    let uploadedName = "";
    const transitFiles = {
      create: async (file: File) => {
        uploadedName = file.name;
        return { fileId: "f1", downloadUrl: "http://transit/f1", expiresAt: 0 };
      },
      maxBytes: 10_000_000,
    } as never;
    const fetcher = async (url: RequestInfo | URL) => {
      const raw = String(url);
      if (raw.endsWith("/eapi/user/login")) {
        loginCount += 1;
        return jsonResponse({ success: 1, user: { id: 1, remix_userkey: "k" } });
      }
      if (raw.endsWith("/file")) {
        return jsonResponse({ success: 1, file: { downloadLink: "https://cdn.example.com/book.pdf" } });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="book.pdf"' },
      });
    };

    const result = await zlibraryActionHandlers.download_book_to_file?.(
      { id: "7", hash: "abc" },
      context({ fetcher, transitFiles }),
    );

    expect(uploadedName).toBe("book.pdf");
    expect(loginCount).toBe(1);
    expect(result).toEqual({
      file: { name: "book.pdf", mimetype: "application/pdf", downloadUrl: "http://transit/f1" },
    });
  });

  it("rejects a missing download link", async () => {
    const fetcher = async (url: RequestInfo | URL) =>
      String(url).endsWith("/eapi/user/login")
        ? jsonResponse({ success: 1, user: { id: 1, remix_userkey: "k" } })
        : jsonResponse({ success: 1, file: {} });

    await expect(
      zlibraryActionHandlers.download_book_to_file?.(
        { id: "7", hash: "abc" },
        context({ fetcher, transitFiles: { create: async () => undefined } as never }),
      ),
    ).rejects.toThrow("no download link");
  });

  it("rejects a failed download response", async () => {
    const fetcher = async (url: RequestInfo | URL) => {
      const raw = String(url);
      if (raw.endsWith("/eapi/user/login")) {
        return jsonResponse({ success: 1, user: { id: 1, remix_userkey: "k" } });
      }
      if (raw.endsWith("/file")) {
        return jsonResponse({ success: 1, file: { downloadLink: "https://cdn.example.com/book.pdf" } });
      }
      return new Response("unavailable", { status: 503 });
    };

    await expect(
      zlibraryActionHandlers.download_book_to_file?.(
        { id: "7", hash: "abc" },
        context({ fetcher, transitFiles: { create: async () => undefined } as never }),
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("requires transit storage before making a request", async () => {
    let requested = false;
    const fetcher = async () => {
      requested = true;
      return jsonResponse({});
    };

    await expect(
      zlibraryActionHandlers.download_book_to_file?.({ id: "7", hash: "abc" }, context({ fetcher })),
    ).rejects.toThrow("requires local transit files");
    expect(requested).toBe(false);
  });
});
