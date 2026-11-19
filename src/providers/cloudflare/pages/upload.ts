import type { CloudflareClient } from "../shared/action-client.ts";

import { optionalRecord, optionalString } from "../../../core/cast.ts";
import { downloadUploadSource } from "../../provider-files.ts";
import { ProviderRequestError, requiredInputString } from "../../provider-runtime.ts";
import { cloudflareRequestEnvelope } from "../shared/client.ts";
import { archiveMaximumBytes, readPagesArchive } from "./archive.ts";
import { normalizeDeployment, projectPath } from "./deployment.ts";

export async function deployPagesSite(client: CloudflareClient): Promise<unknown> {
  const { input, apiToken, fetcher: requestFetch } = client;
  const source = await downloadUploadSource({
    url: requiredInputString(input.archiveUrl, "archiveUrl"),
    fieldName: "archiveUrl",
    fetcher: requestFetch,
    maximumBytes: archiveMaximumBytes,
    timeoutMs: 120_000,
  });
  const { assets, special } = readPagesArchive(source.bytes);
  const tokenEnvelope = await cloudflareRequestEnvelope(
    apiToken,
    { path: `${projectPath(client)}/upload-token` },
    requestFetch,
    "execute",
  );
  const jwt = optionalString(optionalRecord(tokenEnvelope.result)?.jwt);
  if (!jwt) throw new ProviderRequestError(502, "Pages upload token is missing jwt");
  const hashes = [...new Set(assets.map((asset) => asset.hash))];
  const missingEnvelope = await cloudflareRequestEnvelope(
    jwt,
    { path: "/pages/assets/check-missing", method: "POST", body: { hashes } },
    requestFetch,
    "execute",
  );
  if (!Array.isArray(missingEnvelope.result))
    throw new ProviderRequestError(502, "Pages missing asset response is not an array");
  const missing = new Set(missingEnvelope.result);
  const uploaded = new Set<string>();
  let batch: unknown[] = [];
  let batchBytes = 2;
  async function flush() {
    if (!batch.length) return;
    await cloudflareRequestEnvelope(
      jwt!,
      {
        path: "/pages/assets/upload",
        method: "POST",
        body: new Blob([JSON.stringify(batch)], { type: "application/json" }),
        headers: { "content-type": "application/json" },
      },
      requestFetch,
      "execute",
    );
    batch = [];
    batchBytes = 2;
  }
  for (const asset of assets) {
    if (!missing.has(asset.hash) || uploaded.has(asset.hash)) continue;
    const item = {
      key: asset.hash,
      value: Buffer.from(asset.bytes).toString("base64"),
      metadata: { contentType: asset.contentType },
      base64: true,
    };
    const size = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (batchBytes + size > 50 * 1024 * 1024 || batch.length === 5000) await flush();
    batch.push(item);
    batchBytes += size;
    uploaded.add(asset.hash);
  }
  await flush();
  await cloudflareRequestEnvelope(
    jwt,
    { path: "/pages/assets/upsert-hashes", method: "POST", body: { hashes } },
    requestFetch,
    "execute",
  );
  const form = new FormData();
  form.set("manifest", JSON.stringify(Object.fromEntries(assets.map((asset) => [`/${asset.name}`, asset.hash]))));
  for (const [field, keyName] of [
    ["branch", "branch"],
    ["commitHash", "commit_hash"],
    ["commitMessage", "commit_message"],
    ["commitDirty", "commit_dirty"],
  ])
    if (input[field!] !== undefined) form.set(keyName!, String(input[field!]));
  for (const [fileName, bytes] of Object.entries(special)) form.set(fileName, new File([Buffer.from(bytes)], fileName));
  const envelope = await cloudflareRequestEnvelope(
    apiToken,
    { path: `${projectPath(client)}/deployments`, method: "POST", body: form },
    requestFetch,
    "execute",
  );
  return normalizeDeployment(envelope.result, input);
}
