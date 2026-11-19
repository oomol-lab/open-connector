import type { CloudflareClient } from "../shared/action-client.ts";

import { optionalRawString } from "../../../core/cast.ts";
import { providerInputError } from "../../provider-runtime.ts";

export function namespacePath(client: CloudflareClient): string {
  return `${client.accountPath()}/storage/kv/namespaces/${client.id("namespaceId")}`;
}

export function valuePath(client: CloudflareClient): string {
  const key = optionalRawString(client.input.key);
  if (!key || key === "." || key === "..") throw providerInputError("key must be nonempty and cannot be . or ..");
  return `${namespacePath(client)}/values/${encodeURIComponent(key)}`;
}
