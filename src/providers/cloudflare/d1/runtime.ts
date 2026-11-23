import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { optionalString } from "../../../core/cast.ts";
import { withCloudflareClient } from "../shared/action-client.ts";
import { withAccountHandlers } from "../shared/context.ts";
export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = withAccountHandlers({
  list_d1_databases: withCloudflareClient((client) =>
    client.list({
      path: `${client.accountPath()}/d1/database`,
      query: { ...client.paginationQuery(), name: optionalString(client.input.name) },
    }),
  ),
  get_d1_database: withCloudflareClient((client) =>
    client.resource({ path: `${client.accountPath()}/d1/database/${client.id("databaseId")}` }),
  ),
  create_d1_database: withCloudflareClient((client) =>
    client.resource({
      method: "POST",
      path: `${client.accountPath()}/d1/database`,
      body: {
        name: client.input.name,
        primary_location_hint: client.input.primaryLocationHint,
        jurisdiction: client.input.jurisdiction,
        read_replication: client.input.replicationMode ? { mode: client.input.replicationMode } : undefined,
      },
    }),
  ),
  update_d1_database: withCloudflareClient((client) =>
    client.resource({
      method: "PATCH",
      path: `${client.accountPath()}/d1/database/${client.id("databaseId")}`,
      body: { read_replication: { mode: client.input.replicationMode } },
    }),
  ),
  delete_d1_database: withCloudflareClient((client) =>
    client.resource({ method: "DELETE", path: `${client.accountPath()}/d1/database/${client.id("databaseId")}` }),
  ),
  query_d1_database: withCloudflareClient(async (client) => {
    const envelope = await client.request({
      path: `${client.accountPath()}/d1/database/${client.id("databaseId")}` + "/query",
      method: "POST",
      body: { batch: client.input.batch },
    });
    return { results: envelope.result };
  }),
});
