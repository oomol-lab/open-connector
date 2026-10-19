import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "threatfox";

const malwareSampleSchema = s.looseRequiredObject("Malware sample associated with the IOC.", {
  time_stamp: s.string("When the sample was associated with the IOC, in UTC."),
  md5_hash: s.string("MD5 hash of the sample."),
  sha256_hash: s.string("SHA256 hash of the sample."),
  malware_bazaar: s.string("MalwareBazaar link for the sample."),
});

const iocEntrySchema = s.looseRequiredObject("ThreatFox database entry for the queried IOC.", {
  id: s.string("ThreatFox database entry ID."),
  ioc: s.string("The indicator of compromise as recorded by ThreatFox."),
  threat_type: s.string("Threat type, e.g. botnet_cc or payload."),
  threat_type_desc: s.string("Human-readable threat type description."),
  ioc_type: s.string("IOC type, e.g. ip:port, domain, url, or sha256_hash."),
  ioc_type_desc: s.string("Human-readable IOC type description."),
  malware: s.string("Malware family identifier, e.g. win.vidar."),
  malware_printable: s.string("Printable malware family name, e.g. Vidar."),
  confidence_level: s.integer("ThreatFox confidence level, 0-100."),
  first_seen: s.string("When the IOC was first seen, in UTC."),
  last_seen: s.nullableString("When the IOC was last seen, in UTC; null if unknown."),
  reporter: s.string("Handle of the reporter."),
  reference: s.nullableString("Reference URL for the IOC, if any."),
  tags: s.array("Tags associated with the IOC.", s.string("A tag.")),
  malware_samples: s.array("Malware samples associated with the IOC.", malwareSampleSchema),
});

const lookupIocSchema = s.looseRequiredObject("ThreatFox IOC lookup result.", {
  found: s.boolean("Whether ThreatFox knows this IOC."),
  query_status: s.string("ThreatFox query status: ok, or no_result when the IOC is unknown."),
  entries: s.describe(
    s.optional(s.array("Matching ThreatFox IOC entries.", iocEntrySchema)),
    "Matching IOC entries, present when the IOC is known.",
  ),
});

export const threatfoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ioc",
    operationType: "read",
    description:
      "Check whether an indicator of compromise (IP address, domain, URL, or MD5/SHA256 file hash) is known to ThreatFox. Uses an exact-match IOC search or a file-hash search and returns the matching IOC entries with threat type, malware family, and confidence level when known, or a not-found result otherwise. Requires a free abuse.ch Auth-Key.",
    requiredScopes: [],
    inputSchema: s.requiredObject("IOC lookup input.", {
      ioc: s.string(
        "The indicator of compromise to look up: an IP address, domain, URL, or MD5/SHA256 file hash, e.g. 1.2.3.4 or 44d88612fea8a8f36de82e1278abb02f.",
      ),
    }),
    outputSchema: lookupIocSchema,
  }),
];
