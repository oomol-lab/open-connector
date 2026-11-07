import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";
import { pdflessApiBaseUrl } from "./runtime.ts";

interface CapturedRequest {
  method: string;
  url: string;
  apiKey: string | null;
  contentType: string | null;
  body: unknown;
}

const templateId = "1814309a-c198-469e-a583-227a69a6ecb2";
const downloadUrl = "https://sapdfless001.blob.core.windows.net/temp/invoice-42.pdf";

const generatedPdfEnvelope = {
  data: {
    template_id: templateId,
    reference_id: "invoice-42",
    download_url: downloadUrl,
    expires: "2026-11-08T10:24:36.5524803+00:00",
    created_at: "2026-11-08T10:14:36.5202642Z",
  },
  status: "success",
};

function contextWithKey(apiKey = "ak_test_key"): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey,
    values: { apiKey },
    profile: { accountId: "Default workspace", displayName: "Default workspace", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pdfless create_pdf", () => {
  it("posts the documented body and normalizes the generated PDF", async () => {
    const requests = stubResponses([Response.json(generatedPdfEnvelope)]);

    const result = await executors["pdfless.create_pdf"]!(
      {
        templateId,
        payload: { Company: "Company & co" },
        referenceId: "invoice-42",
        encryptionUserPassword: " secret ",
        encryptionAllowPrinting: false,
      },
      contextWithKey(),
    );

    expect(requests).toStrictEqual([
      {
        method: "POST",
        url: `${pdflessApiBaseUrl}/v1/pdfs`,
        apiKey: "ak_test_key",
        contentType: "application/json",
        body: {
          template_id: templateId,
          payload: { Company: "Company & co" },
          reference_id: "invoice-42",
          encryption_user_password: " secret ",
          encryption_allow_printing: false,
        },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      output: {
        templateId,
        referenceId: "invoice-42",
        downloadUrl,
        expiresAt: "2026-11-08T10:24:36.5524803+00:00",
        createdAt: "2026-11-08T10:14:36.5202642Z",
        transitFile: null,
      },
    });
  });

  it("copies the generated PDF into transit storage when a store is available", async () => {
    const requests = stubResponses([
      Response.json(generatedPdfEnvelope),
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { "content-type": "application/pdf" } }),
    ]);
    const stored: File[] = [];
    const context = contextWithKey();
    context.transitFiles = fakeTransitStore(stored);

    const result = await executors["pdfless.create_pdf"]!({ templateId }, context);

    expect(requests.map((request) => [request.method, request.url, request.apiKey])).toEqual([
      ["POST", `${pdflessApiBaseUrl}/v1/pdfs`, "ak_test_key"],
      ["GET", downloadUrl, null],
    ]);
    expect(result).toMatchObject({
      ok: true,
      output: {
        downloadUrl,
        transitFile: {
          fileId: "transit-1",
          downloadUrl: "http://127.0.0.1:3000/api/files/transit-1",
          sizeBytes: 4,
          name: `${templateId}.pdf`,
          mimeType: "application/pdf",
        },
      },
    });
    expect(stored).toHaveLength(1);
  });

  it("reports a consumed monthly quota as insufficient_credit whatever status carries it", async () => {
    const message =
      "Credit for this month is consumed, please upgrade your account subscription or contact our support.";
    const requests = stubResponses([
      Response.json(
        {
          message,
          error_code: "quota_exceeded",
          documentation_url: null,
          correlation_id: "898bbd77-a36b-4e8a-986e-6d52d5ca5574",
        },
        { status: 403 },
      ),
    ]);

    const result = await executors["pdfless.create_pdf"]!({ templateId }, contextWithKey());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "insufficient_credit", message },
    });
    expect(requests).toHaveLength(1);
  });

  it("fails with provider_error when the success envelope has no download URL", async () => {
    stubResponses([Response.json({ data: {}, status: "success" })]);

    const result = await executors["pdfless.create_pdf"]!({ templateId }, contextWithKey());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "Pdfless response missing string field: download_url" },
    });
  });
});

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const text = await request.text();
    requests.push({
      method: request.method,
      url: request.url,
      apiKey: request.headers.get("apikey"),
      contentType: request.headers.get("content-type"),
      body: text ? JSON.parse(text) : null,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Pdfless request to ${request.url}`);
    }
    return response;
  });
  return requests;
}

function fakeTransitStore(stored: File[]): TransitFileStore {
  return {
    maxBytes: 10 * 1024 * 1024,
    async create(file) {
      stored.push(file);
      return {
        fileId: "transit-1",
        downloadUrl: "http://127.0.0.1:3000/api/files/transit-1",
        sizeBytes: file.size,
        name: file.name,
        mimeType: file.type,
      };
    },
    async read() {
      throw new Error("Pdfless tests never read transit files");
    },
    async delete() {
      return true;
    },
  };
}
