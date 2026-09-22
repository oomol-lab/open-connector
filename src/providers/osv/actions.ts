import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "osv";

const packageSchema = s.looseRequiredObject("A package identified by its ecosystem and name.", {
  name: s.nonEmptyString("The package name as used by its ecosystem."),
  ecosystem: s.nonEmptyString("The case-sensitive OSV ecosystem name, such as npm, PyPI, Go, or Maven."),
  purl: s.optional(s.nonEmptyString("The package URL assigned by OSV, when available.")),
});

const referenceSchema = s.looseRequiredObject("A reference associated with the vulnerability.", {
  type: s.nonEmptyString("The OSV reference type, such as ADVISORY, REPORT, or WEB."),
  url: s.url("The referenced resource URL."),
});

const severitySchema = s.looseRequiredObject("A severity score encoded with a named scoring system.", {
  type: s.nonEmptyString("The scoring system, such as CVSS_V3 or CVSS_V4."),
  score: s.nonEmptyString("The severity score or vector encoded for the scoring system."),
});

const rangeEventSchema = s.looseRequiredObject("A version or commit event delimiting an affected range.", {
  introduced: s.optional(s.string("The version or commit where the affected range begins.")),
  fixed: s.optional(s.string("The version or commit where the affected range ends.")),
  last_affected: s.optional(s.string("The last known affected version or commit.")),
  limit: s.optional(s.string("The first version or commit outside the affected range.")),
});

const rangeSchema = s.looseRequiredObject("A version or commit range affected by the vulnerability.", {
  type: s.nonEmptyString("The range type, such as SEMVER, ECOSYSTEM, or GIT."),
  repo: s.optional(s.url("The source repository for a GIT range.")),
  events: s.array("Ordered events delimiting the affected range.", rangeEventSchema),
});

const affectedSchema = s.looseRequiredObject("One package affected by the vulnerability.", {
  package: packageSchema,
  severity: s.optional(s.array("Package-specific severity scores.", severitySchema)),
  ranges: s.optional(s.array("Affected version or commit ranges.", rangeSchema)),
  versions: s.optional(s.array("Known affected versions.", s.string("An affected package version."))),
  ecosystem_specific: s.optional(s.unknown("Additional data defined by the package ecosystem.")),
  database_specific: s.optional(s.unknown("Additional data defined by the source vulnerability database.")),
});

const creditSchema = s.looseRequiredObject("Credit for discovering, reporting, or remediating the vulnerability.", {
  name: s.nonEmptyString("The credited person or organization."),
  contact: s.optional(s.array("Contact identifiers for the credited party.", s.string("A contact identifier."))),
  type: s.optional(s.string("The credit role defined by the OSV schema.")),
});

const vulnerabilitySchema: JsonSchema = s.looseRequiredObject("An OSV vulnerability record.", {
  schema_version: s.optional(s.string("The OSV schema version used by this record.")),
  id: s.nonEmptyString("The vulnerability identifier."),
  modified: s.dateTime("When the record was last modified."),
  published: s.optional(s.dateTime("When the vulnerability was published.")),
  withdrawn: s.optional(s.dateTime("When the record was withdrawn.")),
  aliases: s.optional(s.array("Alternative vulnerability identifiers.", s.string("An alternative identifier."))),
  related: s.optional(s.array("Related vulnerability identifiers.", s.string("A related identifier."))),
  upstream: s.optional(s.array("Upstream vulnerability identifiers.", s.string("An upstream identifier."))),
  summary: s.optional(s.string("A short vulnerability summary.")),
  details: s.optional(s.string("The detailed vulnerability description.")),
  severity: s.optional(s.array("Severity scores for the vulnerability.", severitySchema)),
  affected: s.optional(s.array("Packages affected by the vulnerability.", affectedSchema)),
  references: s.optional(s.array("References associated with the vulnerability.", referenceSchema)),
  credits: s.optional(s.array("Credits associated with the vulnerability.", creditSchema)),
  database_specific: s.optional(s.unknown("Additional data defined by the source vulnerability database.")),
});

export const osvActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_vulnerabilities",
    operationType: "read",
    description: "Find known vulnerabilities associated with a package or affecting a specific package version.",
    inputSchema: s.object(
      {
        ecosystem: s.nonEmptyString("The case-sensitive OSV ecosystem name, such as npm, PyPI, Go, or Maven."),
        package: s.nonEmptyString("The package name as used by its ecosystem."),
        version: s.optional(
          s.nonEmptyString("The package version to check. Omit it to return vulnerabilities across all versions."),
        ),
        pageToken: s.optional(s.nonEmptyString("The continuation token returned by a previous query.")),
      },
      { optional: ["version", "pageToken"], description: "Package vulnerability query." },
    ),
    outputSchema: s.object(
      {
        vulnerabilities: s.array("Vulnerabilities affecting the package version.", vulnerabilitySchema),
        nextPageToken: s.optional(s.string("The continuation token when more results are available.")),
      },
      { optional: ["nextPageToken"], description: "Known vulnerabilities returned by OSV." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_vulnerability",
    operationType: "read",
    description: "Get the complete OSV record for a vulnerability identifier.",
    inputSchema: s.object("Vulnerability lookup input.", {
      id: s.nonEmptyString("The case-sensitive OSV vulnerability identifier, such as GHSA-vp9c-fpxx-744v."),
    }),
    outputSchema: vulnerabilitySchema,
  }),
];
