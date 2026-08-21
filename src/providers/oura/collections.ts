/**
 * Oura API v2 base URL. Documented at https://cloud.ouraring.com/v2/docs.
 */
export const ouraApiBaseUrl = "https://api.ouraring.com";

/** Path prefix shared by every Oura user data collection. */
export const ouraUserCollectionPath = "/v2/usercollection";

/**
 * Official Oura OAuth2 scopes.
 *
 * `email` through `session` come from the `OAuth2` security scheme in the Oura
 * API v2 OpenAPI document. That scheme is stale: it omits `heart_health`,
 * `stress`, and `ring_configuration`, and names the SpO2 scope `spo2Daily`
 * where the API enforces `spo2`. The names below are the ones the live API
 * reports in its 401 responses, so they are what an authorization request has
 * to ask for.
 */
export const ouraOauthScopes: string[] = [
  "email",
  "personal",
  "daily",
  "heartrate",
  "workout",
  "tag",
  "session",
  "spo2",
  "heart_health",
  "stress",
  "ring_configuration",
];

/**
 * Query window accepted by one Oura collection list endpoint. Daily summaries
 * are filtered by calendar day, time series by timestamp, and a few
 * collections accept no window at all.
 */
export type OuraCollectionWindow = "date" | "datetime" | "none";

/**
 * One Oura user data collection exposed as a `list_*` (and usually `get_*`)
 * action pair.
 */
export interface OuraDocumentCollection {
  /** Action name suffix, such as `daily_sleep` in `oura.list_daily_sleep`. */
  name: string;
  /** Path segment under {@link ouraUserCollectionPath}; differs from `name` where Oura uses mixed case. */
  path: string;
  /** Human-readable collection name used in action descriptions. */
  label: string;
  /** Oura OAuth scope that grants access to this collection. */
  scope: string;
  /** Query window accepted by the list endpoint. */
  window: OuraCollectionWindow;
  /** Whether Oura exposes a single-document endpoint for this collection. */
  hasDocumentEndpoint: boolean;
  /** Whether the list endpoint accepts `latest` to return only the newest sample. */
  supportsLatest: boolean;
  /** Extra sentence appended to the generated action descriptions. */
  note?: string;
}

/**
 * Every user data collection served by the Oura API v2, in the order actions
 * are published to the catalog.
 */
export const ouraDocumentCollections: readonly OuraDocumentCollection[] = [
  collection({
    name: "daily_activity",
    label: "daily activity summary",
    scope: "daily",
  }),
  collection({
    name: "daily_cardiovascular_age",
    label: "daily cardiovascular age",
    scope: "heart_health",
  }),
  collection({
    name: "daily_readiness",
    label: "daily readiness summary",
    scope: "daily",
  }),
  collection({
    name: "daily_resilience",
    label: "daily resilience summary",
    scope: "stress",
  }),
  collection({
    name: "daily_sleep",
    label: "daily sleep summary",
    scope: "daily",
  }),
  collection({
    name: "daily_spo2",
    label: "daily SpO2 summary",
    scope: "spo2",
  }),
  collection({
    name: "daily_stress",
    label: "daily stress summary",
    scope: "daily",
  }),
  collection({
    name: "enhanced_tag",
    label: "enhanced tag",
    scope: "tag",
  }),
  collection({
    name: "heartrate",
    label: "heart rate sample",
    scope: "heartrate",
    window: "datetime",
    hasDocumentEndpoint: false,
    supportsLatest: true,
  }),
  collection({
    name: "rest_mode_period",
    label: "rest mode period",
    scope: "daily",
  }),
  collection({
    name: "ring_battery_level",
    label: "ring battery level sample",
    scope: "ring_configuration",
    window: "datetime",
    hasDocumentEndpoint: false,
    supportsLatest: true,
  }),
  collection({
    name: "ring_configuration",
    label: "ring configuration",
    scope: "ring_configuration",
    window: "none",
  }),
  collection({
    name: "session",
    label: "guided or unguided session",
    scope: "session",
  }),
  collection({
    name: "sleep",
    label: "sleep period",
    scope: "daily",
  }),
  collection({
    name: "sleep_time",
    label: "recommended bedtime window",
    scope: "daily",
  }),
  collection({
    name: "tag",
    label: "tag",
    scope: "tag",
    note: "Oura has superseded this collection by enhanced tags.",
  }),
  collection({
    name: "vo2_max",
    path: "vO2_max",
    label: "VO2 max measurement",
    scope: "heart_health",
  }),
  collection({
    name: "workout",
    label: "workout",
    scope: "workout",
  }),
];

interface OuraDocumentCollectionInput {
  name: string;
  path?: string;
  label: string;
  scope: string;
  window?: OuraCollectionWindow;
  hasDocumentEndpoint?: boolean;
  supportsLatest?: boolean;
  note?: string;
}

/** Apply the defaults shared by most Oura collections: date window, single-document endpoint, no `latest`. */
function collection(input: OuraDocumentCollectionInput): OuraDocumentCollection {
  return {
    name: input.name,
    path: input.path ?? input.name,
    label: input.label,
    scope: input.scope,
    window: input.window ?? "date",
    hasDocumentEndpoint: input.hasDocumentEndpoint ?? true,
    supportsLatest: input.supportsLatest ?? false,
    note: input.note,
  };
}
