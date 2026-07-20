import type { ExecutionContext, ProviderProxyExecutor } from "../core/types.ts";

import { optionalString } from "../core/cast.ts";
import {
  credentialProviderProxyBaseUrl,
  defineProviderProxy,
  ProviderRequestError,
  requireBearerCredential,
} from "./provider-runtime.ts";

const foremDefaultBaseUrl = "https://dev.to";

function allowedPathPrefixes(...prefixes: string[]): (endpoint: string) => boolean {
  return (endpoint) =>
    prefixes.some((prefix) => endpoint === prefix || endpoint.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

async function foremProxyBaseUrl(context: ExecutionContext, service: string): Promise<string> {
  const credential = await context.getCredential(service);
  if (!credential || credential.authType === "no_auth") {
    throw new ProviderRequestError(401, `Configure ${service} credentials first.`);
  }

  const apiBaseUrl = optionalString(credential.metadata.apiBaseUrl);
  if (apiBaseUrl) {
    return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  }

  const metadataBaseUrl = optionalString(credential.metadata.baseUrl);
  const valuesBaseUrl = "values" in credential ? optionalString(credential.values.baseUrl) : undefined;
  const baseUrl = metadataBaseUrl ?? valuesBaseUrl ?? foremDefaultBaseUrl;
  return `${baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl}/api`;
}

/** Explicit provider proxy executors. Add entries only after checking provider auth and base URL behavior. */
export const registeredProxyExecutors: Record<string, ProviderProxyExecutor> = {
  agenty: defineProviderProxy({
    service: "agenty",
    baseUrl: "https://api.agenty.com/v2",
    auth: { type: "api_key_header", name: "x-agenty-apikey" },
  }),
  alchemy: defineProviderProxy({
    service: "alchemy",
    baseUrl: "https://eth-mainnet.g.alchemy.com",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
    allowedEndpoint: allowedPathPrefixes("/v2", "/nft/v3"),
  }),
  bannerbear: defineProviderProxy({
    service: "bannerbear",
    baseUrl: "https://api.bannerbear.com",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
  }),
  bigpicture_io: defineProviderProxy({
    service: "bigpicture_io",
    baseUrl: "https://company.bigpicture.io",
    auth: { type: "api_key_authorization", prefix: "" },
  }),
  cloudconvert: defineProviderProxy({
    service: "cloudconvert",
    baseUrl: "https://api.cloudconvert.com/v2",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
  }),
  codemagic: defineProviderProxy({
    service: "codemagic",
    baseUrl: "https://codemagic.io",
    auth: { type: "api_key_header", name: "x-auth-token" },
  }),
  collegiate: defineProviderProxy({
    service: "collegiate",
    baseUrl: "https://www.dictionaryapi.com/api/v3/references/collegiate/json",
    auth: { type: "api_key_query", name: "key" },
  }),
  contentful_graphql: defineProviderProxy({
    service: "contentful_graphql",
    baseUrl: "https://graphql.contentful.com",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
  }),
  deepl: defineProviderProxy({
    service: "deepl",
    baseUrl: "https://api.deepl.com",
    auth: { type: "api_key_authorization", prefix: "DeepL-Auth-Key " },
  }),
  deepseek: defineProviderProxy({
    service: "deepseek",
    baseUrl: "https://api.deepseek.com",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
  }),
  docuseal: defineProviderProxy({
    service: "docuseal",
    baseUrl: "https://api.docuseal.com",
    auth: { type: "api_key_header", name: "x-auth-token" },
  }),
  enigma: defineProviderProxy({
    service: "enigma",
    baseUrl: "https://api.enigma.com",
    auth: { type: "api_key_header", name: "x-api-key" },
    allowedEndpoint: allowedPathPrefixes("/graphql", "/v2/kyb"),
  }),
  fal_ai: defineProviderProxy({
    service: "fal_ai",
    baseUrl: "https://api.fal.ai",
    auth: { type: "api_key_authorization", prefix: "Key " },
  }),
  google_analytics: defineProviderProxy({
    service: "google_analytics",
    baseUrl: "https://analyticsdata.googleapis.com/v1beta",
    auth: { type: "oauth_bearer" },
  }),
  google_search_console: defineProviderProxy({
    service: "google_search_console",
    baseUrl: "https://www.googleapis.com/webmasters/v3",
    auth: { type: "oauth_bearer" },
  }),
  googledrive: defineProviderProxy({
    service: "googledrive",
    baseUrl: "https://www.googleapis.com",
    auth: { type: "oauth_bearer" },
    allowedEndpoint: allowedPathPrefixes("/drive/v3", "/upload/drive/v3"),
  }),
  googlephotos: defineProviderProxy({
    service: "googlephotos",
    baseUrl: "https://photoslibrary.googleapis.com/v1",
    auth: { type: "oauth_bearer" },
  }),
  googlesheets: defineProviderProxy({
    service: "googlesheets",
    baseUrl: "https://sheets.googleapis.com/v4",
    auth: { type: "oauth_bearer" },
  }),
  googleslides: defineProviderProxy({
    service: "googleslides",
    baseUrl: "https://slides.googleapis.com/v1",
    auth: { type: "oauth_bearer" },
  }),
  hackernews: defineProviderProxy({
    service: "hackernews",
    baseUrl: "https://hacker-news.firebaseio.com/v0",
    auth: { type: "none" },
  }),
  here: defineProviderProxy({
    service: "here",
    baseUrl: "https://geocode.search.hereapi.com/v1",
    auth: { type: "api_key_query", name: "apiKey" },
  }),
  heygen: defineProviderProxy({
    service: "heygen",
    baseUrl: "https://api.heygen.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  huggingface: defineProviderProxy({
    service: "huggingface",
    baseUrl: "https://datasets-server.huggingface.co",
    auth: { type: "bearer" },
  }),
  ip2location: defineProviderProxy({
    service: "ip2location",
    baseUrl: "https://api.ip2location.io",
    auth: { type: "api_key_query", name: "key" },
  }),
  ip2whois: defineProviderProxy({
    service: "ip2whois",
    baseUrl: "https://api.ip2whois.com",
    auth: { type: "api_key_query", name: "key" },
  }),
  ipdata_co: defineProviderProxy({
    service: "ipdata_co",
    baseUrl: "https://api.ipdata.co",
    auth: { type: "api_key_query", name: "api-key" },
  }),
  jiminny: defineProviderProxy({
    service: "jiminny",
    baseUrl: "https://app.jiminny.com/customer/api/v1",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
  }),
  kickbox: defineProviderProxy({
    service: "kickbox",
    baseUrl: "https://api.kickbox.com",
    auth: { type: "api_key_query", name: "apikey" },
  }),
  logo_dev: defineProviderProxy({
    service: "logo_dev",
    baseUrl: "https://api.logo.dev",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
  }),
  mapbox: defineProviderProxy({
    service: "mapbox",
    baseUrl: "https://api.mapbox.com",
    auth: { type: "api_key_query", name: "access_token" },
  }),
  mx_toolbox: defineProviderProxy({
    service: "mx_toolbox",
    baseUrl: "https://mxtoolbox.com",
    auth: { type: "api_key_authorization", prefix: "" },
  }),
  needle: defineProviderProxy({
    service: "needle",
    baseUrl: "https://needle.app",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  ocrspace: defineProviderProxy({
    service: "ocrspace",
    baseUrl: "https://api.ocr.space",
    auth: { type: "api_key_query", name: "apikey" },
  }),
  openfootball_worldcup: defineProviderProxy({
    service: "openfootball_worldcup",
    baseUrl: "https://raw.githubusercontent.com/openfootball/worldcup.json/master",
    auth: { type: "none" },
  }),
  openweather_api: defineProviderProxy({
    service: "openweather_api",
    baseUrl: "https://api.openweathermap.org",
    auth: { type: "api_key_query", name: "appid" },
  }),
  renderform: defineProviderProxy({
    service: "renderform",
    baseUrl: "https://get.renderform.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  roboflow: defineProviderProxy({
    service: "roboflow",
    baseUrl: "https://api.roboflow.com",
    auth: { type: "api_key_query", name: "api_key" },
  }),
  semantic_scholar: defineProviderProxy({
    service: "semantic_scholar",
    baseUrl: "https://api.semanticscholar.org",
    auth: { type: "api_key_header", name: "x-api-key" },
    allowedEndpoint: allowedPathPrefixes("/graph/v1", "/recommendations/v1", "/datasets/v1"),
  }),
  short_io: defineProviderProxy({
    service: "short_io",
    baseUrl: "https://api.short.io",
    auth: { type: "api_key_authorization", prefix: "" },
  }),
  shortpixel: defineProviderProxy({
    service: "shortpixel",
    baseUrl: "https://api.shortpixel.com/v2",
    auth: { type: "api_key_query", name: "key" },
  }),
  ticketmaster: defineProviderProxy({
    service: "ticketmaster",
    baseUrl: "https://app.ticketmaster.com",
    auth: { type: "api_key_query", name: "apikey" },
  }),
  v2ex: defineProviderProxy({
    service: "v2ex",
    baseUrl: "https://www.v2ex.com",
    auth: { type: "api_key_authorization", prefix: "Bearer " },
    allowedEndpoint: allowedPathPrefixes("/api"),
  }),
  youtube: defineProviderProxy({
    service: "youtube",
    baseUrl: "https://www.googleapis.com",
    auth: { type: "oauth_bearer" },
    allowedEndpoint: allowedPathPrefixes("/youtube/v3", "/upload/youtube/v3"),
  }),
  zenrows: defineProviderProxy({
    service: "zenrows",
    baseUrl: "https://api.zenrows.com",
    auth: { type: "api_key_header", name: "x-api-key" },
    allowedEndpoint: allowedPathPrefixes("/v1"),
  }),
  zenserp: defineProviderProxy({
    service: "zenserp",
    baseUrl: "https://app.zenserp.com",
    auth: { type: "api_key_header", name: "apikey" },
  }),
  abyssale: defineProviderProxy({
    service: "abyssale",
    baseUrl: "https://api.abyssale.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  activecampaign: defineProviderProxy({
    service: "activecampaign",
    baseUrl: credentialProviderProxyBaseUrl("apiUrl"),
    auth: { type: "api_key_header", name: "api-token" },
  }),
  agentql: defineProviderProxy({
    service: "agentql",
    baseUrl: "https://api.agentql.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  aivoov: defineProviderProxy({
    service: "aivoov",
    baseUrl: "https://aivoov.com/api/v8",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  alt_text_ai: defineProviderProxy({
    service: "alt_text_ai",
    baseUrl: "https://alttext.ai/api/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  amara: defineProviderProxy({
    service: "amara",
    baseUrl: "https://amara.org/api",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  anchor_browser: defineProviderProxy({
    service: "anchor_browser",
    baseUrl: "https://api.anchorbrowser.io",
    auth: { type: "api_key_header", name: "anchor-api-key" },
  }),
  autobound: defineProviderProxy({
    service: "autobound",
    baseUrl: "https://signals.autobound.ai",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  beamer: defineProviderProxy({
    service: "beamer",
    baseUrl: "https://api.getbeamer.com/v0",
    auth: { type: "api_key_header", name: "beamer-api-key" },
  }),
  boloforms: defineProviderProxy({
    service: "boloforms",
    baseUrl: "https://sapi.boloforms.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  bouncer: defineProviderProxy({
    service: "bouncer",
    baseUrl: "https://api.usebouncer.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  brevo: defineProviderProxy({
    service: "brevo",
    baseUrl: "https://api.brevo.com",
    auth: { type: "api_key_header", name: "api-key" },
  }),
  browserbase: defineProviderProxy({
    service: "browserbase",
    baseUrl: "https://api.browserbase.com",
    auth: { type: "api_key_header", name: "x-bb-api-key" },
  }),
  campaign_cleaner: defineProviderProxy({
    service: "campaign_cleaner",
    baseUrl: "https://api.campaigncleaner.com",
    auth: { type: "api_key_header", name: "x-cc-api-key" },
  }),
  cardly: defineProviderProxy({
    service: "cardly",
    baseUrl: "https://api.card.ly/v2",
    auth: { type: "api_key_header", name: "api-key" },
  }),
  circleci: defineProviderProxy({
    service: "circleci",
    baseUrl: "https://circleci.com/api/v2",
    auth: { type: "api_key_header", name: "circle-token" },
  }),
  clockify: defineProviderProxy({
    service: "clockify",
    baseUrl: "https://api.clockify.me/api/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  cloudlayer: defineProviderProxy({
    service: "cloudlayer",
    baseUrl: "https://api.cloudlayer.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  codacy: defineProviderProxy({
    service: "codacy",
    baseUrl: "https://app.codacy.com",
    auth: { type: "api_key_header", name: "api-token" },
  }),
  coderabbit: defineProviderProxy({
    service: "coderabbit",
    baseUrl: "https://api.coderabbit.ai",
    auth: { type: "api_key_header", name: "x-coderabbitai-api-key" },
  }),
  coinmarketcal: defineProviderProxy({
    service: "coinmarketcal",
    baseUrl: "https://developers.coinmarketcal.com/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  craftmypdf: defineProviderProxy({
    service: "craftmypdf",
    baseUrl: "https://api.craftmypdf.com/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  databox: defineProviderProxy({
    service: "databox",
    baseUrl: "https://api.databox.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  devto: defineProviderProxy({
    service: "devto",
    baseUrl: "https://dev.to/api",
    auth: { type: "api_key_header", name: "api-key" },
  }),
  e2b: defineProviderProxy({
    service: "e2b",
    baseUrl: "https://api.e2b.app",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  elevenreader: defineProviderProxy({
    service: "elevenreader",
    baseUrl: "https://api.elevenlabs.io/v1",
    auth: { type: "api_key_header", name: "xi-api-key" },
  }),
  encodian: defineProviderProxy({
    service: "encodian",
    baseUrl: "https://api.apps-encodian.com",
    auth: { type: "api_key_header", name: "x-apikey" },
  }),
  espocrm: defineProviderProxy({
    service: "espocrm",
    baseUrl: credentialProviderProxyBaseUrl("baseUrl"),
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  fireberry: defineProviderProxy({
    service: "fireberry",
    baseUrl: "https://api.fireberry.com",
    auth: { type: "api_key_header", name: "tokenid" },
  }),
  fluxguard: defineProviderProxy({
    service: "fluxguard",
    baseUrl: "https://api.fluxguard.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  forem: defineProviderProxy({
    service: "forem",
    baseUrl: foremProxyBaseUrl,
    auth: { type: "api_key_header", name: "api-key" },
  }),
  formbricks: defineProviderProxy({
    service: "formbricks",
    baseUrl: "https://app.formbricks.com/api/v2",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  freepik: defineProviderProxy({
    service: "freepik",
    baseUrl: "https://api.magnific.com",
    auth: { type: "api_key_header", name: "x-magnific-api-key" },
  }),
  gamma: defineProviderProxy({
    service: "gamma",
    baseUrl: "https://public-api.gamma.app",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  gem: defineProviderProxy({
    service: "gem",
    baseUrl: "https://api.gem.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  gemini: defineProviderProxy({
    service: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    auth: { type: "api_key_header", name: "x-goog-api-key" },
  }),
  gigasheet: defineProviderProxy({
    service: "gigasheet",
    baseUrl: "https://api.gigasheet.com",
    auth: { type: "api_key_header", name: "x-gigasheet-token" },
  }),
  healthchecks_io: defineProviderProxy({
    service: "healthchecks_io",
    baseUrl: "https://healthchecks.io/api/v3",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  hunter: defineProviderProxy({
    service: "hunter",
    baseUrl: "https://api.hunter.io/v2",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  jigsawstack: defineProviderProxy({
    service: "jigsawstack",
    baseUrl: "https://api.jigsawstack.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  kit: defineProviderProxy({
    service: "kit",
    baseUrl: "https://api.kit.com/v4",
    auth: { type: "api_key_header", name: "x-kit-api-key" },
  }),
  klangio: defineProviderProxy({
    service: "klangio",
    baseUrl: "https://api.klang.io",
    auth: { type: "api_key_header", name: "kl-api-key" },
  }),
  leadmagic: defineProviderProxy({
    service: "leadmagic",
    baseUrl: "https://api.leadmagic.io/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  listennotes: defineProviderProxy({
    service: "listennotes",
    baseUrl: "https://listen-api.listennotes.com/api/v2",
    auth: { type: "api_key_header", name: "x-listenapi-key" },
  }),
  lokalise: defineProviderProxy({
    service: "lokalise",
    baseUrl: "https://api.lokalise.com/api2",
    auth: { type: "api_key_header", name: "x-api-token" },
  }),
  luma: defineProviderProxy({
    service: "luma",
    baseUrl: "https://public-api.luma.com",
    auth: { type: "api_key_header", name: "x-luma-api-key" },
  }),
  mails_so: defineProviderProxy({
    service: "mails_so",
    baseUrl: "https://api.mails.so",
    auth: { type: "api_key_header", name: "x-mails-api-key" },
  }),
  manus: defineProviderProxy({
    service: "manus",
    baseUrl: "https://api.manus.ai",
    auth: { type: "api_key_header", name: "x-manus-api-key" },
  }),
  memberstack: defineProviderProxy({
    service: "memberstack",
    baseUrl: "https://admin.memberstack.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  motion: defineProviderProxy({
    service: "motion",
    baseUrl: "https://api.usemotion.com/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  nocodb: defineProviderProxy({
    service: "nocodb",
    baseUrl: credentialProviderProxyBaseUrl("baseUrl"),
    auth: { type: "api_key_header", name: "xc-token" },
  }),
  onedesk: defineProviderProxy({
    service: "onedesk",
    baseUrl: "https://app.onedesk.com",
    auth: { type: "api_key_header", name: "od-public-api-key" },
  }),
  owl_protocol: defineProviderProxy({
    service: "owl_protocol",
    baseUrl: "https://api.owl.build",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  paradym: defineProviderProxy({
    service: "paradym",
    baseUrl: "https://api.paradym.id",
    auth: { type: "api_key_header", name: "x-access-token" },
  }),
  parallel: defineProviderProxy({
    service: "parallel",
    baseUrl: "https://api.parallel.ai",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  parsera: defineProviderProxy({
    service: "parsera",
    baseUrl: "https://api.parsera.org",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  pdf_co: defineProviderProxy({
    service: "pdf_co",
    baseUrl: "https://api.pdf.co",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  perigon: defineProviderProxy({
    service: "perigon",
    baseUrl: "https://api.perigon.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  personal_ai: defineProviderProxy({
    service: "personal_ai",
    baseUrl: "https://api.personal.ai",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  postgrid: defineProviderProxy({
    service: "postgrid",
    baseUrl: "https://api.postgrid.com/print-mail/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  posthog: defineProviderProxy({
    service: "posthog",
    baseUrl: credentialProviderProxyBaseUrl("baseUrl", "posthog_base_url"),
    auth: { type: "bearer" },
  }),
  postmark: defineProviderProxy({
    service: "postmark",
    baseUrl: "https://api.postmarkapp.com",
    auth: { type: "api_key_header", name: "x-postmark-server-token" },
  }),
  pushbullet: defineProviderProxy({
    service: "pushbullet",
    baseUrl: "https://api.pushbullet.com/v2",
    auth: { type: "api_key_header", name: "access-token" },
  }),
  redfox: defineProviderProxy({
    service: "redfox",
    baseUrl: "https://redfox.hk",
    auth: { type: "api_key_header", name: "redfox_api_key" },
  }),
  remove_bg: defineProviderProxy({
    service: "remove_bg",
    baseUrl: "https://api.remove.bg/v1.0",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  retently: defineProviderProxy({
    service: "retently",
    baseUrl: "https://app.retently.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  scrape_graph_ai: defineProviderProxy({
    service: "scrape_graph_ai",
    baseUrl: "https://v2-api.scrapegraphai.com",
    auth: { type: "api_key_header", name: "sgai-apikey" },
  }),
  ship_station: defineProviderProxy({
    service: "ship_station",
    baseUrl: "https://api.shipstation.com",
    auth: { type: "api_key_header", name: "api-key" },
  }),
  shipengine: defineProviderProxy({
    service: "shipengine",
    baseUrl: "https://api.shipengine.com",
    auth: { type: "api_key_header", name: "api-key" },
  }),
  short_menu: defineProviderProxy({
    service: "short_menu",
    baseUrl: "https://api.shortmenu.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  shortcut: defineProviderProxy({
    service: "shortcut",
    baseUrl: "https://api.app.shortcut.com/api/v3/",
    auth: { type: "api_key_header", name: "shortcut-token" },
  }),
  signwell: defineProviderProxy({
    service: "signwell",
    baseUrl: "https://www.signwell.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  simla: defineProviderProxy({
    service: "simla",
    baseUrl: credentialProviderProxyBaseUrl("apiBaseUrl"),
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  simplesat: defineProviderProxy({
    service: "simplesat",
    baseUrl: "https://api.simplesat.io",
    auth: { type: "api_key_header", name: "x-simplesat-token" },
  }),
  skyfire: defineProviderProxy({
    service: "skyfire",
    baseUrl: "https://api.skyfire.xyz",
    auth: { type: "api_key_header", name: "skyfire-api-key" },
  }),
  slite: defineProviderProxy({
    service: "slite",
    baseUrl: "https://api.slite.com",
    auth: { type: "api_key_header", name: "x-slite-api-key" },
  }),
  starton: defineProviderProxy({
    service: "starton",
    baseUrl: "https://api.starton.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  statista: defineProviderProxy({
    service: "statista",
    baseUrl: "https://api.statista.ai",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  stormboard: defineProviderProxy({
    service: "stormboard",
    baseUrl: "https://api.stormboard.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  subvisory: defineProviderProxy({
    service: "subvisory",
    baseUrl: "https://www.subvisory.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  supadata: defineProviderProxy({
    service: "supadata",
    baseUrl: "https://api.supadata.ai/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  superchat: defineProviderProxy({
    service: "superchat",
    baseUrl: "https://api.superchat.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  supervisely: defineProviderProxy({
    service: "supervisely",
    baseUrl: "https://app.supervisely.com/public/api/v3",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  surecontact: defineProviderProxy({
    service: "surecontact",
    baseUrl: "https://api.surecontact.com/api/v1/public",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  systeme_io: defineProviderProxy({
    service: "systeme_io",
    baseUrl: "https://api.systeme.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  teltel: defineProviderProxy({
    service: "teltel",
    baseUrl: "https://api.teltel.io/v2",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  the_dog_api: defineProviderProxy({
    service: "the_dog_api",
    baseUrl: "https://api.thedogapi.com/v1/",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  the_swarm: defineProviderProxy({
    service: "the_swarm",
    baseUrl: "https://bee.theswarm.com",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  tiktok_business: defineProviderProxy({
    service: "tiktok_business",
    baseUrl: "https://business-api.tiktok.com",
    auth: { type: "none" },
    async customizeRequest({ context, service, headers }) {
      const credential = await requireBearerCredential(context, service);
      headers.set("Access-Token", credential.accessToken);
    },
  }),
  triple_whale: defineProviderProxy({
    service: "triple_whale",
    baseUrl: "https://api.triplewhale.com/api/v2/",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  twitterapi_io: defineProviderProxy({
    service: "twitterapi_io",
    baseUrl: "https://api.twitterapi.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  twochat: defineProviderProxy({
    service: "twochat",
    baseUrl: "https://api.p.2chat.io",
    auth: { type: "api_key_header", name: "x-user-api-key" },
  }),
  updown_io: defineProviderProxy({
    service: "updown_io",
    baseUrl: "https://updown.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  urlscan: defineProviderProxy({
    service: "urlscan",
    baseUrl: "https://urlscan.io",
    auth: { type: "api_key_header", name: "api-key" },
  }),
  valyu: defineProviderProxy({
    service: "valyu",
    baseUrl: "https://api.valyu.ai",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  virustotal: defineProviderProxy({
    service: "virustotal",
    baseUrl: "https://www.virustotal.com/api/v3",
    auth: { type: "api_key_header", name: "x-apikey" },
  }),
  waterfall: defineProviderProxy({
    service: "waterfall",
    baseUrl: "https://api.waterfall.io",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  you: defineProviderProxy({
    service: "you",
    baseUrl: "https://api.you.com/v1",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
  yuandian: defineProviderProxy({
    service: "yuandian",
    baseUrl: "https://open.chineselaw.com/open",
    auth: { type: "api_key_header", name: "x-api-key" },
  }),
};
