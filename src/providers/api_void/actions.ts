import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "api_void";

const quotaSchema = s.object(
  "Quota values parsed from the APIVoid X-Service-Quota response header.",
  {
    raw: s.string("The raw X-Service-Quota header value."),
    callUsage: s.integer("The amount of credits consumed for the request."),
    available: s.integer("The amount of credits available after the request."),
    reset: s.integer("Unix timestamp when credits will next reset."),
    overageAllowed: s.boolean("Whether overage is allowed on the subscription plan."),
    overageEnabled: s.boolean("Whether overage is enabled for the account."),
    overageValue: s.integer("The amount of overage credits consumed."),
    overageLimit: s.integer("The maximum overage credits allowed in the billing cycle."),
  },
  {
    optional: ["callUsage", "available", "reset", "overageAllowed", "overageEnabled", "overageValue", "overageLimit"],
  },
);

function responseSchema(description: string, dataSchema: JsonSchema): JsonSchema {
  return s.object(description, {
    data: dataSchema,
    quota: s.nullable(quotaSchema),
  });
}

function looseDataSchema(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return s.looseObject(description, properties);
}

const accountInfoOutputSchema = responseSchema(
  "APIVoid account details and quota metadata.",
  looseDataSchema("APIVoid account, credit, overage, and usage statistics.", {
    credits: s.looseObject("APIVoid credit details."),
    overage: s.looseObject("APIVoid overage settings."),
    usage_stats: s.looseObject("APIVoid usage statistics."),
  }),
);

const ipReputationInputSchema = s.object(
  "Input parameters for checking IP reputation with APIVoid.",
  {
    ip: s.nonEmptyString("The public IPv4 or IPv6 address to scan with APIVoid."),
    excludeEngines: s.nonEmptyString("Comma-separated APIVoid engine names to exclude from the scan."),
    spamhausKey: s.nonEmptyString("Optional Spamhaus DBL DQS key to enable the Spamhaus engine."),
    disableReverseDns: s.boolean("Whether to disable reverse DNS lookup to reduce response time."),
  },
  { optional: ["excludeEngines", "spamhausKey", "disableReverseDns"] },
);

const ipReputationOutputSchema = responseSchema(
  "APIVoid IP reputation result and quota metadata.",
  looseDataSchema("APIVoid IP reputation payload.", {
    ip: s.string("The IP address submitted for scanning."),
    blacklists: s.looseObject("Blacklist engine results returned by APIVoid."),
    information: s.looseObject("IP geolocation and network information returned by APIVoid."),
    anomaly: s.looseObject("Anomaly and proxy risk flags returned by APIVoid."),
    risk_score: s.looseObject("APIVoid IP risk score."),
  }),
);

const domainReputationInputSchema = s.object(
  "Input parameters for checking domain reputation with APIVoid.",
  {
    host: s.nonEmptyString("The domain or host to submit, for example google.com."),
    excludeEngines: s.nonEmptyString("Comma-separated APIVoid engine names to exclude from the scan."),
    spamhausKey: s.nonEmptyString("Optional Spamhaus DBL DQS key to enable the Spamhaus engine."),
    includeDomainAge: s.boolean(
      "Whether APIVoid should include domain age as a risk factor. This may consume an additional credit.",
    ),
    domainAgeCacheOnly: s.boolean("Whether to use only cached domain age data when includeDomainAge is enabled."),
  },
  { optional: ["excludeEngines", "spamhausKey", "includeDomainAge", "domainAgeCacheOnly"] },
);

const domainReputationOutputSchema = responseSchema(
  "APIVoid domain reputation result and quota metadata.",
  looseDataSchema("APIVoid domain reputation payload.", {
    host: s.string("The host submitted for scanning."),
    blacklists: s.looseObject("Blacklist engine results returned by APIVoid."),
    category: s.looseObject("Domain category and structural risk flags returned by APIVoid."),
    risk_score: s.looseObject("APIVoid domain risk score."),
    domain_age: s.looseObject("Domain age details returned when requested."),
  }),
);

const urlReputationInputSchema = s.object("Input parameters for checking URL reputation with APIVoid.", {
  url: s.url("The URL to submit for reputation scanning."),
});

const urlReputationOutputSchema = responseSchema(
  "APIVoid URL reputation result and quota metadata.",
  looseDataSchema("APIVoid URL reputation payload.", {
    url: s.string("The URL submitted for scanning."),
    dns_records: s.looseObject("DNS records returned by APIVoid."),
    domain_blacklist: s.looseObject("Domain blacklist engine results returned by APIVoid."),
    file_type: s.looseObject("File type details returned by APIVoid."),
    risk_score: s.looseObject("APIVoid URL risk score."),
  }),
);

const verifyEmailInputSchema = s.object(
  "Input parameters for verifying an email address or email domain with APIVoid. Provide exactly one of email or domain.",
  {
    email: s.email("The email address to submit for APIVoid verification."),
    domain: s.nonEmptyString("The email domain to submit when verifying domain-level email signals."),
  },
  { optional: ["email", "domain"] },
);

const verifyEmailOutputSchema = responseSchema(
  "APIVoid email verification result and quota metadata.",
  looseDataSchema("APIVoid email verification payload.", {
    email: s.string("The email address submitted for verification."),
    canonical_email: s.string("The normalized email address returned by APIVoid."),
    valid_format: s.boolean("Whether APIVoid found a valid email format."),
    domain: s.string("The email domain returned by APIVoid."),
    disposable: s.boolean("Whether the email domain is disposable."),
    should_block: s.boolean("Whether APIVoid recommends blocking the email."),
    score: s.integer("APIVoid email score."),
    elapsed_ms: s.integer("APIVoid processing time in milliseconds."),
  }),
);

export const apiVoidActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Get APIVoid account credit, overage, and usage information.",
    inputSchema: s.object("Input parameters for APIVoid account info.", {}),
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_ip_reputation",
    description: "Check the reputation, blacklist status, and risk score of an IP address with APIVoid.",
    inputSchema: ipReputationInputSchema,
    outputSchema: ipReputationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_domain_reputation",
    description: "Check the reputation, blacklist status, category flags, and risk score of a domain with APIVoid.",
    inputSchema: domainReputationInputSchema,
    outputSchema: domainReputationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_url_reputation",
    description: "Check DNS, blacklist, file, and risk signals for a URL with APIVoid.",
    inputSchema: urlReputationInputSchema,
    outputSchema: urlReputationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify an email address or email domain with APIVoid.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: verifyEmailOutputSchema,
  }),
];
