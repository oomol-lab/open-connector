import type { SalesforceHandler } from "./context.ts";

import XMLBuilder from "fast-xml-builder";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { optionalString, recordOrEmpty } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
const builder = new XMLBuilder({ ignoreAttributes: false });
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: true,
});
const conversionFields = [
  "accountId",
  "contactId",
  "convertedStatus",
  "doNotCreateOpportunity",
  "leadId",
  "opportunityId",
  "opportunityName",
  "overwriteLeadSource",
  "ownerId",
  "relatedPersonAccountId",
  "relatedPersonAccountRecord",
  "sendNotificationEmail",
];
export const salesforceLeadHandlers: Record<string, SalesforceHandler> = {
  async convert_leads(d, c) {
    const conversions = d.conversions as Record<string, unknown>[];
    const leadConverts = conversions.map((entry) => {
      if (
        (entry.opportunityId !== undefined && entry.opportunityName !== undefined) ||
        (entry.doNotCreateOpportunity === true &&
          (entry.opportunityId !== undefined || entry.opportunityName !== undefined))
      )
        throw providerInputError("Opportunity ID, name and doNotCreateOpportunity conflict");
      if ((entry.contactId !== undefined || entry.overwriteLeadSource === true) && entry.accountId === undefined)
        throw providerInputError("An existing contact requires accountId");
      if (entry.overwriteLeadSource === true && entry.contactId === undefined)
        throw providerInputError("overwriteLeadSource requires contactId");
      if (entry.relatedPersonAccountId !== undefined && entry.relatedPersonAccountRecord !== undefined)
        throw providerInputError("Choose an existing or new related Person Account");
      const result: Record<string, unknown> = {};
      for (const key of conversionFields) {
        if (
          entry[key] === undefined &&
          !["doNotCreateOpportunity", "overwriteLeadSource", "sendNotificationEmail"].includes(key)
        )
          continue;
        if (key === "relatedPersonAccountRecord") {
          const fields = recordOrEmpty(recordOrEmpty(entry[key]).fields);
          const entity: Record<string, unknown> = {
            "obj:type": "Account",
            "obj:fieldsToNull": Object.entries(fields)
              .filter(([, value]) => value === null)
              .map(([name]) => name),
          };
          for (const [name, value] of Object.entries(fields)) {
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || name === "type" || name === "fieldsToNull")
              throw providerInputError("Invalid Person Account field API name");
            if (value !== null) entity[`obj:${name}`] = value;
          }
          result[key] = entity;
        } else result[key] = entry[key] ?? false;
      }
      return result;
    });
    const xml = builder.build({
      "env:Envelope": {
        "@_xmlns:env": "http://schemas.xmlsoap.org/soap/envelope/",
        "@_xmlns": "urn:partner.soap.sforce.com",
        "@_xmlns:obj": "urn:sobject.partner.soap.sforce.com",
        "env:Header": { SessionHeader: { sessionId: c.accessToken } },
        "env:Body": { convertLead: { leadConverts } },
      },
    });
    return runProviderRequest({ label: "Salesforce", signal: c.signal }, async (signal) => {
      const response = await c.fetcher(new URL(`/services/Soap/u/${c.version}`, c.origin), {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=UTF-8",
          "accept": "text/xml",
          "SOAPAction": "convertLead",
        },
        body: xml,
        signal,
        redirect: "manual",
      });
      const text = await response.text();
      if (text.includes("<!DOCTYPE") || text.includes("<!ENTITY") || XMLValidator.validate(text) !== true)
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          "Salesforce returned invalid SOAP XML",
          undefined,
          "provider_error",
        );
      const body = recordOrEmpty(recordOrEmpty(parser.parse(text)).Envelope).Body;
      const envelope = requiredResponseRecord(body, "Salesforce SOAP body");
      const fault = recordOrEmpty(envelope.Fault);
      if (envelope.Fault || !response.ok) {
        const message = [optionalString(fault.faultcode), optionalString(fault.faultstring)].filter(Boolean).join(": ");
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `Salesforce: ${message || `HTTP ${response.status}`}`.split(c.accessToken).join("[REDACTED]"),
          undefined,
          "provider_error",
        );
      }
      const raw = recordOrEmpty(envelope.convertLeadResponse).result;
      if (raw === undefined) throw providerResponseError("Salesforce SOAP response is missing conversion results");
      const results = (Array.isArray(raw) ? raw : [raw]).map((value) => {
        const result = requiredResponseRecord(value, "Salesforce conversion result");
        if (!["true", "false", "1", "0"].includes(String(result.success)))
          throw providerResponseError("Salesforce conversion result is missing success");
        return {
          ...result,
          success: result.success === "true" || result.success === "1",
          leadId: optionalString(result.leadId) ?? null,
          accountId: optionalString(result.accountId) ?? null,
          contactId: optionalString(result.contactId) ?? null,
          opportunityId: optionalString(result.opportunityId) ?? null,
          errors: result.errors === undefined ? [] : Array.isArray(result.errors) ? result.errors : [result.errors],
        };
      });
      return { results };
    });
  },
};
