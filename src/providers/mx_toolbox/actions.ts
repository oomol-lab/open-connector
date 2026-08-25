import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mx_toolbox";

const findingSchema = s.looseObject(
  {
    ID: s.integer("The numeric identifier of the MxToolbox check item."),
    Name: s.nonEmptyString("The MxToolbox check name."),
    Info: s.nonEmptyString("The summary text returned by MxToolbox for the check."),
    Url: s.nonEmptyString("The MxToolbox documentation URL for this check item."),
    PublicDescription: s.nullableString("The public description returned by MxToolbox for the check item."),
    AdditionalInfo: s.stringArray("Additional detail lines returned by MxToolbox for this check item."),
    IsExcludedByUser: s.boolean("Whether this check item is excluded in the MxToolbox account."),
    BlacklistResponseTime: s.string("The blacklist response time returned by MxToolbox when available."),
  },
  {
    description: "One failed, warning, passed, timeout, or error item returned by MxToolbox.",
  },
);

const informationItemSchema = s.looseObject(
  {},
  { description: "One command-specific information item returned by MxToolbox." },
);
const transcriptItemSchema = s.looseObject(
  {},
  { description: "One transcript item returned by MxToolbox for the lookup." },
);

const relatedLookupSchema = s.looseObject(
  {
    Name: s.nonEmptyString("The human-readable name of the related lookup."),
    URL: s.nonEmptyString("The related lookup URL returned by MxToolbox."),
    Command: s.nonEmptyString("The related lookup command returned by MxToolbox."),
    CommandArgument: s.nonEmptyString("The argument that MxToolbox suggests for the related lookup."),
  },
  { description: "One related lookup suggestion returned by MxToolbox." },
);

const httpResultItemSchema = s.looseObject(
  {
    Name: s.nonEmptyString("The name of one HTTP test result returned by MxToolbox."),
    Result: s.nonEmptyString("The outcome text for one HTTP test result."),
    TTL: s.string("The TTL or timing detail returned by MxToolbox for one HTTP test result."),
  },
  { description: "One HTTP result item returned by MxToolbox." },
);

const lookupInformationSchema = s.union(
  [
    s.array(informationItemSchema, {
      description: "The command-specific information entries returned by MxToolbox.",
    }),
    s.string("The summary information string returned by MxToolbox."),
  ],
  { description: "The command-specific information returned by MxToolbox." },
);

const transcriptEntrySchema = s.union([transcriptItemSchema, s.string("One transcript line returned by MxToolbox.")], {
  description: "One transcript entry returned by MxToolbox.",
});

const lookupResponseSchema = s.looseObject(
  {
    UID: s.nullableString("The unique identifier for this lookup result."),
    ArgumentType: s.string("The type MxToolbox inferred for the lookup argument, such as domain or IP."),
    Command: s.string("The command that MxToolbox executed."),
    CommandArgument: s.string("The domain, IP address, host, or other target that MxToolbox queried."),
    TimeRecorded: s.string("The timestamp when MxToolbox recorded the lookup result."),
    ReportingNameServer: s.nullableString("The reporting name server returned by MxToolbox for this lookup."),
    TimeToComplete: s.string("The lookup duration returned by MxToolbox, typically in milliseconds."),
    RelatedIP: s.nullableString("A related IP address returned by MxToolbox when available."),
    ResourceRecordType: s.integer("The numeric DNS resource record type returned by MxToolbox."),
    IsEmptySubDomain: s.boolean("Whether MxToolbox treated the lookup target as an empty subdomain."),
    IsTransitioned: s.boolean("Whether MxToolbox marked the lookup result as transitioned."),
    SPF_Subaction_Detail: s.unknown("The command-specific SPF subaction detail returned by MxToolbox."),
    Records: s.unknown("The raw records payload returned by MxToolbox for some commands."),
    IsEndpoint: s.boolean("Whether MxToolbox treated the target as an endpoint."),
    HasSubscriptions: s.boolean("Whether the authenticated account has subscriptions for this target."),
    AlertgroupSubscriptionId: s.unknown("The alert group subscription identifier returned by MxToolbox."),
    Failed: s.array(findingSchema, { description: "The failed checks returned by MxToolbox." }),
    Warnings: s.array(findingSchema, { description: "The warning checks returned by MxToolbox." }),
    Passed: s.array(findingSchema, { description: "The passed checks returned by MxToolbox." }),
    Timeouts: s.array(s.unknown("One timeout item returned by MxToolbox."), {
      description: "The timeout items returned by MxToolbox.",
    }),
    Errors: s.array(s.unknown("One error item returned by MxToolbox."), {
      description: "The error items returned by MxToolbox.",
    }),
    IsError: s.boolean("Whether MxToolbox marked the response as an error."),
    Information: lookupInformationSchema,
    MultiInformation: s.array(informationItemSchema, {
      description: "The multi-information entries returned by MxToolbox.",
    }),
    Transcript: s.array(transcriptEntrySchema, { description: "The transcript entries returned by MxToolbox." }),
    MxRep: s.number("The MX reputation score returned by MxToolbox."),
    EmailServiceProvider: s.nullableString("The email service provider name returned by MxToolbox."),
    DnsServiceProvider: s.nullableString("The DNS service provider name returned by MxToolbox."),
    DnsServiceProviderIdentifier: s.nullableString("The DNS service provider identifier returned by MxToolbox."),
    CustomData: s.unknown("Additional command-specific custom data returned by MxToolbox."),
    RelatedLookups: s.array(relatedLookupSchema, {
      description: "The related lookup suggestions returned by MxToolbox.",
    }),
    Domain: s.string("The queried domain returned by MxToolbox for HTTP lookups."),
    IPAddress: s.string("The resolved IP address returned by MxToolbox for HTTP lookups."),
    IsSuccess: s.boolean("Whether MxToolbox marked the HTTP lookup as successful."),
    HostChanged: s.boolean("Whether the resolved host changed during the HTTP lookup."),
    ResultArray: s.array(httpResultItemSchema, {
      description: "The detailed HTTP test results returned by MxToolbox.",
    }),
    ErrorMessage: s.string("The HTTP error message returned by MxToolbox when available."),
    ResponseTime: s.string("The HTTP response time returned by MxToolbox."),
  },
  { description: "The official MxToolbox response payload for lookup actions." },
);

const usageCheckResponseSchema = s.looseObject(
  {
    DnsRequests: s.integer("The number of DNS lookup requests made in the current cycle."),
    DnsMax: s.integer("The maximum number of DNS lookups allowed in the current cycle."),
    DnsOverageErrors: s.integer("The number of DNS overage errors returned by MxToolbox."),
    NetworkRequests: s.integer("The number of network requests made in the current cycle."),
    NetworkMax: s.integer("The maximum number of network requests allowed in the current cycle."),
    NetworkOverageErrors: s.integer("The number of network overage errors returned by MxToolbox."),
  },
  { description: "The official MxToolbox usage response payload." },
);

const monitorStatusItemSchema = s.looseObject(
  {
    MonitorUID: s.nonEmptyString("The unique identifier of the monitor."),
    ActionString: s.nonEmptyString("The monitor type and target returned by MxToolbox."),
    LastTransition: s.string("The timestamp when the monitor last changed state."),
    LastChecked: s.string("The timestamp when the monitor was last checked."),
    MxRep: s.union(
      [
        s.string("The MX reputation score returned as a string."),
        s.number("The MX reputation score returned as a number."),
      ],
      {
        description: "The MX reputation score returned by MxToolbox for the monitor.",
      },
    ),
    Failing: s.array(s.unknown("One failing monitor detail returned by MxToolbox."), {
      description: "The failing monitor details returned by MxToolbox.",
    }),
    Warnings: s.array(s.unknown("One warning detail returned by MxToolbox."), {
      description: "The warning details returned by MxToolbox.",
    }),
  },
  { description: "One monitor status item returned by MxToolbox." },
);

const monitorStatusResponseSchema = s.looseObject(
  {
    data: s.looseObject(
      {
        details: s.array(monitorStatusItemSchema, {
          description: "The list of monitor status items returned by MxToolbox.",
        }),
      },
      { description: "The monitor status data wrapper returned by MxToolbox." },
    ),
    error: s.nullableString("The error message returned by MxToolbox when monitor retrieval fails."),
    successfull: s.boolean("Whether MxToolbox marked the monitor status request as successful."),
  },
  { description: "The official MxToolbox monitor status response payload." },
);

type LookupInputKey = "domain" | "domain_or_ip";

export interface MxToolboxLookupActionDefinition {
  name:
    | "lookup_dns"
    | "lookup_mx"
    | "lookup_dkim"
    | "lookup_dmarc"
    | "lookup_spf"
    | "lookup_blacklist"
    | "lookup_http"
    | "lookup_smtp"
    | "lookup_ping"
    | "lookup_mta_sts_record"
    | "lookup_bimi_record";
  command: "dns" | "mx" | "dkim" | "dmarc" | "spf" | "blacklist" | "http" | "smtp" | "ping" | "mta-sts" | "bimi";
  description: string;
  inputKey: LookupInputKey;
  inputDescription: string;
  inputObjectDescription: string;
}

export const mxToolboxLookupActionDefinitions: readonly MxToolboxLookupActionDefinition[] = [
  {
    name: "lookup_dns",
    command: "dns",
    description: "Perform a comprehensive DNS lookup for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose DNS records and health checks should be looked up, such as `google.com`.",
    inputObjectDescription: "Input parameters for running a DNS lookup with MxToolbox.",
  },
  {
    name: "lookup_mx",
    command: "mx",
    description: "Look up MX records for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose MX records should be looked up, such as `example.com`.",
    inputObjectDescription: "Input parameters for running an MX lookup with MxToolbox.",
  },
  {
    name: "lookup_dkim",
    command: "dkim",
    description: "Look up one DKIM record and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription:
      "The full DKIM DNS hostname in the form `selector._domainkey.domain`, such as `default._domainkey.example.com`.",
    inputObjectDescription: "Input parameters for running a DKIM lookup with MxToolbox.",
  },
  {
    name: "lookup_dmarc",
    command: "dmarc",
    description: "Look up the DMARC record for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose DMARC record should be looked up, such as `example.com`.",
    inputObjectDescription: "Input parameters for running a DMARC lookup with MxToolbox.",
  },
  {
    name: "lookup_spf",
    command: "spf",
    description: "Look up the SPF record for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose SPF record should be looked up, such as `example.com`.",
    inputObjectDescription: "Input parameters for running an SPF lookup with MxToolbox.",
  },
  {
    name: "lookup_blacklist",
    command: "blacklist",
    description:
      "Check whether a domain or IP is listed on blacklists and return the official MxToolbox response payload.",
    inputKey: "domain_or_ip",
    inputDescription: "The bare domain or IP address that should be checked against blacklists.",
    inputObjectDescription: "Input parameters for running a blacklist lookup with MxToolbox.",
  },
  {
    name: "lookup_http",
    command: "http",
    description: "Run an HTTP lookup for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose HTTP diagnostics should be run, such as `example.com`.",
    inputObjectDescription: "Input parameters for running an HTTP lookup with MxToolbox.",
  },
  {
    name: "lookup_smtp",
    command: "smtp",
    description: "Run an SMTP lookup for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose SMTP diagnostics should be run, such as `example.com`.",
    inputObjectDescription: "Input parameters for running an SMTP lookup with MxToolbox.",
  },
  {
    name: "lookup_ping",
    command: "ping",
    description: "Ping a domain or IP and return the official MxToolbox response payload.",
    inputKey: "domain_or_ip",
    inputDescription: "The bare domain or IP address that should be pinged, such as `google.com` or `8.8.8.8`.",
    inputObjectDescription: "Input parameters for running a ping lookup with MxToolbox.",
  },
  {
    name: "lookup_mta_sts_record",
    command: "mta-sts",
    description: "Look up the MTA-STS record for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose MTA-STS record should be looked up, such as `example.com`.",
    inputObjectDescription: "Input parameters for running an MTA-STS lookup with MxToolbox.",
  },
  {
    name: "lookup_bimi_record",
    command: "bimi",
    description: "Look up the BIMI record for a domain and return the official MxToolbox response payload.",
    inputKey: "domain",
    inputDescription: "The bare domain whose BIMI record should be looked up, such as `example.com`.",
    inputObjectDescription: "Input parameters for running a BIMI lookup with MxToolbox.",
  },
];

function buildLookupInputSchema(definition: MxToolboxLookupActionDefinition): JsonSchema {
  return s.object(
    {
      [definition.inputKey]: s.nonEmptyString(definition.inputDescription),
    },
    {
      required: [definition.inputKey],
      description: definition.inputObjectDescription,
    },
  );
}

const usageCheckAction = defineProviderAction(service, {
  name: "usage_check",
  description: "Retrieve API usage statistics for DNS and network lookups from MxToolbox.",
  inputSchema: s.object({}, { description: "Input parameters for retrieving MxToolbox API usage statistics." }),
  outputSchema: usageCheckResponseSchema,
});

const monitorStatusAction = defineProviderAction(service, {
  name: "monitor_status",
  description: "Retrieve the current status of all monitors in the authenticated MxToolbox account.",
  inputSchema: s.object({}, { description: "Input parameters for retrieving MxToolbox monitor status." }),
  outputSchema: monitorStatusResponseSchema,
});

export const mxToolboxActions: ActionDefinition[] = [
  ...mxToolboxLookupActionDefinitions.map((definition) =>
    defineProviderAction(service, {
      name: definition.name,
      description: definition.description,
      requiredScopes: [],
      inputSchema: buildLookupInputSchema(definition),
      outputSchema: lookupResponseSchema,
    }),
  ),
  usageCheckAction,
  monitorStatusAction,
];
