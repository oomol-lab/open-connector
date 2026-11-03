import type { ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import { Loader2, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import { Badge, EmptyState, FormStatus } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type OAuthClientRegistrationType = "dcr" | "cimd" | "manual";
export type OAuthTokenEndpointAuthMethod = "none" | "client_secret_basic" | "client_secret_post";

export const SUPPORTED_OAUTH_SCOPES = ["mcp:access", "offline_access"] as const;

export interface OAuthClientSummary {
  clientId: string;
  clientName: string;
  registrationType: OAuthClientRegistrationType;
  redirectUris: string[];
  scopes: string[];
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  hasSecret: boolean;
  metadataDocumentUrl?: string;
  createdAt: string;
  rotatedAt?: string;
}

export interface ClientFormInput {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  scopes: string[];
}

export interface OneTimeSecretState {
  clientId: string;
  clientName: string;
  secret: string;
}

const REGISTRATION_TYPES: OAuthClientRegistrationType[] = ["manual", "dcr", "cimd"];
const AUTH_METHODS: OAuthTokenEndpointAuthMethod[] = ["none", "client_secret_basic", "client_secret_post"];

/** Normalizes an admin API client record, rejecting shapes the console cannot render. */
export function clientSummaryFromApi(value: unknown): OAuthClientSummary {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("OAuth client summary must be an object");
  }
  const record = value as Record<string, unknown>;
  const clientId = requireString(record.clientId, "clientId");
  const registrationType = requireEnum(record.registrationType, REGISTRATION_TYPES, "registrationType");
  const tokenEndpointAuthMethod = requireEnum(record.tokenEndpointAuthMethod, AUTH_METHODS, "tokenEndpointAuthMethod");
  return {
    clientId,
    clientName: requireString(record.clientName, "clientName"),
    registrationType,
    redirectUris: requireStringArray(record.redirectUris, "redirectUris"),
    scopes: requireStringArray(record.scopes, "scopes"),
    tokenEndpointAuthMethod,
    hasSecret: record.hasSecret === true,
    metadataDocumentUrl: optionalString(record.metadataDocumentUrl),
    createdAt: requireString(record.createdAt, "createdAt"),
    rotatedAt: optionalString(record.rotatedAt),
  };
}

/** Splits a textarea value into a redirect URI list (one URI per line, commas tolerated). */
export function toRedirectUriList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((uri) => uri.trim())
    .filter((uri) => uri.length > 0);
}

/** Redirect URIs must be absolute `https` (or plain `http` on loopback only, RFC 8252). */
export function isValidRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return false;
  }
  if (parsed.protocol === "https:") {
    return true;
  }
  if (parsed.protocol !== "http:") {
    return false;
  }
  const host = parsed.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function isConfidentialAuthMethod(method: OAuthTokenEndpointAuthMethod): boolean {
  return method !== "none";
}

/** Returns the translation keys of every validation problem, in field order. */
export function validateClientInput(input: ClientFormInput): string[] {
  const errors: string[] = [];
  if (input.clientName.trim().length === 0) {
    errors.push("oauthClients.errors.nameRequired");
  }
  if (input.redirectUris.length === 0) {
    errors.push("oauthClients.errors.redirectUriRequired");
  }
  if (input.redirectUris.some((uri) => !isValidRedirectUri(uri))) {
    errors.push("oauthClients.errors.redirectUriInvalid");
  }
  if (
    input.scopes.some((scope) => !SUPPORTED_OAUTH_SCOPES.includes(scope as (typeof SUPPORTED_OAUTH_SCOPES)[number]))
  ) {
    errors.push("oauthClients.errors.scopeInvalid");
  }
  return errors;
}

/** Renders a client creation timestamp as a locale date + time (matches console date display). */
export function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

/** One-time secret visibility: a new secret replaces any previously shown one. */
export function showOneTimeSecret(
  previous: OneTimeSecretState | null,
  clientId: string,
  clientName: string,
  secret: string,
): OneTimeSecretState {
  return { clientId, clientName, secret };
}

/** Dismisses the panel only when it is still showing the given client. */
export function clearOneTimeSecret(current: OneTimeSecretState | null, clientId: string): OneTimeSecretState | null {
  return current?.clientId === clientId ? null : current;
}

export function OAuthClientsPage(): ReactNode {
  const t = useTranslate();
  const [clients, setClients] = useState<OAuthClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<"new" | OAuthClientSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OAuthClientSummary | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<OneTimeSecretState | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const payload = await apiGet<unknown[]>("/api/oauth-clients");
      setClients(payload.map((entry) => clientSummaryFromApi(entry)));
      setLoadError(null);
    } catch {
      setClients([]);
      setLoadError(t("oauthClients.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="grid gap-4">
      <section className="oauth-clients-panel">
        <header className="oauth-clients-header">
          <div>
            <h2>{t("oauthClients.title")}</h2>
            <p>{t("oauthClients.description")}</p>
          </div>
          <Button type="button" size="sm" onClick={() => setFormTarget("new")}>
            <Plus size={15} />
            {t("oauthClients.newClient")}
          </Button>
        </header>

        {loading ? (
          <div className="loading-panel">
            <Loader2 className="spin" size={16} />
            {t("common.loadingRuntimeData")}
          </div>
        ) : loadError ? (
          <FormStatus message={loadError} />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title={t("oauthClients.emptyTitle")}
            description={t("oauthClients.emptyDescription")}
            density="compact"
          />
        ) : (
          <OAuthClientsList
            clients={clients}
            onDelete={setDeleteTarget}
            onEdit={setFormTarget}
            onRotated={(client, secret) =>
              setOneTimeSecret(showOneTimeSecret(oneTimeSecret, client.clientId, client.clientName, secret))
            }
          />
        )}
      </section>

      {formTarget ? (
        <OAuthClientFormDialog
          client={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={reload}
          onSecret={setOneTimeSecret}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteClientDialog client={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={reload} />
      ) : null}

      {oneTimeSecret ? (
        <OneTimeSecretDialog
          state={oneTimeSecret}
          onClose={() => setOneTimeSecret(clearOneTimeSecret(oneTimeSecret, oneTimeSecret.clientId))}
        />
      ) : null}
    </div>
  );
}

/** Presentational list of registered clients; exported for static-render tests. */
export function OAuthClientsList(props: {
  clients: OAuthClientSummary[];
  onEdit(client: OAuthClientSummary): void;
  onDelete(client: OAuthClientSummary): void;
  onRotated(client: OAuthClientSummary, secret: string): void;
}): ReactNode {
  return (
    <div className="oauth-clients-list">
      {props.clients.map((client) => (
        <OAuthClientRow
          client={client}
          key={client.clientId}
          onDelete={() => props.onDelete(client)}
          onEdit={() => props.onEdit(client)}
          onRotated={(secret) => props.onRotated(client, secret)}
        />
      ))}
    </div>
  );
}

function OAuthClientRow(props: {
  client: OAuthClientSummary;
  onEdit(): void;
  onDelete(): void;
  onRotated(secret: string): void;
}): ReactNode {
  const t = useTranslate();
  const { client } = props;

  async function rotate(): Promise<void> {
    try {
      const payload = await apiPost<{ clientSecret?: string }>(
        `/api/oauth-clients/${encodeURIComponent(client.clientId)}/rotate-secret`,
        {},
      );
      if (payload.clientSecret) {
        props.onRotated(payload.clientSecret);
      }
      toast.success(t("oauthClients.toasts.rotated"));
    } catch {
      toast.error(t("oauthClients.toasts.rotateFailed"));
    }
  }

  return (
    <div className="oauth-client-row">
      <div className="oauth-client-identity">
        <strong>{client.clientName}</strong>
        <code>{client.clientId}</code>
      </div>
      <div className="oauth-client-meta">
        <Badge>{t(`oauthClients.registrationType.${client.registrationType}`)}</Badge>
        <Badge tone={client.hasSecret ? undefined : "success"}>
          {t(client.hasSecret ? "oauthClients.confidential" : "oauthClients.public")}
        </Badge>
        <span>{t(`oauthClients.authMethodValue.${client.tokenEndpointAuthMethod}`)}</span>
        <span>
          {t("oauthClients.created")} {formatCreatedAt(client.createdAt)}
        </span>
      </div>
      <div className="oauth-client-uris">
        {client.redirectUris.map((uri) => (
          <code key={uri}>{uri}</code>
        ))}
      </div>
      <div className="oauth-client-scopes">
        {client.scopes.map((scope) => (
          <Badge key={scope}>{scope}</Badge>
        ))}
      </div>
      <div className="oauth-client-actions">
        <Button variant="outline" size="sm" type="button" onClick={props.onEdit}>
          <Pencil size={15} />
          {t("oauthClients.edit")}
        </Button>
        {client.hasSecret ? (
          <Button variant="outline" size="sm" type="button" onClick={() => void rotate()}>
            <RotateCcw size={15} />
            {t("oauthClients.rotateSecret")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" type="button" onClick={props.onDelete}>
          <Trash2 size={15} />
          {t("oauthClients.delete")}
        </Button>
      </div>
    </div>
  );
}

function OAuthClientFormDialog(props: {
  client: OAuthClientSummary | null;
  onClose(): void;
  onSaved(): Promise<void>;
  onSecret(state: OneTimeSecretState): void;
}): ReactNode {
  const t = useTranslate();
  const { client } = props;
  const [clientName, setClientName] = useState(() => client?.clientName ?? "");
  const [redirectUriText, setRedirectUriText] = useState(() => client?.redirectUris.join("\n") ?? "");
  const [authMethod, setAuthMethod] = useState<OAuthTokenEndpointAuthMethod>(
    () => client?.tokenEndpointAuthMethod ?? "none",
  );
  const [scopes, setScopes] = useState<string[]>(() => (client?.scopes.length ? client.scopes : ["mcp:access"]));
  const [status, setStatus] = useState<string | null>(null);
  const errors = validateClientInput({
    clientName,
    redirectUris: toRedirectUriList(redirectUriText),
    tokenEndpointAuthMethod: authMethod,
    scopes,
  });

  function toggleScope(scope: string, checked: boolean): void {
    setScopes((previous) =>
      checked ? [...new Set([...previous, scope])] : previous.filter((candidate) => candidate !== scope),
    );
  }

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (errors.length > 0) {
      setStatus(t(errors[0]));
      return;
    }
    const body = {
      clientName: clientName.trim(),
      redirectUris: toRedirectUriList(redirectUriText),
      scopes,
    };
    try {
      if (client) {
        await apiPut(`/api/oauth-clients/${encodeURIComponent(client.clientId)}`, body);
        toast.success(t("oauthClients.toasts.updated"));
        setStatus(null);
        props.onSaved();
        props.onClose();
        return;
      }
      const payload = await apiPost<{ client: unknown; clientSecret?: string }>("/api/oauth-clients", {
        ...body,
        tokenEndpointAuthMethod: authMethod,
      });
      const created = clientSummaryFromApi(payload.client);
      props.onSaved();
      props.onClose();
      if (payload.clientSecret) {
        props.onSecret(showOneTimeSecret(null, created.clientId, created.clientName, payload.clientSecret));
        return;
      }
      toast.success(t("oauthClients.toasts.created"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("oauthClients.toasts.saveFailed"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-[min(560px,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(560px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>
            {client
              ? t("oauthClients.editDialog.title", { name: client.clientName })
              : t("oauthClients.createDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {client ? t("oauthClients.editDialog.description") : t("oauthClients.createDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <Label className="field">
            <span>{t("oauthClients.clientName")}</span>
            <Input value={clientName} onChange={(event) => setClientName(event.target.value)} required />
          </Label>
          <Label className="field">
            <span>{t("oauthClients.redirectUris")}</span>
            <Textarea
              className="font-mono text-xs"
              rows={3}
              value={redirectUriText}
              onChange={(event) => setRedirectUriText(event.target.value)}
            />
            <small>{t("oauthClients.redirectUrisHint")}</small>
          </Label>
          {client ? null : (
            <Label className="field">
              <span>{t("oauthClients.authMethod")}</span>
              <Select
                value={authMethod}
                onValueChange={(value) => setAuthMethod(value as OAuthTokenEndpointAuthMethod)}
              >
                <SelectTrigger aria-label={t("oauthClients.authMethod")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTH_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(`oauthClients.authMethodValue.${method}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
          )}
          <fieldset className="form-grid">
            <legend>{t("oauthClients.scopes")}</legend>
            {SUPPORTED_OAUTH_SCOPES.map((scope) => (
              <Label className="flex items-center gap-2" key={scope}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) => toggleScope(scope, event.target.checked)}
                />
                <code>{scope}</code>
              </Label>
            ))}
          </fieldset>
          {status ? <FormStatus message={status} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={props.onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{client ? t("oauthClients.save") : t("oauthClients.create")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteClientDialog(props: {
  client: OAuthClientSummary;
  onClose(): void;
  onDeleted(): Promise<void>;
}): ReactNode {
  const t = useTranslate();
  const [status, setStatus] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    try {
      await apiDelete(`/api/oauth-clients/${encodeURIComponent(props.client.clientId)}`);
      toast.success(t("oauthClients.toasts.deleted"));
      await props.onDeleted();
      props.onClose();
    } catch {
      setStatus(t("oauthClients.toasts.deleteFailed"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="max-w-[min(480px,calc(100vw-2rem))] sm:max-w-[min(480px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("oauthClients.deleteDialog.title", { name: props.client.clientName })}</DialogTitle>
          <DialogDescription>{t("oauthClients.deleteDialog.description")}</DialogDescription>
        </DialogHeader>
        <code className="font-mono text-xs">{props.client.clientId}</code>
        {status ? <FormStatus message={status} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => void confirm()}>
            {t("oauthClients.deleteDialog.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OneTimeSecretDialog(props: { state: OneTimeSecretState; onClose(): void }): ReactNode {
  const t = useTranslate();
  const { copy, copied } = useClipboard();

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="max-w-[min(480px,calc(100vw-2rem))] sm:max-w-[min(480px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("oauthClients.secret.title", { name: props.state.clientName })}</DialogTitle>
          <DialogDescription>{t("oauthClients.secret.description")}</DialogDescription>
        </DialogHeader>
        <div className="unlock-status" role="alert">
          {t("oauthClients.secret.warning")}
        </div>
        <div className="flex items-center gap-2">
          <Input className="font-mono text-xs" readOnly value={props.state.secret} />
          <Button variant="outline" type="button" onClick={() => void copy(props.state.secret)}>
            {copied ? t("oauthClients.secret.copied") : t("oauthClients.secret.copy")}
          </Button>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={props.onClose}>
            {t("oauthClients.secret.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`OAuth client summary field ${field} must be a string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`OAuth client summary field ${field} must be a string array`);
  }
  return value as string[];
}

function requireEnum<T extends string>(value: unknown, allowed: T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`OAuth client summary field ${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}
