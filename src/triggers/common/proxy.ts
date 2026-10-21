export interface ConnectorProxyRequest {
  readonly body?: unknown;
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  readonly query?: Readonly<Record<string, boolean | number | string | null>>;
}

export interface ConnectorProxyResult {
  readonly headers?: Readonly<Record<string, string>>;
  readonly data: unknown;
  readonly status: number;
}

export interface ConnectorProxy {
  readonly oauthClientConfig?: { readonly clientId: string; readonly clientSecret?: string };
  readonly providerAccountId?: string;
  readonly authType?: string;
  execute(request: ConnectorProxyRequest, signal?: AbortSignal): Promise<ConnectorProxyResult>;
}
