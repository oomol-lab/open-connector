export interface ConnectorProxyRequest {
  readonly body?: unknown;
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  readonly query?: Readonly<Record<string, boolean | number | string | null>>;
}

export interface ConnectorProxyResult {
  readonly data: unknown;
  readonly status: number;
}

export interface ConnectorProxy {
  execute(request: ConnectorProxyRequest, signal?: AbortSignal): Promise<ConnectorProxyResult>;
}
