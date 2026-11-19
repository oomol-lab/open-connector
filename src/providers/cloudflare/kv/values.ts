import type { CloudflareClient } from "../shared/action-client.ts";

import { optionalInteger } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { buildCloudflareUrl, readCloudflareEnvelope } from "../shared/client.ts";
import { cloudflareResponseError } from "../shared/errors.ts";
import { valuePath } from "./paths.ts";

export async function getKvValue(client: CloudflareClient): Promise<unknown> {
  const response = await client.fetcher(buildCloudflareUrl(valuePath(client)), {
    headers: { authorization: `Bearer ${client.apiToken}` },
  });
  if (!response.ok) throw cloudflareResponseError(response, await readCloudflareEnvelope(response), "execute");
  return {
    value:
      client.input.encoding === "base64"
        ? Buffer.from(await response.arrayBuffer()).toString("base64")
        : await response.text(),
  };
}

export async function putKvValue(client: CloudflareClient): Promise<unknown> {
  const { input } = client;
  if (input.expiration != null && input.expirationTtl != null)
    throw new ProviderRequestError(400, "Choose expiration or expirationTtl");
  const bytes =
    input.encoding === "base64" ? Buffer.from(String(input.value), "base64") : Buffer.from(String(input.value));
  if (bytes.byteLength > 25 * 1024 * 1024) throw new ProviderRequestError(400, "KV value exceeds 25 MiB");
  const form = new FormData();
  form.set("value", new Blob([bytes]));
  if (input.metadata !== undefined) form.set("metadata", JSON.stringify(input.metadata));
  return client.resource({
    path: valuePath(client),
    method: "PUT",
    query: {
      expiration: optionalInteger(input.expiration),
      expiration_ttl: optionalInteger(input.expirationTtl),
    },
    body: form,
  });
}
