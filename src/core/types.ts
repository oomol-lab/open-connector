/**
 * JSON Schema object used for action input and output contracts.
 *
 * The type intentionally stays permissive because providers may need keywords
 * from different JSON Schema drafts.
 */
export type JsonSchema = {
  [key: string]: unknown;
};

/**
 * Authentication models that a provider can advertise in the public catalog.
 */
export type AuthType = "no_auth" | "api_key" | "custom_credential" | "oauth2";

/**
 * A single credential field that users can configure for a provider.
 */
export type CredentialDefinition = {
  /** Stable field key used in connection request `values`. */
  key: string;
  /** Human-readable label for local UI forms. */
  label: string;
  /** Suggested local UI control for collecting the value. */
  inputType: "text" | "password" | "textarea" | "json";
  /** Whether the local runtime rejects empty or missing values. */
  required: boolean;
  /** Whether local UI/storage should treat the value as sensitive. */
  secret: boolean;
  /** Optional input placeholder shown by local UI forms. */
  placeholder?: string;
  /** Help text explaining where the user gets this value. */
  description?: string;
};

/**
 * OAuth app configuration field storage location.
 */
export type OAuthClientConfigFieldLocation = "extra" | "secretExtra";

/**
 * A single OAuth client config field that users can configure locally.
 */
export type OAuthClientConfigFieldDefinition = CredentialDefinition & {
  /** Whether the value is stored as public extra metadata or secret local data. */
  location?: OAuthClientConfigFieldLocation;
  /** Default local value used when the caller omits this OAuth client config field. */
  defaultValue?: string;
};

/**
 * API key connection configuration shown by the local console.
 */
export type ApiKeyAuthDefinition = {
  /** Auth discriminator used by catalog clients and connection routes. */
  type: "api_key";
  /** Label for the built-in `apiKey` credential field. */
  label?: string;
  /** Placeholder for the built-in `apiKey` credential field. */
  placeholder?: string;
  /** Help text for creating or finding the provider API key. */
  description?: string;
  /** Additional credential fields stored next to the built-in `apiKey`. */
  extraFields?: CredentialDefinition[];
};

/**
 * Custom credential connection configuration shown by the local console.
 */
export type CustomCredentialAuthDefinition = {
  /** Auth discriminator used by catalog clients and connection routes. */
  type: "custom_credential";
  /** Complete user-editable credential field list for this provider. */
  fields: CredentialDefinition[];
  /** Optional action used by future UI/CLI flows to verify credentials. */
  testAction?: {
    /** Provider action name, without the `<service>.` prefix. */
    actionName: string;
    /** Static input payload passed to the test action. */
    input: Record<string, unknown>;
  };
};

/**
 * OAuth client configuration required by the local runtime.
 *
 * Open source users provide their own provider OAuth app and configure its
 * callback URL to this local runtime.
 */
export type OAuth2AuthDefinition = {
  /** Auth discriminator used by catalog clients and connection routes. */
  type: "oauth2";
  /** Provider authorization endpoint used to build the browser consent URL. */
  authorizationUrl: string;
  /** Provider token endpoint used to exchange an authorization code. */
  tokenUrl: string;
  /** Provider token endpoint used to refresh an access token. Defaults to tokenUrl. */
  refreshTokenUrl?: string;
  /** OAuth scopes joined with spaces into the authorization URL `scope` parameter. */
  scopes: string[];
  /** Separator used when joining OAuth scopes. Defaults to a space. */
  scopeSeparator?: " " | ",";
  /** How the runtime sends client credentials to the token endpoint. */
  tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "none";
  /** Token request body encoding. Defaults to OAuth form encoding. */
  tokenRequestFormat?: "form" | "json";
  /** Provider-specific OAuth token request field names. */
  tokenRequestFields?: {
    grantType?: string | false;
    code?: string;
    redirectUri?: string | false;
    refreshToken?: string;
    clientId?: string | false;
    clientSecret?: string | false;
    authorizationCode?: {
      grantType?: string | false;
      code?: string;
      redirectUri?: string | false;
    };
    refresh?: {
      grantType?: string | false;
      refreshToken?: string;
    };
  };
  /** Provider-specific token response envelope. */
  tokenResponseEnvelope?: {
    dataField: string;
    codeField?: string;
    successCode?: number;
    messageField?: string;
  };
  /** Proof Key for Code Exchange mode for providers that require per-flow verifiers. */
  pkce?: {
    method: "S256";
  };
  /** Extra static authorization URL parameters, such as Google `access_type=offline`. */
  authorizationParams?: Record<string, string>;
  /** Provider-specific OAuth authorization request field names. */
  authorizationRequestFields?: {
    clientId?: string | false;
    redirectUri?: string | false;
    responseType?: string | false;
    state?: string | false;
    scope?: string | false;
  };
  /** Extra local OAuth app fields required before starting authorization. */
  clientConfigFields?: OAuthClientConfigFieldDefinition[];
};

/**
 * Provider authentication capabilities advertised in the public catalog.
 */
export type ProviderAuthDefinition =
  | { type: "no_auth" }
  | ApiKeyAuthDefinition
  | CustomCredentialAuthDefinition
  | OAuth2AuthDefinition;

/**
 * Public metadata and schema contract for one action.
 *
 * Action definitions are catalog data. They must not depend on credentials,
 * network calls, or executor code.
 */
export type ActionDefinition = {
  /** Globally unique action id, usually `<service>.<name>`. */
  id: string;
  /** Provider service id that owns this action. */
  service: string;
  /** Provider-scoped action name without the service prefix. */
  name: string;
  /** Human-readable action summary for catalogs, docs, and tool descriptions. */
  description: string;
  /** Provider-native OAuth scopes, permission names, or capability strings needed for this action. */
  requiredScopes: string[];
  /** Provider-native permissions or scopes users must grant. */
  providerPermissions: string[];
  /** JSON Schema used to validate HTTP/tool input before executor invocation. */
  inputSchema: JsonSchema;
  /** JSON Schema describing the executor output payload. */
  outputSchema: JsonSchema;
  /** Related actions that are useful after this action completes. */
  followUpActions?: string[];
  /** Action ids that model a start/status/cancel async workflow. */
  asyncLifecycle?: {
    /** Action used to start an async provider operation. */
    startActionId: string;
    /** Action used to poll async provider operation status. */
    statusActionId: string;
    /** Optional action used to cancel async provider operation. */
    cancelActionId?: string;
  };
};

/**
 * Public catalog definition for one provider or app.
 */
export type ProviderDefinition = {
  /** Stable lowercase service id used in action ids, routes, and catalog filenames. */
  service: string;
  /** Human-readable provider name. */
  displayName: string;
  /** Broad catalog categories used by UI filtering. */
  categories: string[];
  /** Quick list of supported auth types for catalog filtering. */
  authTypes: AuthType[];
  /** Full auth configuration used by connection and OAuth flows. */
  auth: ProviderAuthDefinition[];
  /** Provider product homepage. */
  homepageUrl?: string;
  /** Optional linked icon URL; third-party brand rights remain with their owners. */
  iconUrl?: string;
  /** Public action catalog for this provider. */
  actions: ActionDefinition[];
};

/**
 * A credential resolved for action execution.
 */
export type ResolvedCredential =
  | { authType: "no_auth" }
  | {
      /** Stored credential kind selected for execution. */
      authType: "api_key";
      /** Built-in API key value copied from `values.apiKey` for convenience. */
      apiKey: string;
      /** Trimmed credential values keyed by provider credential field id. */
      values: Record<string, string>;
      /** Stable provider account identity safe to show in local APIs and MCP. */
      profile: CredentialProfile;
      /** Runtime-owned metadata that is not sent by catalog definitions. */
      metadata: Record<string, unknown>;
    }
  | {
      /** Stored credential kind selected for execution. */
      authType: "custom_credential";
      /** Trimmed credential values keyed by provider credential field id. */
      values: Record<string, string>;
      /** Stable provider account identity safe to show in local APIs and MCP. */
      profile: CredentialProfile;
      /** Runtime-owned metadata that is not sent by catalog definitions. */
      metadata: Record<string, unknown>;
    }
  | {
      /** Stored credential kind selected for execution. */
      authType: "oauth2";
      /** OAuth access token sent to provider APIs. */
      accessToken: string;
      /** Token type used in Authorization headers, usually `Bearer`. */
      tokenType: string;
      /** ISO timestamp when the access token expires, if the provider returned one. */
      expiresAt?: string;
      /** OAuth refresh token, if the provider issued one. */
      refreshToken?: string;
      /** Stable provider account identity safe to show in local APIs and MCP. */
      profile: CredentialProfile;
      /** Raw token metadata such as provider scope or token type. */
      metadata: Record<string, unknown>;
    };

export interface TransitFileUpload {
  fileId: string;
  downloadUrl: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface TransitFileRead {
  file: File;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface TransitFileStore {
  readonly maxBytes: number;
  create(file: File): Promise<{
    fileId: string;
    downloadUrl: string;
    sizeBytes: number;
    name: string;
    mimeType: string;
  }>;
  read(fileId: string): Promise<TransitFileRead>;
  delete(fileId: string): Promise<boolean>;
}

export type TransitFileWriter = TransitFileStore;

/**
 * Runtime services available to action executors.
 *
 * Executors receive resolved credentials through this interface instead of
 * depending on a concrete storage implementation.
 */
export interface ExecutionContext {
  /** Resolve the credential currently configured for a provider service id. */
  getCredential(service: string): Promise<ResolvedCredential | undefined>;
  /** Optional local temporary file storage for actions that produce downloadable files. */
  transitFiles?: TransitFileWriter;
  /** Optional cancellation signal propagated from the HTTP request or runner. */
  signal?: AbortSignal;
}

/**
 * Optional metadata returned by provider credential validation.
 */
export type CredentialValidationResult = {
  /**
   * Provider-side account identity represented by this credential.
   *
   * Validators should return this when the provider exposes a cheap current-user
   * or current-account endpoint. The local runtime exposes this profile to
   * users and agents so they can see which account an action will use.
   */
  profile?: CredentialProfileInput;
  /** Provider-native scopes granted to this credential, when known. */
  grantedScopes?: string[];
  /**
   * Provider-specific non-secret metadata kept for executors.
   *
   * Do not rely on this shape in public APIs. Use `profile` and
   * `grantedScopes` for agent-visible identity and capability data.
   */
  metadata?: Record<string, unknown>;
};

/**
 * Stable provider account identity stored with a local credential.
 */
export type CredentialProfile = {
  /** Provider-side account, user, bot, workspace, or token identifier. */
  accountId: string;
  /** Human-readable label for local users and agents. */
  displayName: string;
  /** Provider-native scopes granted to this credential, when known. */
  grantedScopes: string[];
};

/**
 * Validator-produced account identity before runtime defaults are applied.
 */
export type CredentialProfileInput = {
  /** Provider-side account, user, bot, workspace, or token identifier. */
  accountId?: string;
  /** Human-readable label for local users and agents. */
  displayName?: string;
  /** Provider-native scopes granted to this credential, when known. */
  grantedScopes?: string[];
};

/**
 * Runtime hooks used before storing local credentials.
 *
 * Provider executor modules may export validators for the auth modes they
 * support. Each validator receives normalized user input for that auth mode and
 * should make the cheapest provider API call that proves the credential works.
 */
export type CredentialValidators = {
  apiKey?: (
    input: { apiKey: string; values: Record<string, string> },
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ) => Promise<CredentialValidationResult | void>;
  customCredential?: (
    input: { values: Record<string, string> },
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ) => Promise<CredentialValidationResult | void>;
  oauth2?: (
    input: Extract<ResolvedCredential, { authType: "oauth2" }>,
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ) => Promise<CredentialValidationResult | void>;
};

/**
 * Standard result envelope returned by action executors.
 */
export type ExecutionResult<TOutput = unknown> = {
  /** Whether the executor completed successfully. */
  ok: boolean;
  /** Provider action output when `ok` is true. */
  output?: TOutput;
  /** Stable structured error when `ok` is false. */
  error?: {
    /** Machine-readable error code for clients and agents. */
    code: string;
    /** Human-readable error message. */
    message: string;
    /** Optional provider/runtime details for debugging. */
    details?: unknown;
  };
};

/**
 * Runtime implementation for an action.
 *
 * The input is already validated against the action schema before the executor
 * is called.
 */
export type ActionExecutor<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ExecutionContext,
) => Promise<ExecutionResult<TOutput>>;

/**
 * Executor map for one provider.
 *
 * Keys are full action ids and must start with the provider service id.
 */
export type ProviderExecutors<Service extends string = string> = Record<`${Service}.${string}`, ActionExecutor>;
