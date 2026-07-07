import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AwsStsActionName } from "./actions.ts";

import { createHash, createHmac } from "node:crypto";
import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalScalarString,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "aws_sts";
const stsApiVersion = "2011-06-15";
const awsServiceName = "sts";
const defaultRegion = "ap-southeast-1";
const defaultRoleSessionName = "oomol-connect";

interface AwsStsContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AwsStsCredential {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
  requestId: string | null;
  assumedRoleUser: {
    arn: string | null;
    assumedRoleId: string | null;
  } | null;
  packedPolicySize: number | null;
  sourceIdentity: string | null;
}

interface AssumeAwsRoleInput {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
  roleArn: string;
  roleSessionName?: string;
  durationSeconds?: number;
  policy?: string;
  policyArns?: Array<{ arn?: string }>;
  externalId?: string;
  serialNumber?: string;
  tokenCode?: string;
  sourceIdentity?: string;
  tags?: Array<{ key?: string; value?: string }>;
  transitiveTagKeys?: string[];
}

interface StsXmlNode {
  name: string;
  children: StsXmlNode[];
  text: string;
}

type AwsStsActionHandler = (input: Record<string, unknown>, context: AwsStsContext) => Promise<unknown>;

export const awsStsActionHandlers: Record<AwsStsActionName, AwsStsActionHandler> = {
  assume_role(input, context) {
    return executeAssumeRole(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AwsStsContext>({
  service,
  handlers: awsStsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AwsStsContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aws_sts custom credentials first.");
    }
    return {
      values: credential.values,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method !== "POST") {
      throw new ProviderRequestError(400, "aws_sts proxy only supports POST requests.");
    }

    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aws_sts custom credentials first.");
    }

    const region = defaultRegion;
    const url = createProviderProxyUrl(`https://sts.${region}.amazonaws.com/`, input.endpoint);
    const body = buildAwsStsProxyBody(input);
    const headers = signAwsStsRequest({
      accessKeyId: requireCredentialField(credential.values.accessKeyId, "accessKeyId"),
      secretAccessKey: requireCredentialField(credential.values.secretAccessKey, "secretAccessKey"),
      sessionToken: optionalString(credential.values.sessionToken),
      region,
      now: new Date(),
      url,
      body,
    });

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: context.signal,
    });
    if (!response.ok) {
      throw normalizeAwsStsError(response, await readProviderProxyErrorMessage(response, ""), "proxy");
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "AWS STS request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    const accessKeyId = requireCredentialField(input.values.accessKeyId, "accessKeyId");
    requireCredentialField(input.values.secretAccessKey, "secretAccessKey");
    const sessionToken = optionalString(input.values.sessionToken);
    const defaultRoleArn = optionalString(input.values.defaultRoleArn);

    return {
      profile: {
        accountId: accessKeyId,
        displayName: defaultRoleArn ? `AWS STS - ${defaultRoleArn}` : `AWS STS - ${accessKeyId}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        credentialKind: sessionToken ? "sts" : "access_key",
        defaultRoleArn,
      }),
    };
  },
};

function buildAwsStsProxyBody(input: { body?: unknown; query?: unknown }): string {
  const params = new URLSearchParams({
    Action: "AssumeRole",
    Version: stsApiVersion,
  });
  for (const [key, value] of Object.entries({
    ...readAwsStsProxyParams(input.query),
    ...readAwsStsProxyParams(input.body),
  })) {
    params.set(key, value);
  }
  return params.toString();
}

function readAwsStsProxyParams(input: unknown): Record<string, string> {
  if (typeof input === "string") {
    return Object.fromEntries(new URLSearchParams(input).entries());
  }

  const record = optionalRecord(input);
  if (!record) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const resolved = optionalScalarString(value);
    if (resolved !== undefined) {
      output[key] = resolved;
    }
  }
  return output;
}

async function executeAssumeRole(input: Record<string, unknown>, context: AwsStsContext): Promise<AwsStsCredential> {
  const roleArn = optionalString(input.roleArn) ?? optionalString(context.values.defaultRoleArn);
  if (!roleArn) {
    throw new ProviderRequestError(400, "roleArn is required when the connection has no defaultRoleArn");
  }

  return assumeAwsRole(
    {
      accessKeyId: requireCredentialField(context.values.accessKeyId, "accessKeyId"),
      secretAccessKey: requireCredentialField(context.values.secretAccessKey, "secretAccessKey"),
      sessionToken: optionalString(context.values.sessionToken),
      roleArn,
      roleSessionName: optionalString(input.roleSessionName),
      durationSeconds: optionalInteger(input.durationSeconds),
      policy: optionalString(input.policy),
      policyArns: readPolicyArns(input.policyArns),
      externalId: optionalString(input.externalId),
      serialNumber: optionalString(input.serialNumber),
      tokenCode: optionalString(input.tokenCode),
      sourceIdentity: optionalString(input.sourceIdentity),
      tags: readTags(input.tags),
      transitiveTagKeys: readStringArray(input.transitiveTagKeys),
    },
    {
      fetcher: context.fetcher,
      signal: context.signal,
    },
  );
}

async function assumeAwsRole(
  input: AssumeAwsRoleInput,
  deps: {
    fetcher: typeof fetch;
    signal?: AbortSignal;
    now?: () => Date;
  },
): Promise<AwsStsCredential> {
  const now = deps.now ?? (() => new Date());
  const region = normalizeRegion(input.region);
  const body = buildAssumeRoleBody(input);
  const url = new URL(`https://sts.${region}.amazonaws.com/`);
  const headers = signAwsStsRequest({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    sessionToken: input.sessionToken,
    region,
    now: now(),
    url,
    body,
  });

  let response: Response;
  let text: string;
  try {
    response = await deps.fetcher(url, {
      method: "POST",
      headers,
      body,
      signal: deps.signal,
    });
    text = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `aws_sts request failed: ${error.message}` : "aws_sts request failed",
    );
  }

  if (!response.ok) {
    throw normalizeAwsStsError(response, text, "AssumeRole");
  }

  return normalizeStsCredential(text, "AssumeRoleResult");
}

function buildAssumeRoleBody(input: AssumeAwsRoleInput): string {
  const params = new URLSearchParams({
    Action: "AssumeRole",
    Version: stsApiVersion,
    RoleArn: input.roleArn,
    RoleSessionName: input.roleSessionName?.trim() || defaultRoleSessionName,
  });

  if (input.durationSeconds != null) {
    params.set("DurationSeconds", String(input.durationSeconds));
  }
  setOptionalParam(params, "Policy", input.policy);
  setOptionalParam(params, "ExternalId", input.externalId);
  setOptionalParam(params, "SerialNumber", input.serialNumber);
  setOptionalParam(params, "TokenCode", input.tokenCode);
  setOptionalParam(params, "SourceIdentity", input.sourceIdentity);

  input.policyArns?.forEach((policyArn, index) => {
    setOptionalParam(params, `PolicyArns.member.${index + 1}.arn`, policyArn.arn);
  });
  input.tags?.forEach((tag, index) => {
    setOptionalParam(params, `Tags.member.${index + 1}.Key`, tag.key);
    params.set(`Tags.member.${index + 1}.Value`, tag.value ?? "");
  });
  input.transitiveTagKeys?.forEach((key, index) => {
    setOptionalParam(params, `TransitiveTagKeys.member.${index + 1}`, key);
  });

  return params.toString();
}

function normalizeRegion(value: string | undefined): string {
  const region = value?.trim() || defaultRegion;
  if (!isValidAwsRegion(region)) {
    throw new ProviderRequestError(400, "region must be a valid AWS region identifier");
  }
  return region;
}

function isValidAwsRegion(value: string): boolean {
  if (value.length < 3 || value.length > 32) {
    return false;
  }

  for (const char of value) {
    const isLowercaseLetter = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLowercaseLetter && !isDigit && char !== "-") {
      return false;
    }
  }

  return !value.startsWith("-") && !value.endsWith("-") && value.includes("-");
}

function setOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}

function signAwsStsRequest(input: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  now: Date;
  url: URL;
  body: string;
}): Headers {
  const amzDate = formatAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/${awsServiceName}/aws4_request`;
  const headers = new Headers({
    accept: "application/xml",
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host: input.url.host,
    "user-agent": providerUserAgent,
    "x-amz-date": amzDate,
  });
  if (input.sessionToken?.trim()) {
    headers.set("x-amz-security-token", input.sessionToken.trim());
  }

  const canonicalHeaders = buildCanonicalHeaders(headers);
  const signedHeaders = Object.keys(canonicalHeaders).join(";");
  const canonicalRequest = [
    "POST",
    input.url.pathname,
    "",
    formatCanonicalHeaders(canonicalHeaders),
    signedHeaders,
    sha256Hex(input.body),
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  headers.set(
    "authorization",
    [
      `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${hmacHex(getSigningKey(input.secretAccessKey, dateStamp, input.region, awsServiceName), stringToSign)}`,
    ].join(", "),
  );
  return headers;
}

function buildCanonicalHeaders(headers: Headers): Record<string, string> {
  const entries = Array.from(headers.entries()).map(([key, value]) => ({
    key: key.toLowerCase(),
    value: collapseHeaderWhitespace(value),
  }));
  entries.sort((left, right) => left.key.localeCompare(right.key));
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}

function formatCanonicalHeaders(headers: Record<string, string>): string {
  return `${Object.entries(headers)
    .map(([key, value]) => `${key}:${value}`)
    .join("\n")}\n`;
}

function collapseHeaderWhitespace(value: string): string {
  return value.trim().split(" ").filter(Boolean).join(" ");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, serviceName: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, serviceName);
  return hmac(dateRegionServiceKey, "aws4_request");
}

function formatAmzDate(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(
    14,
    16,
  )}${iso.slice(17, 19)}Z`;
}

function normalizeAwsStsError(response: Response, text: string, operation: string): ProviderRequestError {
  const parsed = parseStsErrorXml(text);
  const code = parsed.code ?? "unknown";
  const message = parsed.message ?? response.statusText;
  if (isAwsThrottlingCode(code)) {
    return new ProviderRequestError(429, `aws_sts ${operation} failed: ${code}: ${message}`);
  }

  return new ProviderRequestError(
    response.status === 400 || response.status === 401 || response.status === 403 ? 400 : response.status || 500,
    `aws_sts ${operation} failed: ${code}: ${message}`,
  );
}

function isAwsThrottlingCode(code: string): boolean {
  return code === "Throttling" || code === "ThrottlingException" || code === "TooManyRequestsException";
}

function normalizeStsCredential(text: string, resultElementName: string): AwsStsCredential {
  const root = parseXmlDocument(text);
  const result = getFirstDescendant(root, resultElementName);
  const credentials = getFirstDescendant(result, "Credentials");
  const assumedRoleUser = getFirstDescendant(result, "AssumedRoleUser");

  return {
    accessKeyId: requireStsField(readElementText(credentials, "AccessKeyId"), "Credentials.AccessKeyId"),
    secretAccessKey: requireStsField(readElementText(credentials, "SecretAccessKey"), "Credentials.SecretAccessKey"),
    sessionToken: requireStsField(readElementText(credentials, "SessionToken"), "Credentials.SessionToken"),
    expiration: requireStsField(readElementText(credentials, "Expiration"), "Credentials.Expiration"),
    requestId: readElementText(getFirstDescendant(root, "ResponseMetadata"), "RequestId"),
    assumedRoleUser: assumedRoleUser
      ? {
          arn: readElementText(assumedRoleUser, "Arn"),
          assumedRoleId: readElementText(assumedRoleUser, "AssumedRoleId"),
        }
      : null,
    packedPolicySize: readOptionalInteger(result, "PackedPolicySize"),
    sourceIdentity: readElementText(result, "SourceIdentity"),
  };
}

function requireStsField(value: string | null, field: string): string {
  if (!value) {
    throw new ProviderRequestError(502, `aws_sts response missing ${field}`);
  }
  return value;
}

function readOptionalInteger(parent: StsXmlNode | null | undefined, localName: string): number | null {
  const value = readElementText(parent, localName);
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseStsErrorXml(xml: string): { code: string | null; message: string | null } {
  if (!xml.trim().startsWith("<")) {
    return {
      code: null,
      message: xml.trim() || null,
    };
  }

  try {
    const root = parseXmlDocument(xml);
    const error = getFirstDescendant(root, "Error") ?? root;
    return {
      code: readElementText(error, "Code"),
      message: readElementText(error, "Message"),
    };
  } catch {
    return {
      code: null,
      message: xml.trim() || null,
    };
  }
}

function parseXmlDocument(xml: string): StsXmlNode {
  const stack: StsXmlNode[] = [];
  let root: StsXmlNode | null = null;
  let cursor = 0;

  while (cursor < xml.length) {
    const tagStart = xml.indexOf("<", cursor);
    if (tagStart === -1) {
      appendXmlText(stack, xml.slice(cursor));
      break;
    }
    appendXmlText(stack, xml.slice(cursor, tagStart));
    const tagEnd = xml.indexOf(">", tagStart + 1);
    if (tagEnd === -1) {
      throw new ProviderRequestError(502, "failed to parse aws sts xml response");
    }
    const rawTag = xml.slice(tagStart + 1, tagEnd).trim();
    cursor = tagEnd + 1;

    if (!rawTag || rawTag.startsWith("?") || rawTag.startsWith("!")) {
      continue;
    }
    if (rawTag.startsWith("/")) {
      const closingName = normalizeXmlTagName(rawTag.slice(1));
      const current = stack.pop();
      if (!current || current.name !== closingName) {
        throw new ProviderRequestError(502, "failed to parse aws sts xml response");
      }
      if (stack.length === 0) {
        root = current;
      } else {
        stack[stack.length - 1]!.children.push(current);
      }
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const tagContent = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spaceIndex = tagContent.indexOf(" ");
    const tagName = normalizeXmlTagName(spaceIndex === -1 ? tagContent : tagContent.slice(0, spaceIndex));
    const node: StsXmlNode = {
      name: tagName,
      children: [],
      text: "",
    };

    if (selfClosing) {
      if (stack.length === 0) {
        root = node;
      } else {
        stack[stack.length - 1]!.children.push(node);
      }
      continue;
    }

    stack.push(node);
  }

  if (!root && stack.length === 1) {
    root = stack.pop() ?? null;
  }
  if (!root) {
    throw new ProviderRequestError(502, "failed to parse aws sts xml response");
  }
  return root;
}

function appendXmlText(stack: StsXmlNode[], value: string): void {
  const current = stack[stack.length - 1];
  if (current) {
    current.text += decodeXmlEntities(value);
  }
}

function normalizeXmlTagName(value: string): string {
  const trimmed = value.trim();
  const colonIndex = trimmed.indexOf(":");
  return colonIndex === -1 ? trimmed : trimmed.slice(colonIndex + 1);
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function getFirstDescendant(parent: StsXmlNode | null | undefined, localName: string): StsXmlNode | null {
  if (!parent) {
    return null;
  }
  const directChild = parent.children.find((child) => child.name === localName);
  if (directChild) {
    return directChild;
  }
  for (const child of parent.children) {
    const descendant = getFirstDescendant(child, localName);
    if (descendant) {
      return descendant;
    }
  }
  return null;
}

function readElementText(parent: StsXmlNode | null | undefined, localName: string): string | null {
  const child = parent?.children.find((item) => item.name === localName);
  return child?.text.trim() || null;
}

function requireCredentialField(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readPolicyArns(value: unknown): Array<{ arn?: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => ({
    arn: optionalString(optionalRecord(item)?.arn),
  }));
}

function readTags(value: unknown): Array<{ key?: string; value?: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = optionalRecord(item) ?? {};
    return {
      key: optionalString(record.key),
      value: typeof record.value === "string" ? record.value : undefined,
    };
  });
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.map((item) => optionalString(item)).filter((item): item is string => !!item);
  return result.length > 0 ? result : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
