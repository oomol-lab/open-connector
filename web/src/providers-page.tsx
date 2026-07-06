import type {
  AppData,
  AuthDefinition,
  CredentialField,
  OAuthConfig,
  ProviderConnectionStatus,
  ProviderDefinition,
} from "./model";
import type { CSSProperties, FormEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { apiDelete, apiPost, apiPut } from "./api";
import { credentialFieldsFor, filterProviders, resolveProviderConnectionStatus, sortProviders } from "./model";
import { Badge, EmptyState, FormStatus, ProviderIcon, TagList } from "./shared-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ProvidersPageProps {
  data: AppData;
  onRefresh(): void;
}

interface ProviderDetailProps {
  provider: ProviderDefinition;
  connection?: AppData["connections"][number];
  connectionStatus: ProviderConnectionStatus;
  oauthConfig?: OAuthConfig;
  onRefresh(): void;
}

interface ProviderBrowserProps {
  data: AppData;
}

interface ProviderCardProps {
  provider: ProviderDefinition;
  status: ProviderConnectionStatus;
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

const providerPageSize = 48;
const oauthRefreshPollingIntervalMs = 1_000;
const oauthRefreshPollingMaxAttempts = 30;
const compactNumberFormatter = Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const providerCardStyle = {
  contentVisibility: "auto",
  containIntrinsicSize: "64px",
} satisfies CSSProperties;

export function ProvidersPage(props: ProvidersPageProps): ReactNode {
  const params = useParams();
  const routeProvider = params.service
    ? props.data.providers.find((provider) => provider.service === params.service)
    : undefined;

  if (!params.service) {
    return <ProviderBrowser data={props.data} />;
  }

  if (!routeProvider) {
    return <ProviderNotFound service={params.service} />;
  }

  const connectionStatus = resolveProviderConnectionStatus(
    routeProvider,
    props.data.connections,
    props.data.oauthConfigs,
  );

  return (
    <ProviderDetail
      provider={routeProvider}
      connection={connectionStatus.connection}
      connectionStatus={connectionStatus}
      oauthConfig={oauthConfigForProvider(props.data.oauthConfigs, routeProvider.service)}
      onRefresh={props.onRefresh}
    />
  );
}

function ProviderBrowser(props: ProviderBrowserProps): ReactNode {
  const t = useTranslate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProviderStatusFilter>("all");
  const resetKey = providerBrowserResetKey(query, statusFilter);
  const statusByService = useMemo(
    () =>
      new Map(
        props.data.providers.map((provider) => [
          provider.service,
          resolveProviderConnectionStatus(provider, props.data.connections, props.data.oauthConfigs),
        ]),
      ),
    [props.data.connections, props.data.oauthConfigs, props.data.providers],
  );
  const credentialConnectionsByService = useMemo(
    () =>
      new Map(
        [...statusByService.entries()].flatMap(([service, status]) =>
          status.connection ? [[service, status.connection] as const] : [],
        ),
      ),
    [statusByService],
  );
  const sortedProviders = useMemo(
    () => sortProviders(props.data.providers, credentialConnectionsByService),
    [credentialConnectionsByService, props.data.providers],
  );
  const searchedProviders = filterProviders(sortedProviders, query);
  const visibleProviders = filterProvidersByStatus(searchedProviders, statusFilter, statusByService);
  const {
    hasMore: hasMoreProviders,
    limit: visibleLimit,
    loadMore: loadMoreProviders,
  } = useProgressiveProviderLimit(visibleProviders.length, resetKey);
  const loadMoreProvidersRef = useIntersectionLoader(hasMoreProviders, loadMoreProviders);
  const renderedProviders = visibleProviders.slice(0, visibleLimit);
  const filtersActive = query.trim().length > 0 || statusFilter !== "all";
  const statusCounts = useMemo(
    () =>
      providerStatusOptions.map((option) => ({
        ...option,
        count: countProvidersForStatus(searchedProviders, option.id, statusByService),
      })),
    [searchedProviders, statusByService],
  );

  function resetFilters(): void {
    setQuery("");
    setStatusFilter("all");
  }

  return (
    <section className="provider-browser-panel">
      <div className="provider-browser-header">
        <div>
          <h2>{t("providers.catalogTitle")}</h2>
        </div>
        <label className="relative flex w-full max-w-80 items-center sm:w-80">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <Input
            className="h-8 pl-9 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("providers.searchPlaceholder")}
            aria-label={t("providers.searchPlaceholder")}
          />
        </label>
      </div>

      <ProviderCollectionBar
        counts={statusCounts}
        filtersActive={filtersActive}
        providerCount={visibleProviders.length}
        selected={statusFilter}
        totalProviderCount={props.data.providers.length}
        onReset={resetFilters}
        onSelect={setStatusFilter}
      />

      {visibleProviders.length === 0 ? (
        <div className="provider-empty-row">
          <EmptyState title={t("providers.noProvidersTitle")} description={t("providers.noProvidersDescription")} />
          {filtersActive ? (
            <Button variant="outline" size="sm" type="button" onClick={resetFilters}>
              <X size={14} />
              {t("providers.resetFilters")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="provider-card-grid">
          {renderedProviders.map((provider) => (
            <ProviderCard
              key={provider.service}
              provider={provider}
              status={statusByService.get(provider.service) ?? resolveProviderConnectionStatus(provider, [], [])}
            />
          ))}
          {hasMoreProviders ? (
            <div ref={loadMoreProvidersRef} className="provider-show-more">
              <Button variant="outline" size="sm" type="button" onClick={loadMoreProviders}>
                {t("providers.showMore")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function useProgressiveProviderLimit(
  total: number,
  resetKey: string,
): {
  hasMore: boolean;
  limit: number;
  loadMore(): void;
} {
  const [limit, setLimit] = useState(providerPageSize);

  useEffect(() => {
    setLimit(providerPageSize);
  }, [resetKey]);

  useEffect(() => {
    if (limit > total) {
      setLimit(Math.max(providerPageSize, total));
    }
  }, [limit, total]);

  const loadMore = useCallback(() => {
    setLimit((current) => Math.min(current + providerPageSize, total));
  }, [total]);

  return {
    hasMore: limit < total,
    limit: Math.min(limit, total),
    loadMore,
  };
}

function useIntersectionLoader(enabled: boolean, onLoad: () => void): (node: HTMLDivElement | null) => void {
  const onLoadRef = useRef(onLoad);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  const setNode = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!enabled || !node || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadRef.current();
        }
      },
      { rootMargin: "480px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return setNode;
}

function ProviderCollectionBar(props: {
  counts: Array<{ id: ProviderStatusFilter; labelKey: string; count: number }>;
  filtersActive: boolean;
  providerCount: number;
  selected: ProviderStatusFilter;
  totalProviderCount: number;
  onReset(): void;
  onSelect(value: ProviderStatusFilter): void;
}): ReactNode {
  const t = useTranslate();

  return (
    <div className="provider-collection-bar">
      <ToggleGroup
        className="provider-filter-list"
        type="single"
        value={props.selected}
        onValueChange={(value) => (value ? props.onSelect(value as ProviderStatusFilter) : undefined)}
        aria-label={t("providers.statusFilterLabel")}
      >
        {props.counts.map((option) => (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            className="h-8 gap-2 rounded-md border px-3 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:[&>span:last-child]:text-primary-foreground/70 [&>span:last-child]:text-xs [&>span:last-child]:text-muted-foreground [&>span:last-child]:tabular-nums"
            disabled={option.count === 0 && option.id !== "all"}
          >
            <span>{t(option.labelKey)}</span>
            <span>{compactProviderCount(option.count)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="provider-result-meta">
        <span>
          {t("providers.resultCount", {
            shown: props.providerCount,
            total: props.totalProviderCount,
          })}
        </span>
        {props.filtersActive ? (
          <Button variant="ghost" size="xs" type="button" onClick={props.onReset}>
            <X size={13} />
            {t("providers.resetFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ProviderCard(props: ProviderCardProps): ReactNode {
  const t = useTranslate();
  const to = `/providers/${encodeURIComponent(props.provider.service)}`;
  const actionLabel = props.status.noSetupRequired
    ? t("providers.buttons.details")
    : props.status.connected
      ? t("providers.buttons.manageConnection")
      : props.status.oauthClientRequired
        ? t("providers.buttons.configureOAuthClient")
        : t("providers.buttons.connect");

  return (
    <div className="provider-card" style={providerCardStyle}>
      <Link className="provider-card-main" to={to}>
        <ProviderIcon provider={props.provider} />
        <span className="provider-card-title-row">
          <span className="provider-card-title">{props.provider.displayName || props.provider.service}</span>
          <ProviderStatusBadges status={props.status} compact />
        </span>
      </Link>
      <Link
        className={props.status.connected ? "provider-card-action" : "provider-card-action provider-card-action-muted"}
        to={to}
      >
        <span>{actionLabel}</span>
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}

function ProviderStatusBadges(props: {
  status: ProviderConnectionStatus;
  compact?: boolean;
  includeDisconnected?: boolean;
}): ReactNode {
  const t = useTranslate();
  const badges: ReactNode[] = [];

  if (props.status.connected) {
    badges.push(
      <Badge key="connected" tone="success">
        {props.compact ? <CheckCircle2 size={12} /> : null}
        {t("providers.configuredBadge")}
      </Badge>,
    );
  } else if (props.status.noSetupRequired) {
    badges.push(
      <Badge key="no-setup">
        {props.compact ? <CheckCircle2 size={12} /> : null}
        {t("providers.noSetupBadge")}
      </Badge>,
    );
  } else if (props.includeDisconnected) {
    badges.push(<Badge key="not-connected">{t("providers.unconfiguredBadge")}</Badge>);
  }

  if (props.status.oauthClientRequired && !props.compact) {
    badges.push(
      <Badge key="oauth-client" tone="warning">
        {t("providers.oauthClientRequiredBadge")}
      </Badge>,
    );
  }

  return badges.length > 0 ? <span className="provider-status-badges">{badges}</span> : null;
}

function ProviderNotFound(props: { service: string }): ReactNode {
  const t = useTranslate();

  return (
    <section className="detail-panel provider-not-found-panel">
      <EmptyState
        title={t("providers.providerNotFoundTitle")}
        description={t("providers.providerNotFoundDescription", { service: props.service })}
      />
      <Button asChild variant="outline" size="sm">
        <Link to="/providers">
          <ArrowLeft size={15} />
          {t("providers.backToProviders")}
        </Link>
      </Button>
    </section>
  );
}

function ProviderDetail(props: ProviderDetailProps): ReactNode {
  const t = useTranslate();
  const [selectedAuthType, setSelectedAuthType] = useState(() => initialAuthType(props.provider, props.connection));
  const [oauthClientExpanded, setOAuthClientExpanded] = useState(false);
  const selectedAuth = props.provider.auth.find((auth) => auth.type === selectedAuthType) ?? props.provider.auth[0];
  const oauthAuth = props.provider.auth.find((auth) => auth.type === "oauth2");
  const hasMultipleAuthMethods = props.provider.auth.length > 1;
  const connectionDescription = props.connectionStatus.noSetupRequired
    ? t("providers.connectionDescriptions.noSetup")
    : props.connectionStatus.connected
      ? t("providers.connectionDescriptions.connected", { authType: props.connection?.authType ?? "" })
      : props.connectionStatus.oauthClientRequired
        ? t("providers.connectionDescriptions.oauthClientRequired", { name: props.provider.displayName })
        : t("providers.connectionDescriptions.notConnected", { name: props.provider.displayName });

  useEffect(() => {
    setSelectedAuthType(initialAuthType(props.provider, props.connection));
  }, [props.provider.service, props.connection?.authType]);

  useEffect(() => {
    setOAuthClientExpanded(false);
  }, [props.provider.service, props.oauthConfig?.clientId]);

  return (
    <div className="provider-detail-page">
      <div className="provider-detail-route-header">
        <div className="provider-detail-title-row">
          <Button asChild variant="outline" size="icon-sm">
            <Link to="/providers" aria-label={t("providers.backToProviders")} title={t("providers.backToProviders")}>
              <ArrowLeft size={15} />
            </Link>
          </Button>
          <ProviderIcon provider={props.provider} large />
          <div className="provider-detail-heading-copy">
            <div className="provider-detail-heading-title">
              <h2>{props.provider.displayName}</h2>
              <ProviderStatusBadges status={props.connectionStatus} includeDisconnected />
            </div>
            <div className="provider-detail-meta">
              <span className="provider-service-id">{props.provider.service}</span>
              {providerAuthTypeLabels(props.provider, t).map((label) => (
                <Badge key={label}>{label}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="provider-detail-actions">
          {props.provider.homepageUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={props.provider.homepageUrl} target="_blank" rel="noreferrer">
                {t("providers.providerHomepage")}
                <ArrowUpRight size={14} />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="provider-detail-layout">
        <section className="detail-panel provider-detail-card provider-connection-card">
          <div className="provider-panel-title-row">
            <div>
              <h3>{t("providers.connection")}</h3>
              <p>{connectionDescription}</p>
            </div>
          </div>
          {hasMultipleAuthMethods ? (
            <ToggleGroup
              className="auth-method-control bg-muted p-[3px]"
              type="single"
              value={selectedAuth?.type}
              spacing={0}
              aria-label={t("providers.connectionMethod")}
              onValueChange={(value) => (value ? setSelectedAuthType(value as AuthDefinition["type"]) : undefined)}
            >
              {props.provider.auth.map((auth) => (
                <ToggleGroupItem
                  key={auth.type}
                  value={auth.type}
                  className="h-[30px] rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-none"
                >
                  {authLabel(auth, t)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
          {oauthAuth && selectedAuth?.type === "oauth2" ? (
            <div className="provider-inline-oauth-settings">
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
        </section>

        <section className="detail-panel provider-detail-card">
          <div className="provider-panel-title-row">
            <div>
              <h3>{t("providers.scopes")}</h3>
              <p>{t("providers.scopesDescription")}</p>
            </div>
          </div>
          <TagList
            values={[...new Set(props.provider.actions.flatMap((action) => action.requiredScopes))]}
            empty={t("providers.noScopes")}
          />
        </section>

        <section className="detail-panel provider-detail-card">
          <div className="provider-panel-title-row">
            <div>
              <h3>{t("providers.actions")}</h3>
              <p>{t("providers.actionsDescription", { count: props.provider.actions.length })}</p>
            </div>
          </div>
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
        </section>
      </div>
    </div>
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
  return authTypeLabel(auth.type, t);
}

function providerAuthTypeLabels(provider: ProviderDefinition, t: (key: string) => string): string[] {
  const authTypes = provider.authTypes.length > 0 ? provider.authTypes : provider.auth.map((auth) => auth.type);
  return [...new Set(authTypes)].map((authType) => authTypeLabel(authType, t));
}

function authTypeLabel(authType: string, t: (key: string) => string): string {
  if (authType === "api_key") return t("providers.authLabels.apiKey");
  if (authType === "oauth2") return t("providers.authLabels.oauth");
  if (authType === "custom_credential") return t("providers.authLabels.custom");
  if (authType === "no_auth") return t("providers.authLabels.noAuth");
  return authType;
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
    <form className="form-grid connection-form" onSubmit={(event) => void submit(event)}>
      {props.auth.type === "no_auth" ? (
        <Alert variant="success">
          <CheckCircle2 size={16} />
          <AlertDescription>{t("providers.connectionMessages.noAuth")}</AlertDescription>
        </Alert>
      ) : null}
      {props.auth.type === "oauth2" ? (
        <Alert variant={needsOAuthClient ? "warning" : "default"}>
          {needsOAuthClient ? <Settings size={16} /> : <ExternalLink size={16} />}
          <AlertDescription>
            {needsOAuthClient
              ? t("providers.connectionMessages.needsOAuthClient", { name: props.provider.displayName })
              : connected
                ? t("providers.connectionMessages.connectedOAuth", { name: props.provider.displayName })
                : t("providers.connectionMessages.connectOAuth", { name: props.provider.displayName })}
          </AlertDescription>
        </Alert>
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
            <Button type="button" onClick={props.onConfigureOAuthClient}>
              <Settings size={16} />
              {t("providers.buttons.configureOAuthClient")}
            </Button>
          ) : (
            <Button type="submit" disabled={!canSubmit}>
              {props.auth.type === "oauth2" ? <ExternalLink size={16} /> : <Check size={16} />}
              {submitLabel}
            </Button>
          )}
          {shouldShowDisconnectAction(props.connection) ? (
            <Button variant="outline" type="button" onClick={() => void disconnect()}>
              <Trash2 size={16} />
              {t("providers.buttons.disconnect")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {status ? <FormStatus message={status} /> : null}
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
          <Button variant="outline" size="sm" type="button" onClick={props.onToggle}>
            <Settings size={14} />
            {props.expanded
              ? t("common.close")
              : t(props.config ? "providers.buttons.editOAuthClient" : "providers.buttons.configureOAuthClient")}
          </Button>
          {props.config ? (
            <Button variant="outline" size="sm" type="button" onClick={() => void reset()}>
              <Trash2 size={14} />
              {t("providers.buttons.resetOAuthClient")}
            </Button>
          ) : null}
        </div>
      </div>
      {status ? <FormStatus message={status} /> : null}
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
      <Label className="field">
        <span>{t("providers.oauthClientSettings.clientId")}</span>
        <Input value={clientId} onChange={(event) => setClientId(event.target.value)} />
      </Label>
      <Label className="field">
        <span>{t("providers.oauthClientSettings.clientSecret")}</span>
        <Input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
        {props.config ? <small>{t("providers.oauthClientSettings.storedSecretHint")}</small> : null}
      </Label>
      <div className="button-row">
        <Button type="submit">
          <Settings size={16} />
          {props.config ? t("providers.buttons.updateOAuthClient") : t("providers.buttons.saveOAuthClient")}
        </Button>
      </div>
      {status ? <FormStatus message={status} /> : null}
    </form>
  );
}

function CredentialInput(props: { field: CredentialField; value: string; onChange(value: string): void }): ReactNode {
  return (
    <Label className="field">
      <span>{props.field.label}</span>
      {props.field.inputType === "textarea" || props.field.inputType === "json" ? (
        <Textarea
          className="min-h-24 resize-y font-mono text-xs leading-relaxed"
          value={props.value}
          placeholder={props.field.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          spellCheck={false}
        />
      ) : (
        <Input
          type={props.field.secret ? "password" : "text"}
          placeholder={props.field.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.field.description ? <small>{props.field.description}</small> : null}
    </Label>
  );
}

function filterProvidersByStatus(
  providers: ProviderDefinition[],
  status: ProviderStatusFilter,
  statusByService: Map<string, ProviderConnectionStatus>,
): ProviderDefinition[] {
  if (status === "all") return providers;
  return providers.filter((provider) => {
    const providerStatus = statusByService.get(provider.service);
    if (status === "connected") return providerStatus?.connected === true;
    if (status === "not_connected") return providerStatus?.connected !== true;
    return providerStatus?.oauthClientRequired === true;
  });
}

function countProvidersForStatus(
  providers: ProviderDefinition[],
  status: ProviderStatusFilter,
  statusByService: Map<string, ProviderConnectionStatus>,
): number {
  return filterProvidersByStatus(providers, status, statusByService).length;
}

export function providerBrowserResetKey(query: string, status: ProviderStatusFilter): string {
  return `${query}\u0000${status}`;
}

function compactProviderCount(value: number): string {
  return compactNumberFormatter.format(value);
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
