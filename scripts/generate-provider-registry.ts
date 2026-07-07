import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");
const providerSources = await loadProviderSources();
const services = providerSources.map((source) => source.service);
const executableActionIds = new Map<string, string[]>(
  providerSources.map((source) => [
    source.service,
    source.definition.actions.map((action) => action.id).sort((a, b) => a.localeCompare(b)),
  ]),
);

type GeneratedProxyAuth =
  | { type: "none" }
  | { type: "oauth_bearer" }
  | { type: "api_key_header"; name: string }
  | { type: "api_key_query"; name: string }
  | { type: "api_key_basic"; suffix?: string }
  | { type: "api_key_authorization"; prefix: string; suffix?: string };

interface GeneratedProxyDefinition {
  service: string;
  baseUrl: GeneratedProxyBaseUrl;
  auth: GeneratedProxyAuth;
  allowedPathPrefixes?: string[];
}

type GeneratedProxyBaseUrl = string | { fields: string[] };

const manualProxyDefinitions = new Map<string, Omit<GeneratedProxyDefinition, "service">>([
  ["adyen", { baseUrl: "https://management-test.adyen.com/v3", auth: { type: "api_key_header", name: "x-api-key" } }],
  ["agenty", { baseUrl: "https://api.agenty.com/v2", auth: { type: "api_key_header", name: "x-agenty-apikey" } }],
  [
    "alchemy",
    {
      baseUrl: "https://eth-mainnet.g.alchemy.com",
      auth: { type: "api_key_authorization", prefix: "Bearer " },
      allowedPathPrefixes: ["/v2", "/nft/v3"],
    },
  ],
  ["bannerbear", { baseUrl: "https://api.bannerbear.com", auth: { type: "api_key_authorization", prefix: "Bearer " } }],
  ["bigpicture_io", { baseUrl: "https://company.bigpicture.io", auth: { type: "api_key_authorization", prefix: "" } }],
  ["builder_io", { baseUrl: "https://builder.io", auth: { type: "api_key_authorization", prefix: "Bearer " } }],
  ["check", { baseUrl: "https://sandbox.checkhq.com", auth: { type: "api_key_authorization", prefix: "Bearer " } }],
  [
    "cloudconvert",
    { baseUrl: "https://api.cloudconvert.com/v2", auth: { type: "api_key_authorization", prefix: "Bearer " } },
  ],
  ["codemagic", { baseUrl: "https://codemagic.io", auth: { type: "api_key_header", name: "x-auth-token" } }],
  [
    "collegiate",
    {
      baseUrl: "https://www.dictionaryapi.com/api/v3/references/collegiate/json",
      auth: { type: "api_key_query", name: "key" },
    },
  ],
  [
    "contentful_graphql",
    { baseUrl: "https://graphql.contentful.com", auth: { type: "api_key_authorization", prefix: "Bearer " } },
  ],
  ["deepl", { baseUrl: "https://api.deepl.com", auth: { type: "api_key_authorization", prefix: "DeepL-Auth-Key " } }],
  ["deepseek", { baseUrl: "https://api.deepseek.com", auth: { type: "api_key_authorization", prefix: "Bearer " } }],
  ["docuseal", { baseUrl: "https://api.docuseal.com", auth: { type: "api_key_header", name: "x-auth-token" } }],
  [
    "enigma",
    {
      baseUrl: "https://api.enigma.com",
      auth: { type: "api_key_header", name: "x-api-key" },
      allowedPathPrefixes: ["/graphql", "/v2/kyb"],
    },
  ],
  ["fal_ai", { baseUrl: "https://api.fal.ai", auth: { type: "api_key_authorization", prefix: "Key " } }],
  ["google_analytics", { baseUrl: "https://analyticsdata.googleapis.com/v1beta", auth: { type: "oauth_bearer" } }],
  ["google_search_console", { baseUrl: "https://www.googleapis.com/webmasters/v3", auth: { type: "oauth_bearer" } }],
  ["googledocs", { baseUrl: "https://www.googleapis.com/drive/v3", auth: { type: "oauth_bearer" } }],
  [
    "googledrive",
    {
      baseUrl: "https://www.googleapis.com",
      auth: { type: "oauth_bearer" },
      allowedPathPrefixes: ["/drive/v3", "/upload/drive/v3"],
    },
  ],
  ["googlephotos", { baseUrl: "https://photoslibrary.googleapis.com/v1", auth: { type: "oauth_bearer" } }],
  ["googlesheets", { baseUrl: "https://sheets.googleapis.com/v4", auth: { type: "oauth_bearer" } }],
  ["googleslides", { baseUrl: "https://slides.googleapis.com/v1", auth: { type: "oauth_bearer" } }],
  ["hackernews", { baseUrl: "https://hacker-news.firebaseio.com/v0", auth: { type: "none" } }],
  ["here", { baseUrl: "https://geocode.search.hereapi.com/v1", auth: { type: "api_key_query", name: "apiKey" } }],
  ["heygen", { baseUrl: "https://api.heygen.com", auth: { type: "api_key_header", name: "x-api-key" } }],
  ["huggingface", { baseUrl: "https://datasets-server.huggingface.co", auth: { type: "oauth_bearer" } }],
  ["ip2location", { baseUrl: "https://api.ip2location.io", auth: { type: "api_key_query", name: "key" } }],
  ["ip2whois", { baseUrl: "https://api.ip2whois.com", auth: { type: "api_key_query", name: "key" } }],
  ["ipdata_co", { baseUrl: "https://api.ipdata.co", auth: { type: "api_key_query", name: "api-key" } }],
  [
    "jiminny",
    { baseUrl: "https://app.jiminny.com/customer/api/v1", auth: { type: "api_key_authorization", prefix: "Bearer " } },
  ],
  ["kickbox", { baseUrl: "https://api.kickbox.com", auth: { type: "api_key_query", name: "apikey" } }],
  ["logo_dev", { baseUrl: "https://api.logo.dev", auth: { type: "api_key_authorization", prefix: "Bearer " } }],
  ["mx_toolbox", { baseUrl: "https://mxtoolbox.com", auth: { type: "api_key_authorization", prefix: "" } }],
  ["needle", { baseUrl: "https://needle.app", auth: { type: "api_key_header", name: "x-api-key" } }],
  ["ocrspace", { baseUrl: "https://api.ocr.space", auth: { type: "api_key_query", name: "apikey" } }],
  [
    "openfootball_worldcup",
    { baseUrl: "https://raw.githubusercontent.com/openfootball/worldcup.json/master", auth: { type: "none" } },
  ],
  ["openweather_api", { baseUrl: "https://api.openweathermap.org", auth: { type: "api_key_query", name: "appid" } }],
  ["precoro", { baseUrl: "https://api.precoro.com", auth: { type: "api_key_header", name: "x-auth-token" } }],
  ["renderform", { baseUrl: "https://get.renderform.io", auth: { type: "api_key_header", name: "x-api-key" } }],
  ["roboflow", { baseUrl: "https://api.roboflow.com", auth: { type: "api_key_query", name: "api_key" } }],
  [
    "semantic_scholar",
    {
      baseUrl: "https://api.semanticscholar.org",
      auth: { type: "api_key_header", name: "x-api-key" },
      allowedPathPrefixes: ["/graph/v1", "/recommendations/v1"],
    },
  ],
  ["short_io", { baseUrl: "https://api.short.io", auth: { type: "api_key_authorization", prefix: "" } }],
  ["shortpixel", { baseUrl: "https://api.shortpixel.com/v2", auth: { type: "api_key_query", name: "key" } }],
  [
    "teamtailor",
    { baseUrl: "https://api.teamtailor.com", auth: { type: "api_key_authorization", prefix: "Token token=" } },
  ],
  ["ticketmaster", { baseUrl: "https://app.ticketmaster.com", auth: { type: "api_key_header", name: "apikey" } }],
  [
    "v2ex",
    {
      baseUrl: "https://www.v2ex.com",
      auth: { type: "api_key_authorization", prefix: "Bearer " },
      allowedPathPrefixes: ["/api"],
    },
  ],
  [
    "voiceflow",
    { baseUrl: "https://general-runtime.voiceflow.com", auth: { type: "api_key_authorization", prefix: "" } },
  ],
  [
    "youtube",
    {
      baseUrl: "https://www.googleapis.com",
      auth: { type: "oauth_bearer" },
      allowedPathPrefixes: ["/youtube/v3", "/upload/youtube/v3"],
    },
  ],
  [
    "zenrows",
    {
      baseUrl: "https://api.zenrows.com",
      auth: { type: "api_key_header", name: "x-api-key" },
      allowedPathPrefixes: ["/v1"],
    },
  ],
  ["zenserp", { baseUrl: "https://app.zenserp.com", auth: { type: "api_key_header", name: "apikey" } }],
]);

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

const registryLines = [
  'import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../core/types.ts";',
  "",
  "/** Lazy-loaded provider executor module shape. */",
  "export type ExecutorModule = {",
  "  credentialValidators?: CredentialValidators;",
  "  executors: ProviderExecutors;",
  "  proxy?: ProviderProxyExecutor;",
  "};",
  "",
  "/** Generated lazy imports for provider executors. Do not hand-edit. */",
  "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
  ...services.map(
    (service) => `  ${propertyName(service)}: (): Promise<ExecutorModule> => import("./${service}/executors.ts"),`,
  ),
  "};",
  "",
  "/** Generated local executable action ids by provider. Do not hand-edit. */",
  "export const executableActionIds: Record<string, string[]> = {",
  ...services.flatMap((service) => [
    `  ${propertyName(service)}: [`,
    ...(executableActionIds.get(service) ?? []).map((actionId) => `    ${JSON.stringify(actionId)},`),
    "  ],",
  ]),
  "};",
];

const registryPath = join(providersDir, "registry.generated.ts");
const registryContent = `${registryLines.join("\n")}\n`;
const existingContent = await readTextFile(registryPath);
if (existingContent !== registryContent) {
  await writeFile(registryPath, registryContent);
  console.log(`Generated provider registry for ${services.length} providers.`);
} else {
  console.log(`Provider registry is up to date for ${services.length} providers.`);
}

const proxyDefinitions = await loadGeneratedProxyDefinitions();
const proxyLines = [
  'import type { ProviderProxyExecutor } from "../core/types.ts";',
  "",
  'import { credentialProviderProxyBaseUrl, defineProviderProxy } from "./provider-runtime.ts";',
  "",
  "/** Generated provider proxy executors for statically detectable provider HTTP APIs. Do not hand-edit. */",
  "// oxfmt-ignore",
  "export const generatedProxyExecutors: Record<string, ProviderProxyExecutor> = {",
  ...proxyDefinitions.map((definition) => renderGeneratedProxyDefinition(definition)),
  "};",
];
const proxyPath = join(providersDir, "proxy.generated.ts");
const proxyContent = `${proxyLines.join("\n")}\n`;
const existingProxyContent = await readTextFile(proxyPath);
if (existingProxyContent !== proxyContent) {
  await writeFile(proxyPath, proxyContent);
  console.log(`Generated provider proxies for ${proxyDefinitions.length} providers.`);
} else {
  console.log(`Provider proxies are up to date for ${proxyDefinitions.length} providers.`);
}

async function loadGeneratedProxyDefinitions(): Promise<GeneratedProxyDefinition[]> {
  const definitions: GeneratedProxyDefinition[] = [];
  for (const source of providerSources) {
    const manual = manualProxyDefinitions.get(source.service);
    if (manual) {
      definitions.push({
        service: source.service,
        ...manual,
      });
      continue;
    }

    const runtimeSource = await readProviderRuntimeSource(source.service);
    if (/\bexport const proxy\b/u.test(runtimeSource)) {
      continue;
    }

    const baseUrl = readProxyBaseUrl(runtimeSource);
    const auth = readProxyAuth(runtimeSource, source.definition.authTypes);
    if (baseUrl && auth) {
      definitions.push({
        service: source.service,
        baseUrl,
        auth,
      });
    }
  }
  return definitions;
}

async function readProviderRuntimeSource(service: string): Promise<string> {
  const serviceDir = join(providersDir, service);
  const entries = await readdir(serviceDir, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        entry.name !== "definition.ts" &&
        entry.name !== "actions.ts",
    )
    .map((entry) => join(serviceDir, entry.name));
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  return contents.join("\n");
}

function readProxyBaseUrl(source: string): GeneratedProxyBaseUrl | undefined {
  return readStaticProxyBaseUrl(source) ?? readDynamicProxyBaseUrl(source);
}

function readStaticProxyBaseUrl(source: string): string | undefined {
  const matches = [
    ...source.matchAll(
      /(?:export\s+)?const\s+([A-Za-z0-9_]*(?:ApiBaseUrl|BaseUrl|ApiUrl))\s*=\s*"(https:\/\/[^"]+)"/gu,
    ),
  ]
    .map((match) => ({
      name: match[1]!,
      url: match[2]!,
    }))
    .filter((match) => isLikelyProviderApiBaseUrl(match.name, match.url));
  if (matches.length === 0) {
    return undefined;
  }

  const urls = new Set(matches.map((match) => normalizeGeneratedProxyBaseUrl(match.url)));
  if (urls.size > 1) {
    return undefined;
  }

  return (
    matches.find((match) => match.name.endsWith("ApiBaseUrl")) ??
    matches.find((match) => match.name.endsWith("BaseUrl")) ??
    matches[0]
  )?.url;
}

function normalizeGeneratedProxyBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function readDynamicProxyBaseUrl(source: string): GeneratedProxyBaseUrl | undefined {
  const fields = ["apiBaseUrl", "baseUrl", "restEndpoint", "apiUrl", "serverUrl", "zoneUrl", "endpoint"].filter(
    (field) =>
      new RegExp(`(?:metadata|values)\\.${field}\\b|(?:metadata|values)\\[["']${field}["']\\]`, "u").test(source),
  );
  return fields.length > 0 ? { fields } : undefined;
}

function isLikelyProviderApiBaseUrl(name: string, url: string): boolean {
  return (
    !/help|doc|auth|token|oauth|webhook|callback|credential|homepage|login|authorization/iu.test(name) &&
    !/\/docs?\//iu.test(url)
  );
}

function readProxyAuth(source: string, authTypes: string[]): GeneratedProxyAuth | undefined {
  if (authTypes.length === 1 && authTypes[0] === "no_auth") {
    return { type: "none" };
  }
  if (authTypes.includes("oauth2") && usesOAuthBearerAuth(source)) {
    return { type: "oauth_bearer" };
  }
  if (!authTypes.includes("api_key")) {
    return undefined;
  }

  const authorization = readApiKeyAuthorizationAuth(source);
  if (authorization) {
    return authorization;
  }

  const header = readApiKeyHeaderAuth(source);
  if (header) {
    return header;
  }

  return readApiKeyQueryAuth(source);
}

function usesOAuthBearerAuth(source: string): boolean {
  return (
    /authorization\s*:\s*`(?:Bearer|\$\{[^}]*tokenType[^}]*\})\s+\$\{[^}]*accessToken[^}]*\}`/u.test(source) ||
    /\bgoogle(?:Json)?Request\b/u.test(source)
  );
}

function readApiKeyAuthorizationAuth(source: string): GeneratedProxyAuth | undefined {
  for (const _match of source.matchAll(/authorization\s*:\s*`Basic \$\{Buffer\.from\(\s*apiKey\s*\)[^}]*\}`/giu)) {
    return { type: "api_key_basic" };
  }

  for (const match of source.matchAll(
    /authorization\s*:\s*`Basic \$\{Buffer\.from\(`\$\{\s*(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey\s*\}([^`]*)`\)[^}]*\}`/giu,
  )) {
    const suffix = match[1] || undefined;
    if (suffix?.includes("${")) {
      continue;
    }
    return {
      type: "api_key_basic",
      suffix,
    };
  }

  for (const match of source.matchAll(
    /authorization\s*:\s*`([^`$]*)\$\{\s*(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey\s*\}([^`]*)`/giu,
  )) {
    const prefix = match[1]!;
    const suffix = match[2]!;
    if (
      /^(Bearer |Token |Token token=|Api-Token |Key |Omnisend-API-Key |DeepL-Auth-Key )$/u.test(prefix) &&
      suffix === ""
    ) {
      return { type: "api_key_authorization", prefix };
    }
  }
  return undefined;
}

function readApiKeyHeaderAuth(source: string): GeneratedProxyAuth | undefined {
  for (const match of source.matchAll(/headers\s*:\s*\{([\s\S]*?)\}/gu)) {
    const header = readApiKeyHeaderProperty(match[1]!);
    if (header) {
      return header;
    }
  }

  for (const match of source.matchAll(
    /headers\.set\(\s*["']([^"']+)["']\s*,\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\s*\)/gu,
  )) {
    const name = match[1]!.toLowerCase();
    return name === "authorization" ? { type: "api_key_authorization", prefix: "" } : { type: "api_key_header", name };
  }

  if (
    /\bauthorization\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/iu.test(
      source,
    )
  ) {
    return { type: "api_key_authorization", prefix: "" };
  }

  if (
    /\bAccessKey\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/u.test(source)
  ) {
    return { type: "api_key_header", name: "accesskey" };
  }

  for (const match of source.matchAll(
    /["']([A-Za-z0-9_-]*(?:api|token|subscription)[A-Za-z0-9_-]*)["']\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/giu,
  )) {
    const name = match[1]!.toLowerCase();
    if (name === "authorization") {
      return { type: "api_key_authorization", prefix: "" };
    }
    if (!isLikelyApiKeyQueryName(name)) {
      return { type: "api_key_header", name };
    }
  }

  for (const match of source.matchAll(
    /\b([A-Za-z0-9_-]*(?:api|token|subscription)[A-Za-z0-9_-]*)\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/giu,
  )) {
    const name = match[1]!.toLowerCase();
    if (name === "authorization") {
      return { type: "api_key_authorization", prefix: "" };
    }
    if (!isLikelyApiKeyQueryName(name)) {
      return { type: "api_key_header", name };
    }
  }

  return undefined;
}

function readApiKeyHeaderProperty(source: string): GeneratedProxyAuth | undefined {
  for (const match of source.matchAll(
    /["']([^"']+)["']\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/gu,
  )) {
    const name = match[1]!.toLowerCase();
    return name === "authorization" ? { type: "api_key_authorization", prefix: "" } : { type: "api_key_header", name };
  }

  for (const match of source.matchAll(
    /\b([A-Za-z0-9_-]+)\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/gu,
  )) {
    const name = match[1]!.toLowerCase();
    return name === "authorization" ? { type: "api_key_authorization", prefix: "" } : { type: "api_key_header", name };
  }

  return undefined;
}

function readApiKeyQueryAuth(source: string): GeneratedProxyAuth | undefined {
  for (const match of source.matchAll(
    /searchParams\.(?:set|append)\(\s*["']([^"']+)["']\s*,\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\s*\)/gu,
  )) {
    return { type: "api_key_query", name: match[1]! };
  }

  for (const match of source.matchAll(
    /\b(api_key|apikey|access_key|api_token)\s*:\s*(?:(?:input\.)?(?:context\.)?(?:input\.context\.)?(?:options\.)?apiKey|apiKey)\b/gu,
  )) {
    return { type: "api_key_query", name: match[1]! };
  }

  return undefined;
}

function isLikelyApiKeyQueryName(name: string): boolean {
  return ["api_key", "apikey", "access_key", "key", "token"].includes(name.toLowerCase());
}

function renderGeneratedProxyDefinition(definition: GeneratedProxyDefinition): string {
  return `  ${propertyName(definition.service)}: defineProviderProxy({ service: ${JSON.stringify(definition.service)}, baseUrl: ${renderProxyBaseUrl(definition.baseUrl)}, auth: ${renderProxyAuth(definition.auth)}${renderAllowedEndpoint(definition)} }),`;
}

function renderProxyBaseUrl(baseUrl: GeneratedProxyBaseUrl): string {
  if (typeof baseUrl === "string") {
    return JSON.stringify(baseUrl);
  }
  return `credentialProviderProxyBaseUrl(${baseUrl.fields.map((field) => JSON.stringify(field)).join(", ")})`;
}

function renderProxyAuth(auth: GeneratedProxyAuth): string {
  switch (auth.type) {
    case "none":
      return '{ type: "none" }';
    case "oauth_bearer":
      return '{ type: "oauth_bearer" }';
    case "api_key_header":
      return `{ type: "api_key_header", name: ${JSON.stringify(auth.name)} }`;
    case "api_key_query":
      return `{ type: "api_key_query", name: ${JSON.stringify(auth.name)} }`;
    case "api_key_basic":
      return `{ type: "api_key_basic"${auth.suffix ? `, suffix: ${JSON.stringify(auth.suffix)}` : ""} }`;
    case "api_key_authorization":
      return `{ type: "api_key_authorization", prefix: ${JSON.stringify(auth.prefix)}${auth.suffix ? `, suffix: ${JSON.stringify(auth.suffix)}` : ""} }`;
  }
}

function renderAllowedEndpoint(definition: GeneratedProxyDefinition): string {
  if (!definition.allowedPathPrefixes?.length) {
    return "";
  }

  const checks = definition.allowedPathPrefixes.flatMap((prefix) => [
    `endpoint === ${JSON.stringify(prefix)}`,
    `endpoint.startsWith(${JSON.stringify(prefix.endsWith("/") ? prefix : `${prefix}/`)})`,
  ]);
  return `, allowedEndpoint: (endpoint) => ${checks.join(" || ")}`;
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
