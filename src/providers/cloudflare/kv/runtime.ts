import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { optionalString, optionalInteger } from "../../../core/cast.ts";
import { withCloudflareClient } from "../shared/action-client.ts";
import { withAccountHandlers } from "../shared/context.ts";
import { namespacePath, valuePath } from "./paths.ts";
import { getKvValue, putKvValue } from "./values.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = withAccountHandlers({
  list_kv_namespaces: withCloudflareClient((client) =>
    client.list({
      path: `${client.accountPath()}/storage/kv/namespaces`,
      query: client.paginationQuery(),
    }),
  ),
  create_kv_namespace: withCloudflareClient((client) =>
    client.resource({
      path: `${client.accountPath()}/storage/kv/namespaces`,
      method: "POST",
      body: {
        title: client.input.title,
        jurisdiction: client.input.jurisdiction,
        mode: client.input.mode,
      },
    }),
  ),
  rename_kv_namespace: withCloudflareClient((client) =>
    client.resource({
      path: namespacePath(client),
      method: "PUT",
      body: { title: client.input.title },
    }),
  ),
  delete_kv_namespace: withCloudflareClient((client) =>
    client.resource({ path: namespacePath(client), method: "DELETE" }),
  ),
  list_kv_keys: withCloudflareClient((client) =>
    client.list({
      path: `${namespacePath(client)}/keys`,
      query: {
        prefix: optionalString(client.input.prefix),
        cursor: optionalString(client.input.cursor),
        limit: optionalInteger(client.input.limit),
      },
    }),
  ),
  get_kv_value: withCloudflareClient(getKvValue),
  put_kv_value: withCloudflareClient(putKvValue),
  delete_kv_value: withCloudflareClient((client) => client.resource({ path: valuePath(client), method: "DELETE" })),
});
