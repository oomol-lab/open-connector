import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "urlhaus";

const blacklistSchema = s.looseRequiredObject("Blacklist status of the queried URL.", {
  surbl: s.string("SURBL blacklist status."),
  spamhaus_dbl: s.string("Spamhaus DBL blacklist status."),
});

const payloadSchema = s.looseRequiredObject("Malware payload served by the URL.", {
  firstseen: s.string("Date the payload was first seen."),
  filename: s.nullableString("Filename reported by the remote server, if any."),
  file_type: s.string("File type guessed by URLhaus, e.g. exe or doc."),
  response_size: s.string("Size of the HTTP response body in bytes, as reported by URLhaus."),
  response_md5: s.string("MD5 hash of the payload."),
  response_sha256: s.string("SHA256 hash of the payload."),
  urlhaus_download: s.string("Where to download a copy of the payload."),
  signature: s.nullableString("Malware family, if URLhaus identified one."),
});

const urlEntrySchema = s.looseRequiredObject("URLhaus database entry for the queried URL.", {
  id: s.string("URLhaus database entry ID."),
  urlhaus_reference: s.string("Link to the URLhaus entry page."),
  url: s.string("The queried URL as recorded by URLhaus."),
  url_status: s.string("Whether the URL is currently online, offline, or unknown."),
  host: s.string("Host extracted from the URL."),
  date_added: s.string("When the URL was added to URLhaus, in UTC."),
  last_online: s.nullableString("When an offline URL last served malware; null otherwise."),
  threat: s.string("Threat type, e.g. malware_download."),
  blacklists: blacklistSchema,
  reporter: s.string("Handle of the reporter, or anonymous."),
  larted: s.string("Whether the URL was reported to its hosting provider."),
  takedown_time_seconds: s.nullableInteger("Seconds until the site was taken down, if applicable."),
  tags: s.array("Tags associated with the URL.", s.string("A tag.")),
  payloads: s.array("Payloads served by the URL.", payloadSchema),
});

const lookupUrlSchema = s.looseRequiredObject("URLhaus URL lookup result.", {
  found: s.boolean("Whether URLhaus knows this URL."),
  query_status: s.string("URLhaus query status: ok or no_results. Invalid URLs produce an invalid_input error."),
  entry: s.describe(s.optional(urlEntrySchema), "The URLhaus database entry, present when the URL is known."),
});

export const urlhausActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_url",
    operationType: "read",
    description:
      "Check whether a URL is known to URLhaus as a malware distribution site. Returns the database entry with threat, blacklist status, tags, and payload details when the URL is known, or a not-found result otherwise. Requires a free abuse.ch Auth-Key.",
    requiredScopes: [],
    inputSchema: s.requiredObject("URL lookup input.", {
      url: s.url("The absolute URL to look up, e.g. https://example.com/payload.exe."),
    }),
    outputSchema: lookupUrlSchema,
  }),
];
