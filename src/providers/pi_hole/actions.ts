import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pi_hole";

const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");

const blockingStatusSchema = s.stringEnum("The Pi-hole blocking status.", ["enabled", "disabled", "failed", "unknown"]);
const blockingStatusOutput = s.actionOutput(
  {
    blocking: blockingStatusSchema,
    timer: s.nullable(
      s.number("Remaining seconds until the blocking mode is toggled automatically, or null when no timer is active."),
    ),
  },
  "The current Pi-hole DNS blocking status.",
);

const topQueryInput = s.actionInput(
  {
    count: s.integer("Maximum number of entries to return."),
    blocked: s.boolean("Only include blocked queries in the result."),
  },
  [],
  "Input parameters for a Pi-hole top-entries query.",
);

const groupIdsInput = s.array(
  "The group IDs the item belongs to; defaults to group 0 when omitted.",
  s.integer("One Pi-hole group ID."),
);

const listTypeSchema = s.stringEnum("Whether the list is an allowlist or a blocklist.", ["allow", "block"]);
const domainTypeSchema = s.stringEnum("Whether the domain entry allows or denies the domain.", ["allow", "deny"]);
const domainKindSchema = s.stringEnum("Whether the domain entry matches exactly or as a regular expression.", [
  "exact",
  "regex",
]);

function itemOrItems(description: string, itemField: string): JsonSchema {
  return s.anyOf(description, [
    s.string(`The single ${itemField} value.`),
    s.array(`One or more ${itemField} values.`, s.string(`One ${itemField} value.`)),
  ]);
}

const processedOutputSchema = s.actionOutput(
  {
    processed: s.nullable(
      s.looseRequiredObject("The write result reported by the instance.", {
        success: s.array("The items that were written successfully.", s.string("One written item.")),
        errors: s.array(
          "The items that could not be written, with their error messages.",
          s.looseObject("One failed item and its error message."),
        ),
      }),
    ),
  },
  "The Pi-hole write result.",
);

const deletedOutputSchema = s.actionOutput(
  { deleted: s.boolean("Whether the item was deleted.") },
  "The deletion result.",
);

export const piHoleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_overview",
    description:
      "Fetch the Pi-hole activity overview: total and blocked queries, blocked query percentage, unique clients and domains, and the blocking and gravity list status.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { summary: s.looseObject("The Pi-hole overview payload returned by the instance.") },
      "The Pi-hole activity overview.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dns_blocking_status",
    description: "Fetch whether Pi-hole DNS blocking is currently enabled, disabled, failed, or unknown.",
    inputSchema: emptyInputSchema,
    outputSchema: blockingStatusOutput,
  }),
  defineProviderAction(service, {
    name: "set_dns_blocking",
    description:
      "Enable or disable Pi-hole DNS blocking, optionally for a limited time after which the opposite mode is restored automatically.",
    inputSchema: s.actionInput(
      {
        blocking: s.boolean("Whether DNS blocking should be enabled."),
        timer: s.nullable(
          s.number(
            "Optional timer in seconds after which the opposite blocking mode is applied automatically; pass null to cancel a running timer.",
          ),
        ),
      },
      ["blocking"],
      "Input parameters for changing the Pi-hole DNS blocking status.",
    ),
    outputSchema: blockingStatusOutput,
  }),
  defineProviderAction(service, {
    name: "get_queries",
    description:
      "Query the Pi-hole DNS log with optional filters. By default returns the most recent queries; each response exposes a cursor for the next chunk.",
    inputSchema: s.actionInput(
      {
        from: s.number("Only return queries from this Unix timestamp onward."),
        until: s.number("Only return queries up to this Unix timestamp."),
        length: s.integer("Maximum number of results to return."),
        start: s.integer("Offset from the first record."),
        cursor: s.integer("Database ID of the most recent query to show; use the cursor of a previous response."),
        domain: s.string("Filter by queried domain, * wildcards supported."),
        clientIp: s.string("Filter by requesting client IP address, * wildcards supported."),
        clientName: s.string("Filter by requesting client hostname, * wildcards supported."),
        upstream: s.string(
          "Filter by upstream destination (may also be cache, blocklist, or permitted), * wildcards supported.",
        ),
        type: s.string("Filter by query type, for example A or AAAA."),
        status: s.string("Filter by query status, for example GRAVITY or FORWARDED."),
        reply: s.string("Filter by reply type, for example NODATA or NXDOMAIN."),
        dnssec: s.string("Filter by DNSSEC status, for example SECURE or INSECURE."),
        disk: s.boolean("Read queries from the long-term on-disk database instead of the in-memory database."),
      },
      [],
      "Input parameters for querying the Pi-hole DNS log.",
    ),
    outputSchema: s.actionOutput(
      {
        queries: s.array("The Pi-hole query records.", s.looseObject("One Pi-hole query record.")),
        cursor: s.nullableInteger("Database ID of the most recent query shown, for the next chunk."),
        recordsTotal: s.integer("Total number of available queries."),
        recordsFiltered: s.integer("Number of available queries after filtering."),
        earliestTimestamp: s.nullable(
          s.number("Earliest timestamp of queries held in the in-memory database (Unix time)."),
        ),
        earliestTimestampDisk: s.nullable(
          s.number("Earliest timestamp of queries held in the long-term on-disk database (Unix time)."),
        ),
      },
      "The requested Pi-hole query records.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_query_types",
    description: "Fetch the number of queries of each DNS query type that Pi-hole has seen.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { types: s.looseObject("Query type counts keyed by DNS query type, for example A or AAAA.") },
      "The Pi-hole query type counts.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_top_domains",
    description: "Fetch the domains Pi-hole has handled the most, optionally limited to blocked ones.",
    inputSchema: topQueryInput,
    outputSchema: s.actionOutput(
      {
        domains: s.array("The top domain entries.", s.looseObject("One Pi-hole top domain entry.")),
        totalQueries: s.integer("Total number of queries in the requested window."),
        blockedQueries: s.integer("Number of blocked queries in the requested window."),
      },
      "The Pi-hole top domains.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_top_clients",
    description: "Fetch the clients that have queried Pi-hole the most, optionally limited to blocked ones.",
    inputSchema: topQueryInput,
    outputSchema: s.actionOutput(
      {
        clients: s.array("The top client entries.", s.looseObject("One Pi-hole top client entry.")),
        totalQueries: s.integer("Total number of queries in the requested window."),
        blockedQueries: s.integer("Number of blocked queries in the requested window."),
      },
      "The Pi-hole top clients.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_recent_blocked",
    description: "Fetch the domains most recently blocked by Pi-hole.",
    inputSchema: s.actionInput(
      {
        count: s.integer("Maximum number of blocked domains to return."),
      },
      [],
      "Input parameters for listing the most recently blocked domains.",
    ),
    outputSchema: s.actionOutput(
      { blocked: s.array("The most recently blocked domains.", s.string("One blocked domain name.")) },
      "The most recently blocked domains.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_upstreams",
    description: "Fetch metrics about Pi-hole's DNS upstream destinations, including response times.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        upstreams: s.array("The upstream destination entries.", s.looseObject("One Pi-hole upstream entry.")),
        forwardedQueries: s.integer("Number of queries forwarded to upstream destinations."),
        totalQueries: s.integer("Total number of queries in the window."),
      },
      "The Pi-hole upstream metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_history",
    description:
      "Fetch the Pi-hole activity graph data: query totals over time with cached, blocked, and forwarded splits.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { history: s.array("The activity graph entries over time.", s.looseObject("One Pi-hole activity graph entry.")) },
      "The Pi-hole activity graph data.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_domain",
    description:
      "Search whether a domain appears in Pi-hole's allowlists, blocklists, or gravity lists, to understand why it is blocked or allowed.",
    inputSchema: s.actionInput(
      {
        domain: s.nonEmptyString("The domain (or part of it) to search for in Pi-hole's lists."),
        partial: s.boolean("Allow partial matches; may not find complex regex entries."),
        maxResults: s.integer("Maximum number of results per match type; the instance caps this internally."),
      },
      ["domain"],
      "Input parameters for searching Pi-hole's lists.",
    ),
    outputSchema: s.actionOutput(
      { search: s.looseObject("The Pi-hole search result payload.") },
      "The Pi-hole list search result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_config",
    description: "Fetch the current Pi-hole configuration, such as DNS settings, privacy level, and API settings.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { config: s.looseObject("The Pi-hole configuration payload returned by the instance.") },
      "The current Pi-hole configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_config",
    description:
      "Change part of the Pi-hole configuration, for example DNS upstreams, the privacy level, or API settings. The provided fields are merged into the current configuration.",
    inputSchema: s.actionInput(
      {
        config: s.looseObject(
          "The Pi-hole configuration fields to change, using the same structure as the configuration payload.",
        ),
        restart: s.boolean(
          "Whether the instance may restart its DNS server when the change requires it; defaults to true. Pass false to apply the change without a disruptive DNS restart.",
        ),
      },
      ["config"],
      "Input parameters for changing the Pi-hole configuration.",
    ),
    outputSchema: s.actionOutput(
      { config: s.looseObject("The updated Pi-hole configuration payload.") },
      "The updated Pi-hole configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "run_gravity",
    description:
      "Run the Pi-hole gravity update to refresh the blocklists. The instance streams the gravity log; the action reports a best-effort status from the log plus the tail of the stream.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        status: s.nullableString(
          "Best-effort gravity outcome inferred from the stream: success, failed, or null when the stream gives no clear signal.",
        ),
        output: s.string("The tail of the gravity log stream as relayed by the instance."),
      },
      "The Pi-hole gravity run result.",
    ),
  }),
  defineProviderAction(service, {
    name: "restart_dns",
    description: "Restart Pi-hole's DNS server and reload its DNS configuration.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { status: s.nullableString("The restart result status returned by the instance, normally success.") },
      "The DNS restart result.",
    ),
  }),
  defineProviderAction(service, {
    name: "flush_dns_logs",
    description: "Flush the Pi-hole DNS query log.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { status: s.nullableString("The flush result status returned by the instance, normally success.") },
      "The DNS log flush result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List all Pi-hole groups and their memberships.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { groups: s.array("The Pi-hole groups.", s.looseObject("One Pi-hole group.")) },
      "The Pi-hole groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create one or more Pi-hole groups, optionally with a comment and enabled state.",
    inputSchema: s.actionInput(
      {
        name: itemOrItems("The group name, or an array of group names to create.", "group name"),
        comment: s.nullableString("An optional comment for the group."),
        enabled: s.boolean("Whether the group is enabled; defaults to true."),
      },
      ["name"],
      "Input parameters for creating one or more Pi-hole groups.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Update one Pi-hole group: rename it, or change its comment or enabled state.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The current group name to update."),
        newName: s.nonEmptyString("The new group name when renaming the group."),
        comment: s.nullableString("The new comment for the group; pass null to clear it."),
        enabled: s.boolean("Whether the group is enabled."),
      },
      ["name"],
      "Input parameters for updating one Pi-hole group.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete one Pi-hole group by name.",
    inputSchema: s.actionInput(
      { name: s.nonEmptyString("The name of the group to delete.") },
      ["name"],
      "Input parameters for deleting one Pi-hole group.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List the Pi-hole allowlists and blocklists (subscription lists).",
    inputSchema: s.actionInput(
      { type: listTypeSchema },
      [],
      "Input parameters for listing Pi-hole lists; restrict to one list type when needed.",
    ),
    outputSchema: s.actionOutput(
      { lists: s.array("The Pi-hole lists.", s.looseObject("One Pi-hole list.")) },
      "The Pi-hole lists.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_list",
    description: "Add one or more allowlist or blocklist entries (addresses) to Pi-hole.",
    inputSchema: s.actionInput(
      {
        address: itemOrItems(
          "The list address, for example https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts, or an array of addresses.",
          "list address",
        ),
        type: listTypeSchema,
        comment: s.nullableString("An optional comment for the list."),
        groups: groupIdsInput,
        enabled: s.boolean("Whether the list is enabled; defaults to true."),
      },
      ["address", "type"],
      "Input parameters for adding one or more Pi-hole lists.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_list",
    description: "Update one Pi-hole list: change its comment, enabled state, or group memberships.",
    inputSchema: s.actionInput(
      {
        address: s.nonEmptyString("The address of the list to update."),
        type: listTypeSchema,
        comment: s.nullableString("The new comment for the list; pass null to clear it."),
        groups: groupIdsInput,
        enabled: s.boolean("Whether the list is enabled."),
      },
      ["address", "type"],
      "Input parameters for updating one Pi-hole list.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_list",
    description: "Delete one Pi-hole allowlist or blocklist entry by address.",
    inputSchema: s.actionInput(
      {
        address: s.nonEmptyString("The address of the list to delete."),
        type: listTypeSchema,
      },
      ["address", "type"],
      "Input parameters for deleting one Pi-hole list.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_domains",
    description: "List the individual Pi-hole domain entries, optionally restricted to one type or kind.",
    inputSchema: s.actionInput(
      {
        type: domainTypeSchema,
        kind: domainKindSchema,
      },
      [],
      "Input parameters for listing Pi-hole domain entries.",
    ),
    outputSchema: s.actionOutput(
      { domains: s.array("The Pi-hole domain entries.", s.looseObject("One Pi-hole domain entry.")) },
      "The Pi-hole domain entries.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_domain",
    description: "Add one or more allow or deny domain entries to Pi-hole, either exact or as regular expressions.",
    inputSchema: s.actionInput(
      {
        domain: itemOrItems("The domain to add, or an array of domains.", "domain"),
        type: domainTypeSchema,
        kind: domainKindSchema,
        comment: s.nullableString("An optional comment for the entry."),
        groups: groupIdsInput,
        enabled: s.boolean("Whether the entry is enabled; defaults to true."),
      },
      ["domain", "type", "kind"],
      "Input parameters for adding one or more Pi-hole domain entries.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_domain",
    description: "Update one Pi-hole domain entry: change its comment, enabled state, or group memberships.",
    inputSchema: s.actionInput(
      {
        type: domainTypeSchema,
        kind: domainKindSchema,
        domain: s.nonEmptyString("The domain of the entry to update."),
        comment: s.nullableString("The new comment for the entry; pass null to clear it."),
        groups: groupIdsInput,
        enabled: s.boolean("Whether the entry is enabled."),
      },
      ["type", "kind", "domain"],
      "Input parameters for updating one Pi-hole domain entry.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_domain",
    description: "Delete one Pi-hole allow or deny domain entry.",
    inputSchema: s.actionInput(
      {
        type: domainTypeSchema,
        kind: domainKindSchema,
        domain: s.nonEmptyString("The domain of the entry to delete."),
      },
      ["type", "kind", "domain"],
      "Input parameters for deleting one Pi-hole domain entry.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_clients",
    description: "List all Pi-hole clients and their group memberships.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { clients: s.array("The Pi-hole clients.", s.looseObject("One Pi-hole client.")) },
      "The Pi-hole clients.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_client",
    description: "Register one or more Pi-hole clients identified by IP address, MAC address, hostname, or interface.",
    inputSchema: s.actionInput(
      {
        client: itemOrItems(
          "The client identifier (IP / MAC / hostname / interface), or an array of identifiers.",
          "client identifier",
        ),
        comment: s.nullableString("An optional comment for the client."),
        groups: groupIdsInput,
      },
      ["client"],
      "Input parameters for registering one or more Pi-hole clients.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_client",
    description: "Update one Pi-hole client's comment or group memberships.",
    inputSchema: s.actionInput(
      {
        client: s.nonEmptyString("The client identifier to update (IP / MAC / hostname / interface)."),
        comment: s.nullableString("The new comment for the client; pass null to clear it."),
        groups: groupIdsInput,
      },
      ["client"],
      "Input parameters for updating one Pi-hole client.",
    ),
    outputSchema: processedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_client",
    description: "Delete one Pi-hole client entry by identifier.",
    inputSchema: s.actionInput(
      {
        client: s.nonEmptyString("The client identifier to delete (IP / MAC / hostname / interface)."),
      },
      ["client"],
      "Input parameters for deleting one Pi-hole client.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_delete_groups",
    description:
      "Delete multiple Pi-hole groups by name in one request. Reports deleted=false when none of the groups exist.",
    inputSchema: s.actionInput(
      { items: s.array("The group names to delete.", s.nonEmptyString("One group name.")) },
      ["items"],
      "Input parameters for deleting multiple Pi-hole groups.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_delete_lists",
    description:
      "Delete multiple Pi-hole allowlist or blocklist entries in one request. Reports deleted=false when none of the entries exist.",
    inputSchema: s.actionInput(
      {
        items: s.array(
          "The list entries to delete.",
          s.requiredObject("One list entry to delete.", {
            address: s.nonEmptyString("The address of the list entry."),
            type: listTypeSchema,
          }),
        ),
      },
      ["items"],
      "Input parameters for deleting multiple Pi-hole lists.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_delete_domains",
    description:
      "Delete multiple Pi-hole domain entries in one request. Reports deleted=false when none of the entries exist.",
    inputSchema: s.actionInput(
      {
        items: s.array(
          "The domain entries to delete.",
          s.requiredObject("One domain entry to delete.", {
            domain: s.nonEmptyString("The domain of the entry."),
            type: domainTypeSchema,
            kind: domainKindSchema,
          }),
        ),
      },
      ["items"],
      "Input parameters for deleting multiple Pi-hole domain entries.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_delete_clients",
    description:
      "Delete multiple Pi-hole client entries in one request. Reports deleted=false when none of the clients exist.",
    inputSchema: s.actionInput(
      {
        items: s.array(
          "The client identifiers to delete (IP / MAC / hostname / interface).",
          s.nonEmptyString("One client identifier."),
        ),
      },
      ["items"],
      "Input parameters for deleting multiple Pi-hole clients.",
    ),
    outputSchema: deletedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_dhcp_leases",
    description: "Fetch the currently active DHCP leases assigned by the Pi-hole DHCP server.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { leases: s.array("The active DHCP leases.", s.looseObject("One active DHCP lease.")) },
      "The active Pi-hole DHCP leases.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_network_devices",
    description: "Fetch the devices seen on the local network by Pi-hole.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { devices: s.array("The network devices seen by Pi-hole.", s.looseObject("One network device.")) },
      "The network devices seen by Pi-hole.",
    ),
  }),
  defineProviderAction(service, {
    name: "export_backup",
    description:
      "Create a complete Pi-hole teleporter backup archive (teleporter.zip) with all settings, lists, and clients.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        file: s.requiredObject("The backup archive metadata.", {
          fileId: s.nullableString("Transit file id when stored locally."),
          downloadUrl: s.nullableString("Download URL of the stored transit file."),
          name: s.nonEmptyString("The archive file name."),
          mimeType: s.string("The archive MIME type."),
          sizeBytes: s.integer("The archive size in bytes."),
          data: s.nullableString("The archive content base64-encoded when no transit storage is available."),
        }),
      },
      "The Pi-hole teleporter backup archive.",
    ),
  }),
  defineProviderAction(service, {
    name: "import_backup",
    description: "Restore a Pi-hole teleporter backup archive (a previously exported teleporter.zip) to this instance.",
    inputSchema: s.actionInput(
      { file: s.transitFile("The teleporter archive to restore.") },
      ["file"],
      "Input parameters for restoring one Pi-hole backup archive.",
    ),
    outputSchema: s.actionOutput(
      { files: s.array("The files restored from the archive.", s.string("The name of a restored file.")) },
      "The Pi-hole teleporter import result.",
    ),
  }),
];
