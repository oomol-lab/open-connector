import type { FeishuActionRuntimeContext, FeishuJsonRequest } from "./client.ts";
import type { FeishuMarkdownRuntimeContext } from "./markdown-runtime.ts";

import { optionalRecord, optionalString } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { requestFeishuMultipart, withFeishuRawResponse } from "./client.ts";

export function createFeishuMarkdownRuntimeContext(input: {
  readonly request: FeishuJsonRequest;
  readonly context: FeishuActionRuntimeContext;
}): FeishuMarkdownRuntimeContext {
  return {
    async download({ fileToken, version }) {
      return withFeishuRawResponse(
        {
          openBaseUrl: input.context.openBaseUrl,
          accessToken: input.context.accessToken,
          fetcher: input.context.fetcher,
          signal: input.context.signal,
          path: `/drive/v1/files/${encodeURIComponent(fileToken)}/download`,
          query: { version },
        },
        async (response) => {
          const bytes = new Uint8Array(await response.arrayBuffer());
          let markdown: string;
          try {
            markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            throw new ProviderRequestError(502, "Feishu Markdown file is not valid UTF-8");
          }
          return {
            markdown,
            fileName: readDownloadName(response.headers.get("content-disposition")),
            version,
          };
        },
      );
    },
    async upload({ fileToken, fileName, markdown, parentType, parentNode }) {
      const bytes = new TextEncoder().encode(markdown);
      const body = new FormData();
      body.set("file_name", fileName);
      body.set("parent_type", parentType);
      body.set("parent_node", parentNode);
      body.set("size", String(bytes.byteLength));
      if (fileToken) {
        body.set("file_token", fileToken);
      }
      body.set("file", new Blob([bytes.slice().buffer], { type: "text/markdown; charset=utf-8" }), fileName);
      const data = await requestFeishuMultipart({
        openBaseUrl: input.context.openBaseUrl,
        accessToken: input.context.accessToken,
        fetcher: input.context.fetcher,
        signal: input.context.signal,
        path: "/drive/v1/files/upload_all",
        body,
      });
      return {
        fileToken: requireString(data.file_token, "file_token"),
        fileName,
        version: optionalString(data.version) ?? optionalString(data.data_version),
        url: optionalString(data.url),
      };
    },
    async getMetadata(fileToken) {
      const data = await input.request({
        method: "POST",
        path: "/drive/v1/metas/batch_query",
        body: {
          request_docs: [{ doc_token: fileToken, doc_type: "file" }],
          with_url: true,
        },
      });
      const meta = Array.isArray(data.metas) ? optionalRecord(data.metas[0]) : undefined;
      return {
        fileName: optionalString(meta?.title),
        url: optionalString(meta?.url),
      };
    },
  };
}

function readDownloadName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return undefined;
  }
  const marker = "filename=";
  const markerIndex = contentDisposition.toLowerCase().indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const raw = contentDisposition
    .slice(markerIndex + marker.length)
    .split(";", 1)[0]
    ?.trim();
  if (!raw) {
    return undefined;
  }
  return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(502, `Feishu response is missing ${fieldName}`);
}
