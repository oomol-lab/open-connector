import type { ConnectionRecord, OAuthConfig } from "./model";

import { ApiError, apiGet, apiPost } from "./api";

export interface OAuthRequestState {
  status: "initiated" | "connected" | "failed" | "expired";
  errorMessage?: string;
}

interface WatchOAuthRequestOptions {
  id: string;
  remote: boolean;
  expiresAt: string;
  onUpdate(request: OAuthRequestState): void;
  onError(error: unknown): void;
}

/** Reconnects retain the selected connection's source regardless of the service default. */
export function usesSaasOAuth(connection: ConnectionRecord | undefined, config: OAuthConfig | undefined): boolean {
  return connection ? Boolean(connection.saas) : config?.oauthSource?.mode === "saas";
}

/** Only result synchronization is retried; authorization creation is never replayed. */
export function watchOAuthRequest(options: WatchOAuthRequestOptions): () => void {
  let active = true;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  async function poll(): Promise<void> {
    let delay = 2000;
    try {
      const id = encodeURIComponent(options.id);
      const result = options.remote
        ? (
            await apiPost<{ request: OAuthRequestState }>(
              `/api/oauth/connection-requests/${id}/sync`,
              {},
              { "X-OpenConnector-Request": "sync" },
            )
          ).request
        : (await apiGet<{ data: OAuthRequestState }>(`/v1/connection-requests/${id}`)).data;
      if (!active) return;
      options.onUpdate(result);
      if (result.status !== "initiated") return;
      failures = 0;
    } catch (error) {
      if (!active) return;
      options.onError(error);
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return;
      const retry = error instanceof ApiError ? error.retryAfter : undefined;
      const retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      delay = Math.max(Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)), Number.isFinite(retryMs) ? retryMs : 0);
    }
    if (active && Date.now() < Date.parse(options.expiresAt)) timer = setTimeout(() => void poll(), delay);
  }
  timer = setTimeout(() => void poll(), 2000);
  return () => {
    active = false;
    clearTimeout(timer);
  };
}
