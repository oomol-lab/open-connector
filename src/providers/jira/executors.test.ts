import type { ResolvedCredential, TransitFileWriter } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { credentialValidators, jiraActionHandlers } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "jira-token",
  tokenType: "Bearer",
  profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
  metadata: {},
};

describe("Jira OAuth credential validation", () => {
  it("accepts a token without an accessible Jira site", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () => Response.json([]),
    });

    expect(result).toEqual({
      profile: { accountId: "jira", displayName: "Jira Cloud" },
      metadata: {
        resourceCount: 0,
        validationEndpoint: "/oauth/token/accessible-resources",
      },
    });
  });

  it("accepts well-formed resources without Jira product scopes", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () => Response.json([{ id: "cloud-123", url: "https://docs.atlassian.net", scopes: ["read:me"] }]),
    });

    expect(result).toMatchObject({
      profile: { accountId: "jira:cloud-123", displayName: "https://docs.atlassian.net" },
      metadata: { resourceCount: 1 },
    });
  });

  it("keeps resource scopes without inferring extra permissions", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () =>
        Response.json([
          {
            id: "cloud-123",
            url: "https://jira.atlassian.net",
            scopes: ["write:jira-work", "read:unknown-new-scope"],
          },
        ]),
    });
    expect(result?.grantedScopes).toEqual(["write:jira-work", "read:unknown-new-scope"]);
  });

  it("rejects malformed accessible-resource responses", async () => {
    await expect(
      credentialValidators.oauth2!(credential, { fetcher: async () => Response.json({}) }),
    ).rejects.toMatchObject({ status: 502, message: "jira accessible-resources response must be an array" });
  });

  it("rejects malformed accessible-resource entries", async () => {
    await expect(
      credentialValidators.oauth2!(credential, { fetcher: async () => Response.json([{}]) }),
    ).rejects.toMatchObject({ status: 502, message: "missing jira accessible resource id" });
  });
});

describe("Jira attachment actions", () => {
  const providerMetadata = {
    cloudId: "cloud-123",
    apiBaseUrl: "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3",
  };

  function createContext(fetcher: typeof fetch, transitFiles?: TransitFileWriter) {
    return {
      accessToken: "jira-token",
      fetcher,
      providerMetadata,
      deployment: "cloud" as const,
      transitFiles,
    };
  }

  it("downloads an attachment into transit storage using metadata fallback", async () => {
    const requests: string[] = [];
    const created: { name: string; mimeType: string; text: string }[] = [];
    const transitFiles: TransitFileWriter = {
      maxBytes: 1024 * 1024,
      async create(file) {
        created.push({ name: file.name, mimeType: file.type, text: await file.text() });
        return {
          fileId: "tf-jira-1",
          downloadUrl: "https://transit.example/tf-jira-1",
          sizeBytes: file.size,
          name: file.name,
          mimeType: file.type,
        };
      },
      async read() {
        throw new Error("not used");
      },
      async delete() {
        return true;
      },
    };
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/attachment/att-42")) {
        return Response.json({ id: "att-42", filename: "report.pdf", mimeType: "application/pdf" });
      }
      if (url.endsWith("/attachment/content/att-42")) {
        return new Response("pdf-bytes", { status: 200, headers: { "content-type": "application/pdf" } });
      }
      return new Response("not found", { status: 404 });
    };

    const result = await jiraActionHandlers.download_attachment(
      { attachmentId: "att-42" },
      createContext(fetcher, transitFiles),
    );

    expect(requests).toEqual([
      "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/att-42",
      "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/content/att-42",
    ]);
    expect(created).toEqual([{ name: "report.pdf", mimeType: "application/pdf", text: "pdf-bytes" }]);
    expect(result).toEqual({
      fileId: "tf-jira-1",
      downloadUrl: "https://transit.example/tf-jira-1",
      sizeBytes: 9,
      name: "report.pdf",
      mimeType: "application/pdf",
    });
  });

  it("rejects attachment download when transit storage is disabled", async () => {
    await expect(
      jiraActionHandlers.download_attachment(
        { attachmentId: "att-42" },
        createContext(async () => new Response("ok")),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("uploads a transit file attachment with X-Atlassian-Token header", async () => {
    let capturedHeader = "";
    let uploadedFilename = "";
    const transitFiles: TransitFileWriter = {
      maxBytes: 1024 * 1024,
      async create() {
        throw new Error("not used");
      },
      async read(fileId) {
        expect(fileId).toBe("tf-upload-1");
        return {
          fileId,
          name: "spec.txt",
          mimeType: "text/plain",
          sizeBytes: 5,
          file: new File(["hello"], "spec.txt", { type: "text/plain" }),
        };
      },
      async delete() {
        return true;
      },
    };
    const fetcher: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturedHeader = headers.get("x-atlassian-token") ?? "";
      const form = init?.body as FormData;
      const entry = form.get("file");
      if (entry instanceof File) uploadedFilename = entry.name;
      return Response.json([
        {
          id: "att-99",
          filename: "spec.txt",
          mimeType: "text/plain",
          size: 5,
          content: "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/content/att-99",
          created: "2026-11-21T00:00:00.000+0000",
        },
      ]);
    };

    const result = await jiraActionHandlers.upload_attachment(
      { issueIdOrKey: "ENG-12", file: { fileId: "tf-upload-1" } },
      createContext(fetcher, transitFiles),
    );

    expect(capturedHeader).toBe("no-check");
    expect(uploadedFilename).toBe("spec.txt");
    expect(result).toMatchObject({
      attachments: [{ id: "att-99", filename: "spec.txt", mimeType: "text/plain", size: 5 }],
    });
  });

  it("rejects upload_attachment when both file and fileUrl are omitted or both provided", async () => {
    await expect(
      jiraActionHandlers.upload_attachment(
        { issueIdOrKey: "ENG-12" },
        createContext(async () => new Response("ok")),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
