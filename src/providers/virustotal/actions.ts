import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "virustotal";

const rawObject = s.looseObject("The JSON object returned by VirusTotal.");
const linksSchema = s.looseObject("Links returned by the VirusTotal API.", {
  self: s.nonEmptyString("Canonical API URL for this resource or collection."),
  next: s.nonEmptyString("API URL for the next page of results."),
  prev: s.nonEmptyString("API URL for the previous page of results."),
  related: s.nonEmptyString("API URL for the related-resource view."),
});
const collectionMetaSchema = s.looseObject("Pagination metadata returned by VirusTotal collections.", {
  count: s.integer("Number of items returned in the current response page."),
  cursor: s.nonEmptyString("Cursor to request the next page of results."),
});
const objectDescriptorSchema = s.looseObject("A VirusTotal object descriptor.", {
  id: s.nonEmptyString("Unique identifier of the VirusTotal object."),
  type: s.nonEmptyString("VirusTotal object type."),
  links: linksSchema,
});
const analysisStatsSchema = s.record(
  "Aggregated verdict counts from a VirusTotal analysis.",
  s.integer("One verdict count."),
);
const engineResultsSchema = s.record(
  "Mapping of engine name to per-engine analysis result.",
  s.looseObject("Per-engine analysis result returned by VirusTotal."),
);
const genericObjectAttributesSchema = s.looseObject("Common VirusTotal object attributes shared across reports.", {
  last_analysis_date: s.integer("Unix timestamp of the latest VirusTotal analysis."),
  last_analysis_stats: analysisStatsSchema,
  last_analysis_results: engineResultsSchema,
  reputation: s.integer("Community reputation score for the object."),
  tags: s.stringArray("Tags assigned to the object."),
});

const analysisObjectSchema = s.looseObject("A VirusTotal analysis object.", {
  id: s.nonEmptyString("Unique identifier of the analysis."),
  type: s.nonEmptyString("VirusTotal object type for the analysis."),
  links: linksSchema,
  attributes: s.looseObject("Attributes of the VirusTotal analysis object.", {
    date: s.integer("Unix timestamp when the analysis was created."),
    status: s.nonEmptyString("Current status of the analysis."),
    stats: analysisStatsSchema,
    results: engineResultsSchema,
  }),
});
const fileObjectSchema = s.looseObject("A VirusTotal file object.", {
  id: s.nonEmptyString("SHA-256 or canonical identifier of the file."),
  type: s.nonEmptyString("VirusTotal object type for the file."),
  links: linksSchema,
  attributes: genericObjectAttributesSchema,
});
const urlObjectSchema = s.looseObject("A VirusTotal URL object.", {
  id: s.nonEmptyString("VirusTotal URL identifier."),
  type: s.nonEmptyString("VirusTotal object type for the URL."),
  links: linksSchema,
  attributes: genericObjectAttributesSchema,
});
const domainObjectSchema = s.looseObject("A VirusTotal domain object.", {
  id: s.nonEmptyString("Domain name used as the VirusTotal object identifier."),
  type: s.nonEmptyString("VirusTotal object type for the domain."),
  links: linksSchema,
  attributes: genericObjectAttributesSchema,
});
const ipAddressObjectSchema = s.looseObject("A VirusTotal IP address object.", {
  id: s.nonEmptyString("IP address used as the VirusTotal object identifier."),
  type: s.nonEmptyString("VirusTotal object type for the IP address."),
  links: linksSchema,
  attributes: genericObjectAttributesSchema,
});
const searchItemSchema = s.looseObject("One VirusTotal object returned by the search endpoint.", {
  id: s.nonEmptyString("Unique identifier of the returned object."),
  type: s.nonEmptyString("VirusTotal object type."),
  links: linksSchema,
  attributes: rawObject,
});
const relationshipItemSchema = s.looseObject("One item returned by a VirusTotal relationship collection.", {
  id: s.nonEmptyString("Unique identifier of the related object."),
  type: s.nonEmptyString("VirusTotal object type of the related object."),
  links: linksSchema,
  attributes: rawObject,
  context_attributes: rawObject,
  error: s.looseObject("Error details when the related object is not present in the dataset."),
});
const commentObjectSchema = s.looseObject("A VirusTotal comment object.", {
  id: s.nonEmptyString("Unique identifier of the comment."),
  type: s.nonEmptyString("VirusTotal object type for the comment."),
  links: linksSchema,
  attributes: rawObject,
});
const voteObjectSchema = s.looseObject("A VirusTotal vote object.", {
  id: s.nonEmptyString("Unique identifier of the vote."),
  type: s.nonEmptyString("VirusTotal object type for the vote."),
  links: linksSchema,
  attributes: rawObject,
});
const metadataPayloadSchema = s.looseObject("Payload returned by the VirusTotal metadata endpoint.", {
  engines: s.record("Mapping of engine name to engine metadata.", rawObject),
  privileges: s.stringArray("Privileges granted to the current API key."),
  relationships: s.record(
    "Available relationships grouped by object type.",
    s.array("Relationship definitions.", rawObject),
  ),
});

const optionalCursorSchema = s.nonEmptyString("Pagination cursor returned by a previous response.");
const limitSchema = s.integer("Maximum number of results to return.", { minimum: 1, maximum: 40 });
const searchInputSchema = s.object(
  "Input parameters for searching the VirusTotal dataset.",
  {
    query: s.nonEmptyString("Search query accepted by VirusTotal."),
    limit: limitSchema,
    cursor: optionalCursorSchema,
  },
  { optional: ["limit", "cursor"] },
);
const getUrlReportInputSchema = s.object(
  "Input parameters for retrieving a URL report.",
  {
    url: s.nonEmptyString("Raw URL string that will be converted into a VirusTotal URL identifier."),
    urlId: s.nonEmptyString("VirusTotal URL identifier encoded as unpadded base64url."),
  },
  { optional: ["url", "urlId"] },
);

function singleResponseSchema(data: JsonSchema, description: string): JsonSchema {
  return s.object(description, {
    data,
    meta: rawObject,
    links: linksSchema,
  });
}

function collectionResponseSchema(item: JsonSchema, description: string): JsonSchema {
  return s.object(description, {
    data: s.array("Items returned by the VirusTotal collection endpoint.", item),
    meta: collectionMetaSchema,
    links: linksSchema,
  });
}

function relationshipInputSchema(objectLabel: "domain" | "ipAddress"): JsonSchema {
  return s.object(
    `Input parameters for retrieving ${objectLabel} relationships.`,
    {
      [objectLabel]:
        objectLabel === "domain"
          ? s.nonEmptyString("Domain name whose related objects should be retrieved.")
          : s.nonEmptyString("IPv4 or IPv6 address whose related objects should be retrieved."),
      relationship: s.nonEmptyString("Relationship name documented by VirusTotal for the target object type."),
      limit: limitSchema,
      cursor: optionalCursorSchema,
      descriptorsOnly: s.boolean("Whether to return relationship descriptors instead of complete related objects."),
    },
    { optional: ["limit", "cursor", "descriptorsOnly"] },
  );
}

function resourceTargetSchema(
  description: string,
  extraProperties: Record<string, JsonSchema>,
  optional: string[],
): JsonSchema {
  return s.object(
    description,
    {
      fileId: s.nonEmptyString("File identifier such as a SHA-256 hash."),
      url: s.nonEmptyString("Raw URL string that will be converted into a VirusTotal URL identifier."),
      urlId: s.nonEmptyString("VirusTotal URL identifier encoded as unpadded base64url."),
      domain: s.nonEmptyString("Domain name to target."),
      ipAddress: s.nonEmptyString("IPv4 or IPv6 address to target."),
      ...extraProperties,
    },
    { optional: ["fileId", "url", "urlId", "domain", "ipAddress", ...optional] },
  );
}

const getCommentsInputSchema = resourceTargetSchema(
  "Input parameters for retrieving comments on a VirusTotal resource.",
  { limit: limitSchema, cursor: optionalCursorSchema },
  ["limit", "cursor"],
);
const addCommentInputSchema = resourceTargetSchema(
  "Input parameters for adding a comment to a VirusTotal resource.",
  { text: s.nonEmptyString("Comment text to submit for the resource.") },
  [],
);
const getVotesInputSchema = resourceTargetSchema(
  "Input parameters for retrieving votes on a VirusTotal resource.",
  { limit: limitSchema, cursor: optionalCursorSchema },
  ["limit", "cursor"],
);
const addVoteInputSchema = resourceTargetSchema(
  "Input parameters for adding a vote to a VirusTotal resource.",
  { verdict: s.stringEnum("Verdict to submit for the resource.", ["harmless", "malicious"]) },
  [],
);

const descriptorResponseSchema = singleResponseSchema(
  objectDescriptorSchema,
  "Response containing a VirusTotal object descriptor.",
);

export type VirustotalActionName =
  | "search"
  | "get_metadata"
  | "get_analysis"
  | "get_file_report"
  | "upload_file"
  | "rescan_file"
  | "scan_url"
  | "get_url_report"
  | "get_domain_report"
  | "get_domain_relationships"
  | "get_ip_address_report"
  | "get_ip_address_relationships"
  | "get_comments"
  | "add_comment"
  | "get_votes"
  | "add_vote";

export const virustotalActions: ProviderActionDefinition<VirustotalActionName>[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Search files, URLs, domains, IPs, and other objects in VirusTotal.",
    inputSchema: searchInputSchema,
    outputSchema: collectionResponseSchema(
      searchItemSchema,
      "Search response returned by the VirusTotal search endpoint.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_metadata",
    description: "Retrieve VirusTotal metadata, including available privileges, engines, and relationship names.",
    inputSchema: s.object("Input parameters for retrieving VirusTotal metadata.", {}),
    outputSchema: singleResponseSchema(metadataPayloadSchema, "Response returned by the VirusTotal metadata endpoint."),
  }),
  defineProviderAction(service, {
    name: "get_analysis",
    description: "Retrieve a VirusTotal analysis object by analysis ID.",
    inputSchema: s.object("Input parameters for retrieving an analysis object.", {
      analysisId: s.nonEmptyString("Identifier of the analysis to retrieve."),
    }),
    outputSchema: singleResponseSchema(analysisObjectSchema, "Response returned by the VirusTotal analysis endpoint."),
  }),
  defineProviderAction(service, {
    name: "get_file_report",
    description: "Retrieve the latest VirusTotal report for a file identifier.",
    inputSchema: s.object("Input parameters for retrieving a file report.", {
      fileId: s.nonEmptyString("File identifier such as a SHA-256, SHA-1, or MD5 hash."),
    }),
    outputSchema: singleResponseSchema(fileObjectSchema, "Response returned by the VirusTotal file-report endpoint."),
  }),
  defineProviderAction(service, {
    name: "upload_file",
    description: "Upload a file to VirusTotal for analysis, automatically using the large-file upload URL when needed.",
    inputSchema: s.object(
      "Input parameters for uploading a file to VirusTotal.",
      {
        contentBase64: s.nonEmptyString("Base64-encoded file bytes to upload for analysis."),
        fileName: s.nonEmptyString("Filename to associate with the uploaded file."),
        password: s.nonEmptyString("Password used to unpack a protected ZIP before analysis."),
      },
      { optional: ["fileName", "password"] },
    ),
    outputSchema: descriptorResponseSchema,
  }),
  defineProviderAction(service, {
    name: "rescan_file",
    description: "Request a fresh VirusTotal analysis for a previously submitted file.",
    inputSchema: s.object("Input parameters for re-analyzing a previously submitted file.", {
      fileId: s.nonEmptyString("Identifier of the file to re-analyze."),
    }),
    outputSchema: descriptorResponseSchema,
  }),
  defineProviderAction(service, {
    name: "scan_url",
    description: "Submit a URL to VirusTotal for analysis.",
    inputSchema: s.object("Input parameters for submitting a URL to VirusTotal.", {
      url: s.nonEmptyString("Raw URL to submit for analysis."),
    }),
    outputSchema: descriptorResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_url_report",
    description:
      "Retrieve the latest VirusTotal report for a URL using either a raw URL or a VirusTotal URL identifier.",
    inputSchema: getUrlReportInputSchema,
    outputSchema: singleResponseSchema(urlObjectSchema, "Response returned by the VirusTotal URL-report endpoint."),
  }),
  defineProviderAction(service, {
    name: "get_domain_report",
    description: "Retrieve the latest VirusTotal report for a domain.",
    inputSchema: s.object("Input parameters for retrieving a domain report.", {
      domain: s.nonEmptyString("Domain name to retrieve."),
    }),
    outputSchema: singleResponseSchema(
      domainObjectSchema,
      "Response returned by the VirusTotal domain-report endpoint.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_domain_relationships",
    description: "Retrieve related VirusTotal objects for a domain, with an option to request descriptors only.",
    inputSchema: relationshipInputSchema("domain"),
    outputSchema: collectionResponseSchema(
      relationshipItemSchema,
      "Response returned by a VirusTotal domain-relationship endpoint.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ip_address_report",
    description: "Retrieve the latest VirusTotal report for an IP address.",
    inputSchema: s.object("Input parameters for retrieving an IP address report.", {
      ipAddress: s.nonEmptyString("IPv4 or IPv6 address to retrieve."),
    }),
    outputSchema: singleResponseSchema(
      ipAddressObjectSchema,
      "Response returned by the VirusTotal IP-address report endpoint.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ip_address_relationships",
    description: "Retrieve related VirusTotal objects for an IP address, with an option to request descriptors only.",
    inputSchema: relationshipInputSchema("ipAddress"),
    outputSchema: collectionResponseSchema(
      relationshipItemSchema,
      "Response returned by a VirusTotal IP-address relationship endpoint.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_comments",
    description: "Retrieve community comments for a file, URL, domain, or IP address in VirusTotal.",
    inputSchema: getCommentsInputSchema,
    outputSchema: collectionResponseSchema(commentObjectSchema, "Response returned by a VirusTotal comments endpoint."),
  }),
  defineProviderAction(service, {
    name: "add_comment",
    description: "Add a community comment to a file, URL, domain, or IP address in VirusTotal.",
    inputSchema: addCommentInputSchema,
    outputSchema: singleResponseSchema(commentObjectSchema, "Response returned after creating a VirusTotal comment."),
  }),
  defineProviderAction(service, {
    name: "get_votes",
    description: "Retrieve community votes for a file, URL, domain, or IP address in VirusTotal.",
    inputSchema: getVotesInputSchema,
    outputSchema: collectionResponseSchema(voteObjectSchema, "Response returned by a VirusTotal votes endpoint."),
  }),
  defineProviderAction(service, {
    name: "add_vote",
    description: "Submit a harmless or malicious vote for a VirusTotal file, URL, domain, or IP.",
    inputSchema: addVoteInputSchema,
    outputSchema: singleResponseSchema(voteObjectSchema, "Response returned after creating a VirusTotal vote."),
  }),
];
