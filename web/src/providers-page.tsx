import type { AppData, AuthDefinition, CredentialField, OAuthConfig, ProviderDefinition } from "./model";
import type { FormEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Check, ExternalLink, KeyRound, PlugZap, Search, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { apiDelete, apiPost, apiPut } from "./api";
import { credentialFieldsFor, filterProviders, sortProviders } from "./model";
import { Badge, EmptyState, InfoBlock, ProviderIcon, TagList } from "./shared-ui";

interface ProvidersPageProps {
  data: AppData;
  onRefresh(): void;
}

interface ProviderDetailProps {
  provider: ProviderDefinition;
  connection?: AppData["connections"][number];
  oauthConfig?: OAuthConfig;
  onRefresh(): void;
}

interface ConnectionFormProps {
  provider: ProviderDefinition;
  auth: AuthDefinition;
  connection?: AppData["connections"][number];
  oauthConfig?: OAuthConfig;
  onRefresh(): void;
  onConfigureOAuthClient(): void;
}

interface OAuthConfigFormProps {
  provider: ProviderDefinition;
  config?: OAuthConfig;
  onRefresh(): void;
}

type ProviderStatusFilter = "all" | "connected" | "not_connected" | "oauth_needs_config";

const providerPageSize = 120;
const oauthRefreshPollingIntervalMs = 1_000;
const oauthRefreshPollingMaxAttempts = 30;

export function ProvidersPage(props: ProvidersPageProps): ReactNode {
  const t = useTranslate();
  const params = useParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProviderStatusFilter>("all");
  const [visibleLimit, setVisibleLimit] = useState(providerPageSize);
  const connectionsByService = useMemo(
    () => new Map(props.data.connections.map((connection) => [connection.service, connection])),
    [props.data.connections],
  );
  const oauthConfigServices = useMemo(
    () => new Set(props.data.oauthConfigs.filter((config) => config.configured).map((config) => config.service)),
    [props.data.oauthConfigs],
  );
  const sortedProviders = useMemo(
    () => sortProviders(props.data.providers, connectionsByService),
    [props.data.providers, connectionsByService],
  );
  const searchedProviders = filterProviders(sortedProviders, query);
  const visibleProviders = filterProvidersByStatus(
    searchedProviders,
    statusFilter,
    connectionsByService,
    oauthConfigServices,
  );
  const renderedProviders = visibleProviders.slice(0, visibleLimit);
  const routeProvider = params.service
    ? props.data.providers.find((provider) => provider.service === params.service)
    : undefined;
  const selectedProvider = params.service ? routeProvider : (visibleProviders[0] ?? null);
  const selectedInResults = selectedProvider
    ? visibleProviders.some((provider) => provider.service === selectedProvider.service)
    : false;
  const selectedIsRendered = selectedProvider
    ? renderedProviders.some((provider) => provider.service === selectedProvider.service)
    : false;
  const pinnedSelectedProvider = selectedProvider && selectedInResults && !selectedIsRendered ? selectedProvider : null;
  const hasMoreProviders = renderedProviders.length < visibleProviders.length;

  useEffect(() => {
    setVisibleLimit(providerPageSize);
  }, [query, statusFilter]);

  function renderProviderRow(provider: ProviderDefinition): ReactNode {
    const connected = connectionsByService.has(provider.service);
    const needsOAuthConfig = providerNeedsOAuthConfig(provider, oauthConfigServices);
    return (
      <Link
        key={provider.service}
        className={selectedProvider?.service === provider.service ? "provider-row active" : "provider-row"}
        to={`/providers/${provider.service}`}
      >
        <ProviderIcon provider={provider} />
        <span className="row-main">
          <span>{provider.displayName}</span>
          <small>
            {t("providers.providerMeta", {
              service: provider.service,
              authTypes: provider.authTypes.join(", ") || t("providers.noAuth"),
              count: provider.actions.length,
            })}
          </small>
        </span>
        {connected ? <Badge tone="success">{t("common.connected")}</Badge> : <Badge>{t("common.notConnected")}</Badge>}
        {needsOAuthConfig ? <Badge tone="warning">{t("providers.oauthConfigBadge")}</Badge> : null}
      </Link>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("providers.searchPlaceholder")}
          />
        </label>
        <div className="segmented-control" role="tablist" aria-label={t("providers.statusFilterLabel")}>
          {providerStatusOptions.map((option) => (
            <button
              key={option.id}
              className={statusFilter === option.id ? "segment active" : "segment"}
              onClick={() => setStatusFilter(option.id)}
              role="tab"
              aria-selected={statusFilter === option.id}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <div className="split-view">
        <section className="list-panel">
          {visibleProviders.length === 0 ? (
            <EmptyState title={t("providers.noProvidersTitle")} description={t("providers.noProvidersDescription")} />
          ) : (
            <>
              {pinnedSelectedProvider ? (
                <div className="pinned-action">
                  <span>{t("common.currentSelection")}</span>
                  {renderProviderRow(pinnedSelectedProvider)}
                </div>
              ) : null}
              {renderedProviders.map((provider) => renderProviderRow(provider))}
              {hasMoreProviders ? (
                <div className="list-panel-footer">
                  <span>
                    {t("common.showing", { shown: renderedProviders.length, total: visibleProviders.length })}
                  </span>
                  <button
                    className="secondary-button compact"
                    onClick={() => setVisibleLimit((value) => value + providerPageSize)}
                  >
                    {t("common.showMore")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="detail-panel">
          {selectedProvider ? (
            <ProviderDetail
              provider={selectedProvider}
              connection={connectionsByService.get(selectedProvider.service)}
              oauthConfig={oauthConfigForProvider(props.data.oauthConfigs, selectedProvider.service)}
              onRefresh={props.onRefresh}
            />
          ) : (
            <EmptyState
              title={params.service ? t("providers.providerNotFoundTitle") : t("providers.selectProviderTitle")}
              description={
                params.service ? t("providers.providerNotFoundDescription") : t("providers.selectProviderDescription")
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ProviderDetail(props: ProviderDetailProps): ReactNode {
  const t = useTranslate();
  const [selectedAuthType, setSelectedAuthType] = useState(() => initialAuthType(props.provider, props.connection));
  const [oauthClientExpanded, setOAuthClientExpanded] = useState(false);
  const selectedAuth = props.provider.auth.find((auth) => auth.type === selectedAuthType) ?? props.provider.auth[0];
  const oauthAuth = props.provider.auth.find((auth) => auth.type === "oauth2");
  const hasMultipleAuthMethods = props.provider.auth.length > 1;
  const hasOAuthConfig = props.oauthConfig != null;

  useEffect(() => {
    setSelectedAuthType(initialAuthType(props.provider, props.connection));
  }, [props.provider.service, props.connection?.authType]);

  useEffect(() => {
    setOAuthClientExpanded(false);
  }, [props.provider.service, props.oauthConfig?.clientId]);

  return (
    <>
      <div className="provider-detail-header">
        <div className="detail-heading">
          <ProviderIcon provider={props.provider} large />
          <div>
            <h2>{props.provider.displayName}</h2>
            <p>{props.provider.service}</p>
          </div>
        </div>
        {props.connection ? (
          <Badge tone="success">{t("providers.connectedBy", { authType: props.connection.authType })}</Badge>
        ) : (
          <Badge>{t("common.notConnected")}</Badge>
        )}
      </div>

      <div className="section-grid provider-summary-grid">
        <InfoBlock
          icon={<PlugZap size={18} />}
          label={t("providers.summary.actions")}
          value={String(props.provider.actions.length)}
        />
        <InfoBlock
          icon={<ShieldCheck size={18} />}
          label={t("providers.summary.auth")}
          value={props.provider.authTypes.join(", ")}
        />
        <InfoBlock
          icon={<KeyRound size={18} />}
          label={t("providers.summary.oauthConfig")}
          value={
            oauthAuth
              ? hasOAuthConfig
                ? t("providers.summary.configured")
                : t("providers.summary.required")
              : t("providers.summary.notUsed")
          }
        />
      </div>

      <div className="panel-section">
        <h3>{t("providers.connection")}</h3>
        {hasMultipleAuthMethods ? (
          <div
            className="segmented-control auth-method-control"
            role="tablist"
            aria-label={t("providers.connectionMethod")}
          >
            {props.provider.auth.map((auth) => (
              <button
                key={auth.type}
                className={selectedAuth?.type === auth.type ? "segment active" : "segment"}
                onClick={() => setSelectedAuthType(auth.type)}
                role="tab"
                aria-selected={selectedAuth?.type === auth.type}
              >
                {authLabel(auth, t)}
              </button>
            ))}
          </div>
        ) : null}
        {selectedAuth ? (
          <ConnectionForm
            key={selectedAuth.type}
            provider={props.provider}
            auth={selectedAuth}
            connection={props.connection}
            oauthConfig={props.oauthConfig}
            onRefresh={props.onRefresh}
            onConfigureOAuthClient={() => setOAuthClientExpanded(true)}
          />
        ) : (
          <EmptyState
            title={t("providers.noConnectionMethodTitle")}
            description={t("providers.noConnectionMethodDescription")}
          />
        )}
      </div>

      {oauthAuth && selectedAuth?.type === "oauth2" ? (
        <div className="panel-section">
          <h3>{t("providers.oauthClient")}</h3>
          <OAuthClientSettings
            provider={props.provider}
            auth={oauthAuth}
            config={props.oauthConfig}
            expanded={oauthClientExpanded}
            onToggle={() => setOAuthClientExpanded((value) => !value)}
            onRefresh={props.onRefresh}
          />
        </div>
      ) : null}

      <div className="panel-section">
        <h3>{t("providers.scopes")}</h3>
        <TagList
          values={[...new Set(props.provider.actions.flatMap((action) => action.requiredScopes))]}
          empty={t("providers.noScopes")}
        />
      </div>

      <div className="panel-section">
        <h3>{t("providers.actions")}</h3>
        {props.provider.actions.length === 0 ? (
          <p className="muted-copy">{t("providers.noActions")}</p>
        ) : (
          <div className="linked-list">
            {props.provider.actions.map((action) => (
              <Link key={action.id} className="linked-row" to={`/actions/${action.id}`}>
                <span>
                  <strong>{action.name}</strong>
                  <small>{action.id}</small>
                </span>
                <Badge tone={action.execution.locallyExecutable ? "success" : undefined}>
                  {action.execution.locallyExecutable
                    ? t("providers.execution.executable")
                    : t("providers.execution.catalogOnly")}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function shouldShowOAuthClientForm(auth: AuthDefinition | undefined, expanded: boolean): boolean {
  return auth?.type === "oauth2" && expanded;
}

export function shouldShowConnectionActions(auth: AuthDefinition): boolean {
  return auth.type !== "no_auth";
}

export function shouldShowDisconnectAction(connection: AppData["connections"][number] | undefined): boolean {
  return connection != null;
}

export function shouldEnableConnectionSubmit(auth: AuthDefinition, oauthConfig: OAuthConfig | undefined): boolean {
  return auth.type !== "oauth2" || oauthConfig != null;
}

export function connectionSubmitLabel(auth: AuthDefinition, connected: boolean, providerName: string): string {
  if (auth.type === "oauth2") {
    return `${connected ? "Reconnect" : "Connect"} ${providerName}`;
  }
  return "Save Connection";
}

export function oauthClientActionLabel(config: OAuthConfig | undefined): string {
  return config ? "Edit OAuth Client" : "Configure OAuth Client";
}

export function shouldClearOAuthClientStatus(input: {
  providerChanged: boolean;
  skipNextConfigClear: boolean;
}): boolean {
  return input.providerChanged || !input.skipNextConfigClear;
}

export interface OAuthPopupPlacement {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
}

export function createOAuthPopupFeatures(placement: OAuthPopupPlacement): string {
  const width = 520;
  const height = 720;
  const left = Math.round(placement.screenX + (placement.outerWidth - width) / 2);
  const top = Math.round(placement.screenY + (placement.outerHeight - height) / 2);
  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
    "noopener",
    "noreferrer",
  ].join(",");
}

export function startOAuthRefreshPolling(onRefresh: () => void): () => void {
  let remainingAttempts = oauthRefreshPollingMaxAttempts;
  const interval = setInterval(() => {
    onRefresh();
    remainingAttempts -= 1;
    if (remainingAttempts === 0) {
      clearInterval(interval);
    }
  }, oauthRefreshPollingIntervalMs);
  return () => clearInterval(interval);
}

function initialAuthType(
  provider: ProviderDefinition,
  connection: AppData["connections"][number] | undefined,
): AuthDefinition["type"] | undefined {
  const connectedAuth = provider.auth.find((auth) => auth.type === connection?.authType);
  return (connectedAuth ?? provider.auth.find((auth) => auth.type === "api_key") ?? provider.auth[0])?.type;
}

function authLabel(auth: AuthDefinition, t: (key: string) => string): string {
  if (auth.type === "api_key") return t("providers.authLabels.apiKey");
  if (auth.type === "oauth2") return t("providers.authLabels.oauth");
  if (auth.type === "custom_credential") return t("providers.authLabels.custom");
  return t("providers.authLabels.noAuth");
}

function ConnectionForm(props: ConnectionFormProps): ReactNode {
  const t = useTranslate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const stopOAuthRefreshPolling = useRef<(() => void) | undefined>(undefined);
  const fields = credentialFieldsFor(props.auth);
  const showActions = shouldShowConnectionActions(props.auth);
  const connected = props.connection != null;
  const needsOAuthClient = props.auth.type === "oauth2" && !props.oauthConfig;
  const canSubmit = shouldEnableConnectionSubmit(props.auth, props.oauthConfig);
  const submitLabel =
    props.auth.type === "oauth2"
      ? t(connected ? "providers.buttons.reconnectProvider" : "providers.buttons.connectProvider", {
          name: props.provider.displayName,
        })
      : t("providers.buttons.saveConnection");

  useEffect(
    () => () => {
      stopOAuthRefreshPolling.current?.();
    },
    [],
  );

  useEffect(() => {
    if (props.connection) {
      stopOAuthRefreshPolling.current?.();
      stopOAuthRefreshPolling.current = undefined;
    }
  }, [props.connection]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus(
      props.auth.type === "oauth2"
        ? t("providers.connectionMessages.openingOAuth")
        : t("providers.connectionMessages.saving"),
    );
    try {
      if (props.auth.type === "no_auth") {
        await apiPut(`/api/connections/${props.provider.service}`, { authType: "no_auth" });
      } else if (props.auth.type === "api_key") {
        await apiPut(`/api/connections/${props.provider.service}`, { authType: "api_key", values });
      } else if (props.auth.type === "custom_credential") {
        await apiPut(`/api/connections/${props.provider.service}`, { authType: "custom_credential", values });
      } else {
        if (!canSubmit) {
          setStatus(t("providers.connectionMessages.configureOAuthFirst"));
          return;
        }
        const result = await apiPost<{ authorizationUrl?: string }>(`/api/oauth/authorizations`, {
          service: props.provider.service,
        });
        if (result.authorizationUrl) {
          window.open(
            result.authorizationUrl,
            "oomol_connect_oauth",
            createOAuthPopupFeatures({
              screenX: window.screenX,
              screenY: window.screenY,
              outerWidth: window.outerWidth,
              outerHeight: window.outerHeight,
            }),
          );
          stopOAuthRefreshPolling.current?.();
          stopOAuthRefreshPolling.current = startOAuthRefreshPolling(props.onRefresh);
        }
        setStatus(t("providers.connectionMessages.oauthWindowOpened"));
        return;
      }
      setStatus(t("providers.connectionMessages.updated"));
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.connectionMessages.failed"));
    }
  }

  async function disconnect(): Promise<void> {
    setStatus(t("providers.connectionMessages.disconnecting"));
    try {
      await apiDelete(`/api/connections/${props.provider.service}`);
      setStatus(t("providers.connectionMessages.disconnected"));
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.connectionMessages.disconnectFailed"));
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {props.auth.type === "no_auth" ? <p className="muted-copy">{t("providers.connectionMessages.noAuth")}</p> : null}
      {props.auth.type === "oauth2" ? (
        <p className="muted-copy">
          {needsOAuthClient
            ? t("providers.connectionMessages.needsOAuthClient", { name: props.provider.displayName })
            : connected
              ? t("providers.connectionMessages.connectedOAuth", { name: props.provider.displayName })
              : t("providers.connectionMessages.connectOAuth", { name: props.provider.displayName })}
        </p>
      ) : null}
      {fields.map((field) => (
        <CredentialInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
        />
      ))}
      {showActions ? (
        <div className="button-row">
          {needsOAuthClient ? (
            <button className="primary-button" type="button" onClick={props.onConfigureOAuthClient}>
              <Settings size={16} />
              {t("providers.buttons.configureOAuthClient")}
            </button>
          ) : (
            <button className="primary-button" type="submit" disabled={!canSubmit}>
              {props.auth.type === "oauth2" ? <ExternalLink size={16} /> : <Check size={16} />}
              {submitLabel}
            </button>
          )}
          {shouldShowDisconnectAction(props.connection) ? (
            <button className="secondary-button" type="button" onClick={() => void disconnect()}>
              <Trash2 size={16} />
              {t("providers.buttons.disconnect")}
            </button>
          ) : null}
        </div>
      ) : null}
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}

function OAuthClientSettings(props: {
  provider: ProviderDefinition;
  auth: AuthDefinition;
  config?: OAuthConfig;
  expanded: boolean;
  onToggle(): void;
  onRefresh(): void;
}): ReactNode {
  const t = useTranslate();
  const [status, setStatus] = useState<string | null>(null);
  const previousProviderService = useRef(props.provider.service);
  const skipNextConfigClear = useRef(false);

  useEffect(() => {
    const providerChanged = previousProviderService.current !== props.provider.service;
    previousProviderService.current = props.provider.service;
    const shouldClear = shouldClearOAuthClientStatus({
      providerChanged,
      skipNextConfigClear: skipNextConfigClear.current,
    });
    skipNextConfigClear.current = false;
    if (shouldClear) {
      setStatus(null);
    }
  }, [props.provider.service, props.config?.clientId]);

  async function reset(): Promise<void> {
    setStatus(t("providers.oauthClientSettings.resetting"));
    try {
      await apiDelete(`/api/oauth/configs/${props.provider.service}`);
      setStatus(t("providers.oauthClientSettings.reset"));
      skipNextConfigClear.current = true;
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.oauthClientSettings.resetFailed"));
    }
  }

  return (
    <div className="oauth-client-settings">
      <div className="oauth-client-summary">
        <div className="oauth-client-summary-main">
          <div className="oauth-client-title">
            <KeyRound size={16} />
            <strong>
              {props.config
                ? t("providers.oauthClientSettings.configuredTitle")
                : t("providers.oauthClientSettings.requiredTitle")}
            </strong>
            <Badge tone={props.config ? "success" : "warning"}>
              {props.config ? t("providers.summary.configured") : t("providers.summary.required")}
            </Badge>
          </div>
          <p className={props.config?.clientId ? "oauth-client-id" : "oauth-client-description"}>
            {props.config?.clientId
              ? props.config.clientId
              : t("providers.oauthClientSettings.missingDescription", { name: props.provider.displayName })}
          </p>
        </div>
        <div className="oauth-client-actions">
          <button className="secondary-button compact" type="button" onClick={props.onToggle}>
            <Settings size={14} />
            {props.expanded
              ? t("common.close")
              : t(props.config ? "providers.buttons.editOAuthClient" : "providers.buttons.configureOAuthClient")}
          </button>
          {props.config ? (
            <button className="secondary-button compact" type="button" onClick={() => void reset()}>
              <Trash2 size={14} />
              {t("providers.buttons.resetOAuthClient")}
            </button>
          ) : null}
        </div>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
      {shouldShowOAuthClientForm(props.auth, props.expanded) ? (
        <div className="oauth-client-editor">
          <OAuthConfigForm provider={props.provider} config={props.config} onRefresh={props.onRefresh} />
        </div>
      ) : null}
    </div>
  );
}

function OAuthConfigForm(props: OAuthConfigFormProps): ReactNode {
  const t = useTranslate();
  const [clientId, setClientId] = useState(() => props.config?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setClientId(props.config?.clientId ?? "");
    setClientSecret("");
    setStatus(null);
  }, [props.provider.service, props.config?.clientId]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus(t("providers.oauthClientSettings.saving"));
    try {
      await apiPut(`/api/oauth/configs/${props.provider.service}`, {
        clientId,
        clientSecret,
        extra: {},
      });
      setStatus(t("providers.oauthClientSettings.saved"));
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.oauthClientSettings.failed"));
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>{t("providers.oauthClientSettings.clientId")}</span>
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} />
      </label>
      <label className="field">
        <span>{t("providers.oauthClientSettings.clientSecret")}</span>
        <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
        {props.config ? <small>{t("providers.oauthClientSettings.storedSecretHint")}</small> : null}
      </label>
      <div className="button-row">
        <button className="primary-button" type="submit">
          <Settings size={16} />
          {props.config ? t("providers.buttons.updateOAuthClient") : t("providers.buttons.saveOAuthClient")}
        </button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}

function CredentialInput(props: { field: CredentialField; value: string; onChange(value: string): void }): ReactNode {
  return (
    <label className="field">
      <span>{props.field.label}</span>
      {props.field.inputType === "textarea" || props.field.inputType === "json" ? (
        <textarea
          className="json-input compact"
          value={props.value}
          placeholder={props.field.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          spellCheck={false}
        />
      ) : (
        <input
          type={props.field.secret ? "password" : "text"}
          placeholder={props.field.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.field.description ? <small>{props.field.description}</small> : null}
    </label>
  );
}

function filterProvidersByStatus(
  providers: ProviderDefinition[],
  status: ProviderStatusFilter,
  connectionsByService: Map<string, AppData["connections"][number]>,
  oauthConfigServices: Set<string>,
): ProviderDefinition[] {
  if (status === "all") return providers;
  return providers.filter((provider) => {
    const connected = connectionsByService.has(provider.service);
    if (status === "connected") return connected;
    if (status === "not_connected") return !connected;
    return providerNeedsOAuthConfig(provider, oauthConfigServices);
  });
}

function providerNeedsOAuthConfig(provider: ProviderDefinition, oauthConfigServices: Set<string>): boolean {
  return provider.auth.some((auth) => auth.type === "oauth2") && !oauthConfigServices.has(provider.service);
}

export function oauthConfigForProvider(configs: OAuthConfig[], service: string): OAuthConfig | undefined {
  return configs.find((config) => config.service === service && config.configured);
}

const providerStatusOptions: Array<{ id: ProviderStatusFilter; labelKey: string }> = [
  { id: "all", labelKey: "providers.filters.all" },
  { id: "connected", labelKey: "providers.filters.connected" },
  { id: "not_connected", labelKey: "providers.filters.notConnected" },
  { id: "oauth_needs_config", labelKey: "providers.filters.oauthNeedsConfig" },
];
