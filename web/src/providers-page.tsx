import type {
  AppData,
  AuthDefinition,
  ConnectionRecord,
  MarketplaceState,
  OAuthConfig,
  ProviderConnectionStatus,
  ProviderDefinition,
  ProviderScenario,
} from "./model";
import type { CSSProperties, ComponentType, ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash2,
  Cloud,
  Database,
  ExternalLink,
  KeyRound,
  Megaphone,
  MessagesSquare,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  SquareKanban,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { defaultMarketplaceDiscoveryUrl, isDefaultMarketplace } from "../../src/marketplace/default-marketplace";
import { apiDelete, apiPost, apiPut } from "./api";
import { CredentialInput } from "./credential-input";
import { DefaultMarketplaceCatalog } from "./default-marketplace-catalog";
import { loadDefaultMarketplaceCatalog } from "./default-marketplace-discovery";
import { MarketplacePage } from "./marketplace-page";
import {
  credentialFieldsFor,
  filterProviders,
  filterProvidersByCategory,
  providerCategoryCounts,
  resolveProviderConnectionStatus,
  sortProviders,
  usableConnectionsForService,
} from "./model";
import {
  clientConfigFieldsFor,
  initialClientConfigFieldValues,
  OAuthAppDialog,
  splitClientConfigFieldValues,
} from "./oauth-app-form";
import { useOAuthAuthorizationOptions } from "./oauth-authorization-options";
import { usesSaasOAuth, watchOAuthRequest } from "./oauth-connection-request";
import { OneKeyProviderOption } from "./onekey-provider-option";
import { isOneKeyPromotionHidden, setOneKeyPromotionHidden } from "./onekey-visibility";
import {
  featuredProvidersForScenario,
  filterProvidersByScenario,
  providerScenario,
  providerScenarioCounts,
  providerScenarioOptions,
} from "./provider-scenarios";
import { Badge, EmptyState, FormStatus, ProviderIcon, TagList } from "./shared-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ProvidersPageProps {
  data: AppData;
  onRefresh(): void;
}

interface ProviderDetailProps {
  provider: ProviderDefinition;
  marketplace?: MarketplaceState;
  connections: ConnectionRecord[];
  connectionStatus: ProviderConnectionStatus;
  oauthConfig?: OAuthConfig;
  onRefresh(): void;
}

interface ProviderBrowserProps {
  data: AppData;
  onRefresh(): void;
}

interface HostedAccessCardProps {
  marketplace?: MarketplaceState;
  officialMarketplace: boolean;
  previewOpen: boolean;
  serviceCount: number;
  onPreview(): void;
  onHide(): void;
  onConnect(): void;
}

interface ProviderCardProps {
  provider: ProviderDefinition;
  status: ProviderConnectionStatus;
  oneKeyAvailable: boolean;
  officialMarketplace: boolean;
}

interface ProviderScenarioGridProps {
  counts: Map<ProviderScenario, number>;
  providers: ProviderDefinition[];
  onSelect(scenario: ProviderDiscoveryScenario): void;
}

interface ProviderCatalogProps {
  counts: Array<{ id: ProviderStatusFilter; labelKey: string; count: number }>;
  categoryOptions: Array<{ category: string; count: number }>;
  categoryFilter: string;
  filtersActive: boolean;
  hasMoreProviders: boolean;
  loadMoreProviders(): void;
  loadMoreProvidersRef: (node: HTMLDivElement | null) => void;
  providers: ProviderDefinition[];
  query: string;
  scenarioFilter?: ProviderDiscoveryScenario | "all";
  showStatusFilters: boolean;
  showBrandNotice: boolean;
  emptyTitleKey?: string;
  emptyDescriptionKey?: string;
  statusByService: Map<string, ProviderConnectionStatus>;
  oneKeyServices: Set<string>;
  officialMarketplace: boolean;
  providerCount: number;
  selected: ProviderStatusFilter;
  totalProviderCount: number;
  onReset(): void;
  onCategoryFilterChange(value: string): void;
  onQueryChange(value: string): void;
  onScenarioFilterClear?(): void;
  onStatusFilterChange?(value: ProviderStatusFilter): void;
}

interface ConnectionFormProps {
  provider: ProviderDefinition;
  auth: AuthDefinition;
  connectionName: string;
  connectionNameValid: boolean;
  connection?: AppData["connections"][number];
  oauthConfig?: OAuthConfig;
  oauthClientMode: OAuthClientMode;
  onRefresh(): void;
  onConfigureOAuthClient(): void;
  onOAuthClientModeChange(mode: OAuthClientMode): void;
  onConnectionPendingChange?(connectionName?: string): void;
}

interface ConnectionManagerProps {
  connections: ConnectionRecord[];
  selectedConnectionName?: string;
  creating: boolean;
  newConnectionName: string;
  newConnectionNameError?: "required" | "invalid" | "duplicate";
  canAdd: boolean;
  onSelect(connectionName: string): void;
  onAdd(): void;
  onCancel(): void;
  onClearSelection(): void;
  onNewConnectionNameChange(connectionName: string): void;
}

type OAuthClientMode = "configured" | "manual";

export interface ManualOAuthClientValues {
  clientId: string;
  clientSecret: string;
  extraValues: Record<string, string>;
}

export interface OAuthAuthorizationRequestBody {
  service: string;
  connectionName: string;
  clientId?: string;
  clientSecret?: string;
  extra?: Record<string, string>;
  secretExtra?: Record<string, string>;
  authorizationOptionIds?: string[];
}

export interface ManualOAuthAuthorizationInput {
  auth: Extract<AuthDefinition, { type: "oauth2" }>;
  values: ManualOAuthClientValues;
}

type ProviderStatusFilter = "all" | "connected" | "one_key" | "no_setup" | "not_connected" | "oauth_needs_config";
type ProviderBrowserView = "manage" | "discover";
type ManagedSourceFilter = "all" | "built_in" | "own_key";
type ProviderDiscoveryScenario = Exclude<ProviderScenario, "other">;

const providerPageSize = 48;
const defaultConnectionName = "default";
const connectionNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
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
const scenarioIconById: Record<ProviderDiscoveryScenario, ComponentType<{ className?: string }>> = {
  ai: Bot,
  "cross-border-ecommerce": ShoppingBag,
  investment: TrendingUp,
  communication: MessagesSquare,
  productivity: SquareKanban,
  marketing: Megaphone,
  "data-storage": Database,
  developer: Cloud,
};

export function ProvidersPage(props: ProvidersPageProps): ReactNode {
  const params = useParams();
  const routeProvider = params.service
    ? props.data.providers.find((provider) => provider.service === params.service)
    : undefined;

  if (!params.service) {
    return <ProviderBrowser data={props.data} onRefresh={props.onRefresh} />;
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
      key={routeProvider.service}
      provider={routeProvider}
      marketplace={props.data.marketplace}
      connections={configurableConnectionsForProvider(props.data.connections, routeProvider.service)}
      connectionStatus={connectionStatus}
      oauthConfig={oauthConfigForProvider(props.data.oauthConfigs, routeProvider.service)}
      onRefresh={props.onRefresh}
    />
  );
}

function ProviderBrowser(props: ProviderBrowserProps): ReactNode {
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showHostedSettings = searchParams.get("onekey") === "1";
  const showHostedOverview = searchParams.get("onekey") === "overview";
  const showSupportedFeatures =
    !showHostedOverview && (searchParams.get("features") === "1" || searchParams.get("onekey") === "features");
  const [oneKeyHidden, setOneKeyHidden] = useState(isOneKeyPromotionHidden);
  const showHostedCard =
    (props.data.marketplace?.status !== "available" && (!oneKeyHidden || props.data.marketplace?.configured)) ||
    showHostedOverview ||
    showHostedSettings ||
    showSupportedFeatures;
  const hiddenNoticeId = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    return () => {
      if (hiddenNoticeId.current !== undefined) toast.dismiss(hiddenNoticeId.current);
    };
  }, []);
  useEffect(() => {
    if (!showHostedSettings && !showHostedOverview) return;
    setOneKeyHidden(false);
    setOneKeyPromotionHidden(false);
    if (hiddenNoticeId.current !== undefined) toast.dismiss(hiddenNoticeId.current);
  }, [showHostedOverview, showHostedSettings]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<ProviderBrowserView>("discover");
  const [managedSource, setManagedSource] = useState<ManagedSourceFilter>("all");
  const [oneKeyServices, setOneKeyServices] = useState<Set<string>>(() => new Set());
  const officialMarketplace = isDefaultMarketplace(
    props.data.marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl,
  );

  useEffect(() => {
    if (!officialMarketplace || (oneKeyHidden && !props.data.marketplace?.configured && !showSupportedFeatures)) return;
    const controller = new AbortController();
    void loadDefaultMarketplaceCatalog(defaultMarketplaceDiscoveryUrl, controller.signal).then(
      (catalog) => {
        const actions = new Set(catalog.actions);
        setOneKeyServices(
          new Set(
            props.data.providers
              .filter((provider) => provider.actions.some((action) => actions.has(action.id)))
              .map((provider) => provider.service),
          ),
        );
      },
      () => setOneKeyServices(new Set()),
    );
    return () => controller.abort();
  }, [
    officialMarketplace,
    oneKeyHidden,
    props.data.marketplace?.configured,
    props.data.providers,
    showSupportedFeatures,
  ]);
  const [statusFilter, setStatusFilter] = useState<ProviderStatusFilter>("all");
  const [scenarioFilter, setScenarioFilter] = useState<ProviderDiscoveryScenario | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const resetKey = providerBrowserResetKey(deferredQuery, statusFilter, categoryFilter, scenarioFilter, view);
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
  const managedProviders = useMemo(
    () => sortedProviders.filter((provider) => statusByService.get(provider.service)?.connected),
    [sortedProviders, statusByService],
  );
  const sourceManagedProviders = managedProviders.filter((provider) => {
    const connections = statusByService.get(provider.service)?.connections ?? [];
    return (
      managedSource === "all" ||
      (managedSource === "built_in" && connections.some((connection) => connection.authType === "marketplace")) ||
      (managedSource === "own_key" && connections.some((connection) => connection.authType !== "marketplace"))
    );
  });
  const browserProviders = view === "manage" ? sourceManagedProviders : sortedProviders;
  const searchedProviders = filterProviders(browserProviders, deferredQuery);
  const scenarioFilteredProviders = filterProvidersByScenario(searchedProviders, scenarioFilter);
  const categoryFilteredProviders = filterProvidersByCategory(scenarioFilteredProviders, categoryFilter);
  const statusFilteredProviders =
    view === "manage"
      ? scenarioFilteredProviders
      : filterProvidersByStatus(scenarioFilteredProviders, statusFilter, statusByService, oneKeyServices);
  const visibleProviders = filterProvidersByCategory(statusFilteredProviders, categoryFilter);
  const {
    hasMore: hasMoreProviders,
    limit: visibleLimit,
    loadMore: loadMoreProviders,
  } = useProgressiveProviderLimit(visibleProviders.length, resetKey);
  const loadMoreProvidersRef = useIntersectionLoader(hasMoreProviders, loadMoreProviders);
  const renderedProviders = visibleProviders.slice(0, visibleLimit);
  const filtersActive =
    query.trim().length > 0 || scenarioFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all";
  const statusCounts = useMemo(
    () =>
      providerStatusOptions
        .filter((option) => !oneKeyHidden || option.id !== "one_key")
        .map((option) => ({
          ...option,
          count: countProvidersForStatus(categoryFilteredProviders, option.id, statusByService, oneKeyServices),
        })),
    [categoryFilteredProviders, oneKeyHidden, oneKeyServices, statusByService],
  );
  const categoryCounts = useMemo(() => providerCategoryCounts(statusFilteredProviders), [statusFilteredProviders]);
  const categoryOptions = useMemo(
    () =>
      [
        ...categoryCounts.entries(),
        ...(categoryFilter !== "all" && !categoryCounts.has(categoryFilter) ? [[categoryFilter, 0] as const] : []),
      ]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([category, count]) => ({ category, count })),
    [categoryCounts, categoryFilter],
  );
  const scenarioCounts = useMemo(() => providerScenarioCounts(sortedProviders), [sortedProviders]);

  function resetFilters(): void {
    setQuery("");
    setStatusFilter("all");
    setScenarioFilter("all");
    setCategoryFilter("all");
  }

  function selectView(nextView: ProviderBrowserView): void {
    setView(nextView);
    setQuery("");
    setStatusFilter("all");
    setScenarioFilter("all");
    setCategoryFilter("all");
  }

  function openHostedSettings(): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (next.get("onekey") === "features") next.set("features", "1");
      next.set("onekey", "1");
      return next;
    });
  }

  function closeHostedSettings(): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (next.get("onekey") === "1") next.delete("onekey");
      return next;
    });
  }

  function selectScenario(scenario: ProviderDiscoveryScenario): void {
    setView("discover");
    setQuery("");
    setStatusFilter("all");
    setScenarioFilter(scenario);
    setCategoryFilter("all");
  }

  return (
    <Tabs
      value={view}
      onValueChange={(value) => selectView(value as ProviderBrowserView)}
      className="provider-browser-tabs"
    >
      <TabsList variant="line" className="provider-browser-tabs-list" aria-label={t("providers.viewLabel")}>
        <TabsTrigger value="discover" className="flex-none px-4">
          {t("providers.views.discover")} <span className="provider-view-count">{sortedProviders.length}</span>
        </TabsTrigger>
        <TabsTrigger value="manage" className="flex-none px-4">
          {t("providers.views.manage")} <span className="provider-view-count">{managedProviders.length}</span>
        </TabsTrigger>
      </TabsList>
      {showHostedCard ? (
        <div className="provider-hosted-section">
          <HostedAccessCard
            marketplace={props.data.marketplace}
            officialMarketplace={officialMarketplace}
            previewOpen={showSupportedFeatures}
            serviceCount={oneKeyServices.size}
            onPreview={() =>
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (next.get("onekey") === "features" || next.get("onekey") === "overview") next.delete("onekey");
                if (showSupportedFeatures) next.delete("features");
                else next.set("features", "1");
                return next;
              })
            }
            onHide={() => {
              setOneKeyHidden(true);
              setOneKeyPromotionHidden(true);
              if (hiddenNoticeId.current !== undefined) toast.dismiss(hiddenNoticeId.current);
              hiddenNoticeId.current = toast(t("providers.hostedAccess.hiddenTitle"), {
                description: t("providers.hostedAccess.hiddenNotice"),
                duration: 8_000,
                action: {
                  label: t("common.undo"),
                  onClick: () => {
                    setOneKeyHidden(false);
                    setOneKeyPromotionHidden(false);
                    if (props.data.marketplace?.status === "available") {
                      setSearchParams((current) => {
                        const next = new URLSearchParams(current);
                        next.set("onekey", "overview");
                        return next;
                      });
                    }
                  },
                },
              });
              setStatusFilter("all");
              setSearchParams({});
            }}
            onConnect={openHostedSettings}
          />
          {showSupportedFeatures && officialMarketplace ? (
            <DefaultMarketplaceCatalog
              embedded
              providers={props.data.providers}
              discoveryUrl={defaultMarketplaceDiscoveryUrl}
              connected={props.data.marketplace?.status === "available"}
            />
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={showHostedSettings}
        onOpenChange={(open) => {
          if (!open) closeHostedSettings();
        }}
      >
        <DialogContent className="onekey-connection-dialog">
          <DialogHeader>
            <DialogTitle>
              {t(
                officialMarketplace
                  ? props.data.marketplace?.configured
                    ? "providers.hostedAccess.manage"
                    : "marketplace.oneKey.connectTitle"
                  : "marketplace.configuration.title",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                officialMarketplace ? "marketplace.oneKey.connectDescription" : "marketplace.configuration.description",
              )}
            </DialogDescription>
          </DialogHeader>
          <MarketplacePage
            data={props.data}
            embedded
            onRefresh={props.onRefresh}
            onCancel={closeHostedSettings}
            onConnected={() => {
              selectView("manage");
              closeHostedSettings();
            }}
          />
        </DialogContent>
      </Dialog>
      <TabsContent value="manage" className="provider-browser-tab-content flex flex-col gap-4">
        {view === "manage" ? (
          <>
            {managedProviders.length > 0 ? (
              <ToggleGroup
                className="provider-managed-sources"
                type="single"
                value={managedSource}
                onValueChange={(value) => {
                  if (value) setManagedSource(value as ManagedSourceFilter);
                }}
                aria-label={t("providers.managedSources.label")}
              >
                <ToggleGroupItem value="all">
                  {t("providers.managedSources.all")} {managedProviders.length}
                </ToggleGroupItem>
                <ToggleGroupItem value="built_in">
                  {t(officialMarketplace ? "providers.managedSources.builtIn" : "providers.marketplaceBadge")}{" "}
                  {
                    managedProviders.filter((provider) => statusByService.get(provider.service)?.marketplaceConnection)
                      .length
                  }
                </ToggleGroupItem>
                <ToggleGroupItem value="own_key">
                  {t("providers.managedSources.ownKey")}{" "}
                  {
                    managedProviders.filter((provider) =>
                      statusByService
                        .get(provider.service)
                        ?.connections.some((connection) => connection.authType !== "marketplace"),
                    ).length
                  }
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
            <ProviderCatalog
              categoryFilter={categoryFilter}
              categoryOptions={categoryOptions}
              filtersActive={filtersActive}
              hasMoreProviders={hasMoreProviders}
              loadMoreProviders={loadMoreProviders}
              loadMoreProvidersRef={loadMoreProvidersRef}
              onCategoryFilterChange={setCategoryFilter}
              onQueryChange={setQuery}
              onReset={resetFilters}
              providerCount={renderedProviders.length}
              providers={renderedProviders}
              query={query}
              showStatusFilters={false}
              showBrandNotice={false}
              emptyTitleKey="providers.managedEmpty.title"
              emptyDescriptionKey="providers.managedEmpty.description"
              statusByService={statusByService}
              oneKeyServices={oneKeyHidden ? new Set() : oneKeyServices}
              officialMarketplace={officialMarketplace}
              counts={statusCounts}
              selected={statusFilter}
              totalProviderCount={visibleProviders.length}
            />
          </>
        ) : null}
      </TabsContent>
      <TabsContent value="discover" className="provider-browser-tab-content flex flex-col gap-6">
        {view === "discover" ? (
          <>
            {!query.trim() ? (
              <ProviderScenarioGrid counts={scenarioCounts} providers={sortedProviders} onSelect={selectScenario} />
            ) : null}
            <ProviderCatalog
              categoryFilter={categoryFilter}
              categoryOptions={categoryOptions}
              filtersActive={filtersActive}
              hasMoreProviders={hasMoreProviders}
              loadMoreProviders={loadMoreProviders}
              loadMoreProvidersRef={loadMoreProvidersRef}
              onCategoryFilterChange={setCategoryFilter}
              onQueryChange={setQuery}
              onReset={resetFilters}
              onStatusFilterChange={setStatusFilter}
              providerCount={renderedProviders.length}
              providers={renderedProviders}
              query={query}
              scenarioFilter={scenarioFilter}
              showStatusFilters
              showBrandNotice
              statusByService={statusByService}
              oneKeyServices={oneKeyHidden ? new Set() : oneKeyServices}
              officialMarketplace={officialMarketplace}
              counts={statusCounts}
              selected={statusFilter}
              totalProviderCount={visibleProviders.length}
              onScenarioFilterClear={() => setScenarioFilter("all")}
            />
          </>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}

function HostedAccessCard(props: HostedAccessCardProps): ReactNode {
  const t = useTranslate();
  const available = props.marketplace?.status === "available";
  const sourceName = props.officialMarketplace
    ? "OOMOL Key"
    : (props.marketplace?.marketplace?.name ?? t("nav.marketplace"));

  return (
    <section className="provider-hosted-access" aria-labelledby="provider-hosted-access-title">
      <div className="provider-hosted-access-icon">
        <KeyRound size={20} aria-hidden="true" />
      </div>
      <div className="provider-hosted-access-copy">
        <div className="provider-hosted-access-title">
          <h2 id="provider-hosted-access-title">{sourceName}</h2>
          {props.marketplace?.configured ? (
            <Badge tone={available ? "success" : "warning"}>
              {t(`marketplace.status.${props.marketplace.status}`)}
            </Badge>
          ) : null}
        </div>
        <p>
          {t(
            props.marketplace?.configured
              ? props.officialMarketplace
                ? "providers.hostedAccess.connected"
                : "providers.hostedAccess.connectedCustom"
              : "providers.hostedAccess.intro",
          )}
        </p>
      </div>
      <div className="provider-hosted-access-actions">
        {props.officialMarketplace ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onPreview}
            aria-expanded={props.previewOpen}
            aria-controls="onekey-supported-features"
          >
            {t("providers.hostedAccess.features")}
            {props.serviceCount > 0 ? ` (${props.serviceCount})` : ""}
            <ChevronDown
              className={props.previewOpen ? "provider-hosted-chevron-open" : undefined}
              size={15}
              aria-hidden="true"
            />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={props.marketplace?.configured ? "outline" : "default"}
          onClick={props.onConnect}
        >
          {t(props.marketplace?.configured ? "providers.hostedAccess.manage" : "providers.hostedAccess.connect")}
        </Button>
        {!props.marketplace?.configured || available ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={props.onHide}
            aria-label={t("providers.hostedAccess.hide")}
            title={t("providers.hostedAccess.hide")}
          >
            <X size={15} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
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

function ProviderScenarioGrid(props: ProviderScenarioGridProps): ReactNode {
  const t = useTranslate();

  return (
    <section className="provider-scenario-section" aria-labelledby="provider-discovery-heading">
      <h2 id="provider-discovery-heading">{t("providers.discovery.browseByTask")}</h2>
      <div className="provider-scenario-grid">
        {providerScenarioOptions.map((scenario) => {
          const Icon = scenarioIconById[scenario.id];
          const scenarioProviders = featuredProvidersForScenario(
            props.providers.filter((provider) => providerScenario(provider) === scenario.id),
            scenario,
          );

          return (
            <Button
              key={scenario.id}
              type="button"
              variant="ghost"
              className="provider-scenario-card"
              onClick={() => props.onSelect(scenario.id)}
            >
              <span className="provider-scenario-card-main">
                <span className="provider-scenario-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="provider-scenario-copy">
                  <span className="provider-scenario-title">{t(scenario.titleKey)}</span>
                  <span className="provider-scenario-description">{t(scenario.descriptionKey)}</span>
                </span>
                <span className="provider-scenario-count">
                  {compactProviderCount(props.counts.get(scenario.id) ?? 0)}
                </span>
              </span>
              <span className="provider-scenario-card-footer">
                <span className="provider-scenario-featured" aria-hidden="true">
                  {scenarioProviders.map((provider) => (
                    <ProviderIcon key={provider.service} provider={provider} />
                  ))}
                </span>
                <span className="provider-scenario-action">{t("providers.discovery.explore")}</span>
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function ProviderCatalog(props: ProviderCatalogProps): ReactNode {
  const t = useTranslate();

  return (
    <section className="provider-browser-panel">
      <div className="provider-browser-header">
        <h2>{t("providers.catalogTitle")}</h2>
        <label className="relative flex w-full max-w-80 items-center sm:w-80">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <Input
            className="h-8 pl-9 text-sm"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={t("providers.searchPlaceholder")}
            aria-label={t("providers.searchPlaceholder")}
          />
        </label>
      </div>
      <div className="provider-collection-bar">
        {props.showStatusFilters ? (
          <ToggleGroup
            className="provider-filter-list"
            type="single"
            value={props.selected}
            onValueChange={(value) => {
              if (value) props.onStatusFilterChange?.(value as ProviderStatusFilter);
            }}
            aria-label={t("providers.statusFilterLabel")}
          >
            {props.counts.map((option) => (
              <ToggleGroupItem
                key={option.id}
                value={option.id}
                className="h-8 gap-2 rounded-md border px-3 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:[&>span:last-child]:text-primary-foreground/70 [&>span:last-child]:min-w-8 [&>span:last-child]:text-right [&>span:last-child]:text-xs [&>span:last-child]:text-muted-foreground [&>span:last-child]:tabular-nums"
                disabled={option.count === 0 && option.id !== "all"}
              >
                <span>{t(option.labelKey)}</span>
                <span>{compactProviderCount(option.count)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <Select value={props.categoryFilter} onValueChange={props.onCategoryFilterChange}>
          <SelectTrigger
            className="h-8 w-48 rounded-md border px-3 text-sm"
            size="sm"
            aria-label={t("providers.categoryFilterLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="p-1" position="popper" align="start">
            <SelectItem value="all">{t("providers.categories.all")}</SelectItem>
            {props.categoryOptions.map((option) => (
              <SelectItem key={option.category} value={option.category}>
                {option.category} ({compactProviderCount(option.count)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.scenarioFilter && props.scenarioFilter !== "all" ? (
          <Button variant="outline" size="xs" type="button" onClick={props.onScenarioFilterClear}>
            {t(`providers.discovery.scenarios.${scenarioTranslationKey(props.scenarioFilter)}.title`)}
            <X data-icon="inline-end" />
          </Button>
        ) : null}
        <div className="provider-result-meta">
          <span>
            {t("providers.resultCount", {
              shown: props.providerCount,
              total: props.totalProviderCount,
            })}
          </span>
          {props.filtersActive ? (
            <Button variant="ghost" size="xs" type="button" onClick={props.onReset}>
              <X data-icon="inline-start" />
              {t("providers.resetFilters")}
            </Button>
          ) : null}
        </div>
      </div>

      {props.showBrandNotice ? <p className="provider-brand-notice">{t("providers.brandNotice")}</p> : null}

      {props.providers.length === 0 ? (
        <div className="provider-empty-row">
          <EmptyState
            title={t(props.emptyTitleKey ?? "providers.noProvidersTitle")}
            description={t(props.emptyDescriptionKey ?? "providers.noProvidersDescription")}
          />
          {props.filtersActive ? (
            <Button variant="outline" size="sm" type="button" onClick={props.onReset}>
              <X data-icon="inline-start" />
              {t("providers.resetFilters")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="provider-card-grid">
          {props.providers.map((provider) => (
            <ProviderCard
              key={provider.service}
              provider={provider}
              status={props.statusByService.get(provider.service) ?? resolveProviderConnectionStatus(provider, [], [])}
              oneKeyAvailable={props.oneKeyServices.has(provider.service)}
              officialMarketplace={props.officialMarketplace}
            />
          ))}
          {props.hasMoreProviders ? (
            <div ref={props.loadMoreProvidersRef} className="provider-show-more">
              <Button variant="outline" size="sm" type="button" onClick={props.loadMoreProviders}>
                {t("providers.showMore")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function scenarioTranslationKey(scenario: ProviderDiscoveryScenario): string {
  return scenario === "cross-border-ecommerce"
    ? "crossBorderEcommerce"
    : scenario === "data-storage"
      ? "dataStorage"
      : scenario;
}

function ProviderCard(props: ProviderCardProps): ReactNode {
  const t = useTranslate();
  const to = `/providers/${encodeURIComponent(props.provider.service)}`;
  const locallyAvailable = isProviderLocallyAvailable(props.provider) || Boolean(props.status.marketplaceConnection);

  return (
    <Link className="provider-card" style={providerCardStyle} to={to}>
      <span className="provider-card-main">
        <ProviderIcon provider={props.provider} />
        <span className="provider-card-info">
          <span className="provider-card-title-row">
            <span className="provider-card-title">{props.provider.displayName || props.provider.service}</span>
            <ProviderStatusBadges
              status={props.status}
              locallyAvailable={locallyAvailable}
              officialMarketplace={props.officialMarketplace}
              compact
              includeDisconnected
            />
            {props.oneKeyAvailable && !props.status.connected ? <Badge>{t("providers.oneKey.available")}</Badge> : null}
          </span>
        </span>
      </span>
      <ChevronRight className="provider-card-chevron" size={15} aria-hidden="true" />
    </Link>
  );
}

function ProviderStatusBadges(props: {
  status: ProviderConnectionStatus;
  locallyAvailable: boolean;
  officialMarketplace?: boolean;
  compact?: boolean;
  includeDisconnected?: boolean;
}): ReactNode {
  const t = useTranslate();
  const badges: ReactNode[] = [];

  if (!props.locallyAvailable) {
    return (
      <span className="provider-status-badges">
        <Badge tone="warning">
          {props.compact ? <CircleSlash2 size={12} /> : null}
          {t("providers.runtimeUnavailableBadge")}
        </Badge>
      </span>
    );
  }

  if (props.status.connected) {
    badges.push(
      <Badge key="connected" tone="success">
        {props.compact ? <CheckCircle2 size={12} /> : null}
        {t("providers.configuredBadge")}
      </Badge>,
    );
    if (props.status.marketplaceConnection) {
      badges.push(
        <Badge key="marketplace">
          {t(props.officialMarketplace ? "providers.oneKey.builtIn" : "providers.marketplaceBadge")}
        </Badge>,
      );
    }
    if (props.status.connections.length > 1) {
      badges.push(
        <Badge key="connection-count">
          {t("providers.connectionCount", { count: props.status.connections.length })}
        </Badge>,
      );
    }
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
  const [selectedConnectionName, setSelectedConnectionName] = useState<string>();
  const [creatingConnection, setCreatingConnection] = useState(props.connections.length === 0);
  const [newConnectionName, setNewConnectionName] = useState(
    props.connections.length === 0 ? defaultConnectionName : "",
  );
  const [pendingConnectionName, setPendingConnectionName] = useState<string>();
  const selectedConnection =
    !creatingConnection && selectedConnectionName
      ? connectionByName(props.connections, selectedConnectionName)
      : undefined;
  const [selectedAuthType, setSelectedAuthType] = useState(() => initialAuthType(props.provider, selectedConnection));
  const [oauthAppDialogOpen, setOAuthAppDialogOpen] = useState(false);
  const [oauthClientMode, setOAuthClientMode] = useState<OAuthClientMode>("configured");
  const changeOAuthClientMode = useCallback((mode: OAuthClientMode) => setOAuthClientMode(mode), []);
  const selectedAuth = props.provider.auth.find((auth) => auth.type === selectedAuthType) ?? props.provider.auth[0];
  const oauthAuth = props.provider.auth.find((auth) => auth.type === "oauth2");
  const hasMultipleAuthMethods = props.provider.auth.length > 1;
  const locallyAvailable =
    isProviderLocallyAvailable(props.provider) ||
    Boolean(props.connectionStatus.marketplaceConnection) ||
    props.oauthConfig?.oauthSource?.mode === "saas" ||
    Boolean(selectedConnection?.saas);
  const supportsCredentialConnections = props.provider.auth.some((auth) => shouldShowConnectionActions(auth));
  const connectionEditorOpen = !supportsCredentialConnections || creatingConnection || selectedConnection != null;
  const formConnectionName = creatingConnection ? newConnectionName.trim() : (selectedConnectionName ?? "");
  const newConnectionNameError = creatingConnection
    ? validateNewConnectionName(newConnectionName, props.connections)
    : undefined;
  const connectionDescription = !locallyAvailable
    ? t("providers.connectionDescriptions.unavailable")
    : props.connectionStatus.noSetupRequired
      ? t("providers.connectionDescriptions.noSetup")
      : creatingConnection
        ? t("providers.connectionDescriptions.adding")
        : selectedConnection
          ? t("providers.connectionDescriptions.connected", {
              authType: selectedConnection.authType,
            })
          : props.connectionStatus.connected
            ? t("providers.connectionDescriptions.saved", { count: props.connections.length })
            : props.connectionStatus.oauthClientRequired
              ? t("providers.connectionDescriptions.oauthClientRequired", { name: props.provider.displayName })
              : t("providers.connectionDescriptions.notConnected", { name: props.provider.displayName });

  useEffect(() => {
    if (creatingConnection && pendingConnectionName) {
      const createdConnection = connectionByName(props.connections, pendingConnectionName);
      if (createdConnection) {
        setSelectedConnectionName(pendingConnectionName);
        setCreatingConnection(false);
        setNewConnectionName("");
        setPendingConnectionName(undefined);
        setSelectedAuthType(initialAuthType(props.provider, createdConnection));
        setOAuthClientMode("configured");
      }
      return;
    }

    if (!creatingConnection && selectedConnectionName && !connectionByName(props.connections, selectedConnectionName)) {
      if (props.connections.length === 0) {
        setSelectedConnectionName(undefined);
        setCreatingConnection(true);
        setNewConnectionName(defaultConnectionName);
      } else {
        setSelectedConnectionName(undefined);
        setSelectedAuthType(initialAuthType(props.provider, undefined));
        setOAuthClientMode("configured");
      }
      return;
    }

    if (!creatingConnection && !selectedConnectionName && props.connections.length === 0) {
      setCreatingConnection(true);
      setNewConnectionName(defaultConnectionName);
    }
  }, [creatingConnection, pendingConnectionName, props.connections, props.provider, selectedConnectionName]);

  useEffect(() => {
    setSelectedAuthType(initialAuthType(props.provider, selectedConnection));
  }, [props.provider.service, selectedConnection?.authType]);

  function selectConnection(connectionName: string): void {
    const connection = connectionByName(props.connections, connectionName);
    setSelectedConnectionName(connectionName);
    setCreatingConnection(false);
    setNewConnectionName("");
    setSelectedAuthType(initialAuthType(props.provider, connection));
    setOAuthClientMode("configured");
  }

  function startNewConnection(): void {
    setSelectedConnectionName(undefined);
    setCreatingConnection(true);
    setNewConnectionName("");
    setPendingConnectionName(undefined);
    setSelectedAuthType(initialAuthType(props.provider, undefined));
    setOAuthClientMode("configured");
  }

  function cancelNewConnection(): void {
    setCreatingConnection(false);
    setNewConnectionName("");
    setPendingConnectionName(undefined);
    setOAuthClientMode("configured");
  }

  function clearConnectionSelection(): void {
    setSelectedConnectionName(undefined);
    setCreatingConnection(false);
    setNewConnectionName("");
    setPendingConnectionName(undefined);
    setSelectedAuthType(initialAuthType(props.provider, undefined));
    setOAuthClientMode("configured");
  }

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
              <ProviderStatusBadges
                status={props.connectionStatus}
                locallyAvailable={locallyAvailable}
                officialMarketplace={isDefaultMarketplace(
                  props.marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl,
                )}
                includeDisconnected
              />
            </div>
            {props.provider.description ? (
              <p className="provider-detail-description">{props.provider.description}</p>
            ) : null}
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

      <OneKeyProviderOption
        marketplace={props.marketplace}
        provider={props.provider}
        connected={Boolean(props.connectionStatus.marketplaceConnection)}
      />

      <div className="provider-detail-layout">
        <section className="detail-panel provider-detail-card provider-connection-card">
          <div className="provider-panel-title-row">
            <div>
              <h3>{t("providers.connection")}</h3>
              <p>{connectionDescription}</p>
            </div>
          </div>
          {props.connectionStatus.marketplaceConnection ? (
            <div className="provider-marketplace-connection">
              <div>
                <strong>
                  {t(
                    isDefaultMarketplace(props.marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl)
                      ? "providers.oneKey.connectedTitle"
                      : "providers.marketplaceConnection.title",
                  )}
                </strong>
                <span>
                  {t(
                    isDefaultMarketplace(props.marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl)
                      ? "providers.oneKey.connectedDescription"
                      : "providers.marketplaceConnection.description",
                    {
                      name:
                        typeof props.connectionStatus.marketplaceConnection.profile?.displayName === "string"
                          ? props.connectionStatus.marketplaceConnection.profile.displayName
                          : t("nav.marketplace"),
                    },
                  )}
                </span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/providers?onekey=1">
                  {t(
                    isDefaultMarketplace(props.marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl)
                      ? "providers.hostedAccess.manage"
                      : "providers.marketplaceConnection.manage",
                  )}
                </Link>
              </Button>
            </div>
          ) : null}
          {supportsCredentialConnections && (locallyAvailable || props.connections.length > 0) ? (
            <ConnectionManager
              connections={props.connections}
              selectedConnectionName={selectedConnectionName}
              creating={creatingConnection}
              newConnectionName={newConnectionName}
              newConnectionNameError={newConnectionNameError}
              canAdd={locallyAvailable}
              onSelect={selectConnection}
              onAdd={startNewConnection}
              onCancel={cancelNewConnection}
              onClearSelection={clearConnectionSelection}
              onNewConnectionNameChange={setNewConnectionName}
            />
          ) : null}
          {connectionEditorOpen && locallyAvailable && hasMultipleAuthMethods ? (
            <ToggleGroup
              className="auth-method-control bg-muted p-[3px]"
              type="single"
              value={selectedAuth?.type}
              spacing={0}
              aria-label={t("providers.connectionMethod")}
              onValueChange={(value) => {
                if (value) {
                  setSelectedAuthType(value as AuthDefinition["type"]);
                  setOAuthClientMode("configured");
                }
              }}
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
          {!connectionEditorOpen ? null : !locallyAvailable ? (
            <UnavailableProviderConnection
              provider={props.provider}
              connection={selectedConnection}
              connectionName={formConnectionName}
              onRefresh={props.onRefresh}
            />
          ) : selectedAuth ? (
            <ConnectionForm
              key={`${selectedAuth.type}:${creatingConnection ? "new" : selectedConnectionName}`}
              provider={props.provider}
              auth={selectedAuth}
              connection={selectedConnection}
              connectionName={formConnectionName}
              connectionNameValid={!newConnectionNameError}
              oauthConfig={props.oauthConfig}
              oauthClientMode={oauthClientMode}
              onRefresh={props.onRefresh}
              onConfigureOAuthClient={() => setOAuthAppDialogOpen(true)}
              onOAuthClientModeChange={changeOAuthClientMode}
              onConnectionPendingChange={creatingConnection ? setPendingConnectionName : undefined}
            />
          ) : (
            <EmptyState
              title={t("providers.noConnectionMethodTitle")}
              description={t("providers.noConnectionMethodDescription")}
            />
          )}
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
      {oauthAuth ? (
        <OAuthAppDialog
          open={oauthAppDialogOpen}
          provider={props.provider}
          auth={oauthAuth}
          config={props.oauthConfig}
          onOpenChange={setOAuthAppDialogOpen}
          onRefresh={props.onRefresh}
        />
      ) : null}
    </div>
  );
}

export function isProviderLocallyAvailable(provider: ProviderDefinition): boolean {
  return provider.actions.length === 0 || provider.actions.some((action) => action.execution.locallyExecutable);
}

export function shouldShowConnectionActions(auth: AuthDefinition): boolean {
  return auth.type !== "no_auth";
}

export function shouldShowDisconnectAction(connection: AppData["connections"][number] | undefined): boolean {
  return connection != null;
}

export function shouldEnableConnectionSubmit(
  auth: AuthDefinition,
  oauthConfig: OAuthConfig | undefined,
  manualValues?: ManualOAuthClientValues,
): boolean {
  if (auth.type !== "oauth2") {
    return true;
  }
  if (!manualValues) {
    return oauthConfig?.configured ?? false;
  }
  if (!manualValues.clientId.trim()) {
    return false;
  }
  if (
    auth.clientFields?.some((field) => field.key === "clientSecret" && field.required) &&
    !manualValues.clientSecret.trim()
  ) {
    return false;
  }
  return clientConfigFieldsFor(auth).every(
    (field) => !field.required || Boolean(manualValues.extraValues[field.key]?.trim()),
  );
}

export function connectionSubmitLabel(auth: AuthDefinition, connected: boolean, providerName: string): string {
  if (auth.type === "oauth2") {
    return `${connected ? "Reconnect" : "Connect"} ${providerName}`;
  }
  return "Save Connection";
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
  if (auth.type === "custom_credential" && auth.label?.trim()) return auth.label.trim();
  return authTypeLabel(auth.type, t);
}

function providerAuthTypeLabels(provider: ProviderDefinition, t: (key: string) => string): string[] {
  const authTypes = provider.authTypes.length > 0 ? provider.authTypes : provider.auth.map((auth) => auth.type);
  return [...new Set(authTypes)].map((authType) => {
    const auth = provider.auth.find((auth) => auth.type === authType);
    return auth ? authLabel(auth, t) : authTypeLabel(authType, t);
  });
}

function authTypeLabel(authType: string, t: (key: string) => string): string {
  if (authType === "api_key") return t("providers.authLabels.apiKey");
  if (authType === "oauth2") return t("providers.authLabels.oauth");
  if (authType === "custom_credential") return t("providers.authLabels.custom");
  if (authType === "no_auth") return t("providers.authLabels.noAuth");
  return authType;
}

export function configurableConnectionsForProvider(
  connections: ConnectionRecord[],
  service: string,
): ConnectionRecord[] {
  return usableConnectionsForService(connections, service).filter(
    (connection) => connection.authType !== "marketplace",
  );
}

export function connectionDisplayLabel(connection: ConnectionRecord): string {
  const connectionName = connectionNameOf(connection);
  const profileLabel = [connection.profile?.displayName, connection.profile?.accountId].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return profileLabel && profileLabel.trim() !== connectionName
    ? `${connectionName} · ${profileLabel.trim()}`
    : connectionName;
}

export function validateNewConnectionName(
  connectionName: string,
  connections: ConnectionRecord[],
): "required" | "invalid" | "duplicate" | undefined {
  const normalized = connectionName.trim();
  if (!normalized) return "required";
  if (!connectionNamePattern.test(normalized)) return "invalid";
  if (connections.some((connection) => connectionNameOf(connection) === normalized)) return "duplicate";
  return undefined;
}

function connectionNameOf(connection: ConnectionRecord): string {
  return connection.connectionName?.trim() || defaultConnectionName;
}

function connectionByName(connections: ConnectionRecord[], connectionName: string): ConnectionRecord | undefined {
  return connections.find((connection) => connectionNameOf(connection) === connectionName);
}

export function connectionDeletePath(service: string, connectionName: string): string {
  return `/api/connections/${encodeURIComponent(service)}?connectionName=${encodeURIComponent(connectionName)}`;
}

export function credentialConnectionRequestBody(
  authType: "no_auth" | "api_key" | "custom_credential",
  connectionName: string,
  values: Record<string, string>,
): Record<string, unknown> {
  return authType === "no_auth" ? { authType, connectionName } : { authType, connectionName, values };
}

export function oauthAuthorizationRequestBody(
  service: string,
  connectionName: string,
  manual?: ManualOAuthAuthorizationInput,
  authorizationOptionIds?: string[],
): OAuthAuthorizationRequestBody {
  const body: OAuthAuthorizationRequestBody = { service, connectionName, authorizationOptionIds };
  if (manual) {
    const { extra, secretExtra } = splitClientConfigFieldValues(
      clientConfigFieldsFor(manual.auth),
      manual.values.extraValues,
    );
    body.clientId = manual.values.clientId;
    body.clientSecret = manual.values.clientSecret;
    body.extra = extra;
    body.secretExtra = secretExtra;
  }
  return body;
}

function ConnectionManager(props: ConnectionManagerProps): ReactNode {
  const t = useTranslate();
  const inputId = "provider-connection-name";
  const errorId = `${inputId}-error`;

  return (
    <div className="connection-manager">
      {props.connections.length > 0 ? (
        <div className="connection-list" aria-label={t("providers.savedConnections")}>
          {props.connections.map((connection) => {
            const connectionName = connectionNameOf(connection);
            const selected = !props.creating && connectionName === props.selectedConnectionName;
            return (
              <div key={connection.id ?? `${connection.service}:${connectionName}`} className="connection-list-item">
                <div className="connection-list-copy">
                  <div className="connection-list-title">
                    <strong>{connectionDisplayLabel(connection)}</strong>
                    {connectionName === defaultConnectionName ? (
                      <Badge>{t("providers.defaultConnection")}</Badge>
                    ) : null}
                  </div>
                  <small>
                    {authTypeLabel(connection.authType, t)}
                    {connection.authType === "oauth2" ? " · " + t(connection.saas ? "saas.remote" : "saas.local") : ""}
                  </small>
                </div>
                <Button
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  type="button"
                  aria-pressed={selected}
                  disabled={selected}
                  onClick={() => props.onSelect(connectionName)}
                >
                  {t(selected ? "providers.buttons.selected" : "providers.buttons.manageConnection")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {props.creating ? (
        <div className="field connection-manager-new">
          <Label htmlFor={inputId}>{t("providers.connectionName")}</Label>
          <div className="connection-manager-input-row">
            <Input
              id={inputId}
              maxLength={64}
              placeholder={t("providers.connectionNamePlaceholder")}
              required
              aria-invalid={props.newConnectionNameError != null}
              aria-describedby={errorId}
              value={props.newConnectionName}
              onChange={(event) => props.onNewConnectionNameChange(event.target.value)}
            />
            {props.connections.length > 0 ? (
              <Button variant="outline" type="button" onClick={props.onCancel}>
                {t("providers.buttons.cancel")}
              </Button>
            ) : null}
          </div>
          <small id={errorId} className={props.newConnectionNameError ? "field-error" : undefined}>
            {t(
              props.newConnectionNameError
                ? `providers.connectionNameErrors.${props.newConnectionNameError}`
                : "providers.connectionNameDescription",
            )}
          </small>
        </div>
      ) : (
        <div className="connection-manager-actions">
          {props.canAdd ? (
            <Button className="connection-add-button" variant="outline" type="button" onClick={props.onAdd}>
              <Plus size={16} />
              {t("providers.buttons.addConnection")}
            </Button>
          ) : null}
          {props.selectedConnectionName ? (
            <Button variant="ghost" type="button" onClick={props.onClearSelection}>
              <X size={16} />
              {t("providers.buttons.clearSelection")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function UnavailableProviderConnection(props: {
  provider: ProviderDefinition;
  connection?: AppData["connections"][number];
  connectionName: string;
  onRefresh(): void;
}): ReactNode {
  const t = useTranslate();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function disconnect(): Promise<void> {
    setPending(true);
    setStatus(t("providers.connectionMessages.disconnecting"));
    try {
      await apiDelete(connectionDeletePath(props.provider.service, props.connectionName));
      setStatus(null);
      toast.success(t("providers.connectionMessages.disconnectNotice", { name: props.connectionName }), {
        description: props.connection?.saas ? t("providers.connectionMessages.cloudDisconnectNotice") : undefined,
      });
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.connectionMessages.disconnectFailed"));
      toast.error(t("providers.connectionMessages.disconnectFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      <Alert variant="warning">
        <CircleSlash2 size={16} />
        <AlertTitle>{t("providers.runtimeUnavailableTitle")}</AlertTitle>
        <AlertDescription>
          {t("providers.runtimeUnavailableDescription", { name: props.provider.displayName })}
        </AlertDescription>
      </Alert>
      {props.connection ? (
        <div className="button-row">
          <Button variant="outline" type="button" disabled={pending} onClick={() => void disconnect()}>
            <Trash2 size={16} />
            {t("providers.buttons.disconnect")}
          </Button>
        </div>
      ) : null}
      {status ? <FormStatus message={status} /> : null}
    </div>
  );
}

function ConnectionForm(props: ConnectionFormProps): ReactNode {
  const t = useTranslate();
  const remote = props.auth.type === "oauth2" && usesSaasOAuth(props.connection, props.oauthConfig);
  const [pending, setPending] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState<string>();
  const [values, setValues] = useState<Record<string, string>>({});
  const authorizationOptions = props.auth.type === "oauth2" && !remote ? props.auth.authorizationOptions : undefined;
  const { selectedOptionIds: selectedAuthorizationOptionIds, toggleOption } = useOAuthAuthorizationOptions(
    authorizationOptions,
    props.connection?.profile?.grantedScopes,
  );
  const [manualClientId, setManualClientId] = useState("");
  const [manualClientSecret, setManualClientSecret] = useState("");
  const manualClientConfigFields = useMemo(() => clientConfigFieldsFor(props.auth), [props.auth]);
  const [manualExtraValues, setManualExtraValues] = useState(() =>
    initialClientConfigFieldValues(manualClientConfigFields, undefined),
  );
  const [status, setStatus] = useState<string | null>(null);
  const stopOAuthRefreshPolling = useRef<(() => void) | undefined>(undefined);
  const authDescription = props.auth.type === "custom_credential" ? props.auth.description : undefined;
  const fields = credentialFieldsFor(props.auth);
  const showActions = shouldShowConnectionActions(props.auth);
  const connected = props.connection != null;
  const customOAuthClientAvailable =
    props.auth.type === "oauth2" &&
    !remote &&
    props.oauthConfig?.oauthSource?.mode !== "saas" &&
    (props.oauthConfig?.customClientAvailable ?? false);
  const manualValues: ManualOAuthClientValues = {
    clientId: manualClientId,
    clientSecret: manualClientSecret,
    extraValues: manualExtraValues,
  };
  const needsOAuthClient =
    props.auth.type === "oauth2" && !remote && props.oauthClientMode === "configured" && !props.oauthConfig?.configured;
  const canSubmit =
    props.connectionName.length > 0 &&
    props.connectionNameValid &&
    !pending &&
    (remote ||
      ((props.oauthClientMode !== "manual" || customOAuthClientAvailable) &&
        shouldEnableConnectionSubmit(
          props.auth,
          props.oauthConfig,
          props.oauthClientMode === "manual" ? manualValues : undefined,
        )));
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
    if (!customOAuthClientAvailable && props.oauthClientMode === "manual") {
      props.onOAuthClientModeChange("configured");
    }
  }, [customOAuthClientAvailable, props.oauthClientMode, props.onOAuthClientModeChange]);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      if (needsOAuthClient) {
        setStatus(t("providers.connectionMessages.configureOAuthFirst"));
      }
      return;
    }

    const connectionName = props.connectionName.trim();
    setStatus(
      props.auth.type === "oauth2"
        ? t("providers.connectionMessages.openingOAuth")
        : t("providers.connectionMessages.saving"),
    );
    setPending(true);
    setAuthorizationUrl(undefined);
    props.onConnectionPendingChange?.(connectionName);
    try {
      if (props.auth.type === "no_auth") {
        await apiPut(
          `/api/connections/${props.provider.service}`,
          credentialConnectionRequestBody("no_auth", connectionName, values),
        );
      } else if (props.auth.type === "api_key") {
        await apiPut(
          `/api/connections/${props.provider.service}`,
          credentialConnectionRequestBody("api_key", connectionName, values),
        );
      } else if (props.auth.type === "custom_credential") {
        await apiPut(
          `/api/connections/${props.provider.service}`,
          credentialConnectionRequestBody("custom_credential", connectionName, values),
        );
      } else {
        const manual = props.oauthClientMode === "manual" && !remote;
        const trackRequest = remote || Boolean(props.connection && props.oauthConfig?.oauthSource?.mode === "saas");
        const result = !trackRequest
          ? await apiPost<{ authorizationUrl: string; connectionRequestId?: string; expiresAt?: string }>(
              "/api/oauth/authorizations",
              oauthAuthorizationRequestBody(
                props.provider.service,
                connectionName,
                manual ? { auth: props.auth, values: manualValues } : undefined,
                selectedAuthorizationOptionIds,
              ),
            )
          : await apiPost<{ authorizationUrl: string; connectionRequestId: string; expiresAt: string }>(
              "/api/oauth/connection-requests",
              {
                service: props.provider.service,
                connectionName,
                appId: props.connection?.id,
                authorizationOptionIds: authorizationOptions ? selectedAuthorizationOptionIds : undefined,
              },
            );
        setAuthorizationUrl(result.authorizationUrl);
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
          stopOAuthRefreshPolling.current =
            trackRequest && result.connectionRequestId && result.expiresAt
              ? watchOAuthRequest({
                  id: result.connectionRequestId,
                  remote,
                  expiresAt: result.expiresAt,
                  onUpdate(request) {
                    if (request.status === "initiated") return;
                    setStatus(
                      request.status === "connected"
                        ? t("saas.connected")
                        : (request.errorMessage ?? t("saas.manualResult")),
                    );
                    setAuthorizationUrl(undefined);
                    if (request.status === "failed" || request.status === "expired")
                      props.onConnectionPendingChange?.(undefined);
                    props.onRefresh();
                  },
                  onError(error) {
                    setStatus(error instanceof Error ? error.message : t("saas.failed"));
                  },
                })
              : startOAuthRefreshPolling(props.onRefresh);
        }
        setStatus(t("providers.connectionMessages.oauthWindowOpened"));
        return;
      }
      setStatus(t("providers.connectionMessages.updated"));
      props.onRefresh();
    } catch (error) {
      props.onConnectionPendingChange?.(undefined);
      setStatus(error instanceof Error ? error.message : t("providers.connectionMessages.failed"));
    } finally {
      setPending(false);
    }
  }

  async function disconnect(): Promise<void> {
    setPending(true);
    setStatus(t("providers.connectionMessages.disconnecting"));
    try {
      await apiDelete(connectionDeletePath(props.provider.service, props.connectionName));
      setStatus(null);
      toast.success(t("providers.connectionMessages.disconnectNotice", { name: props.connectionName }), {
        description: props.connection?.saas ? t("providers.connectionMessages.cloudDisconnectNotice") : undefined,
      });
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.connectionMessages.disconnectFailed"));
      toast.error(t("providers.connectionMessages.disconnectFailed"));
    } finally {
      setPending(false);
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
      {props.auth.type === "oauth2" && customOAuthClientAvailable ? (
        <ToggleGroup
          className="auth-method-control bg-muted p-[3px]"
          type="single"
          value={props.oauthClientMode}
          spacing={0}
          aria-label={t("providers.oauthAppMode")}
          onValueChange={(value) => {
            if (value === "configured" || value === "manual") {
              props.onOAuthClientModeChange(value);
              setStatus(null);
            }
          }}
        >
          <ToggleGroupItem
            value="configured"
            className="h-[30px] rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-none"
          >
            {t("providers.oauthAppModes.configured")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="manual"
            className="h-[30px] rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-none"
          >
            {t("providers.oauthAppModes.manual")}
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}
      {props.auth.type === "oauth2" ? (
        <Alert variant={needsOAuthClient ? "warning" : "default"}>
          {needsOAuthClient ? <Settings size={16} /> : <ExternalLink size={16} />}
          <AlertDescription>
            {remote
              ? t("saas.remoteNotice")
              : needsOAuthClient
                ? t("providers.connectionMessages.needsOAuthClient", { name: props.provider.displayName })
                : props.oauthClientMode === "manual"
                  ? t("providers.connectionMessages.manualOAuthClient", { name: props.provider.displayName })
                  : connected
                    ? t("providers.connectionMessages.connectedOAuth", { name: props.provider.displayName })
                    : t("providers.connectionMessages.connectOAuth", { name: props.provider.displayName })}
          </AlertDescription>
        </Alert>
      ) : null}
      {props.auth.type === "oauth2" && !remote && props.oauthClientMode === "manual" ? (
        <>
          {props.oauthConfig?.expectedRedirectUri ? (
            <Label className="field">
              <span>{t("providers.oauthClientSettings.callbackUrl")}</span>
              <Input className="font-mono text-xs" value={props.oauthConfig.expectedRedirectUri} readOnly />
            </Label>
          ) : null}
          <Label className="field">
            <span>{t("providers.oauthClientSettings.clientId")}</span>
            <Input value={manualClientId} onChange={(event) => setManualClientId(event.target.value)} required />
          </Label>
          <Label className="field">
            <span>{t("providers.oauthClientSettings.clientSecret")}</span>
            <Input
              type="password"
              value={manualClientSecret}
              onChange={(event) => setManualClientSecret(event.target.value)}
              required={props.auth.clientFields?.some((field) => field.key === "clientSecret" && field.required)}
            />
          </Label>
          {manualClientConfigFields.map((field) => (
            <CredentialInput
              key={field.key}
              field={field}
              value={manualExtraValues[field.key] ?? ""}
              onChange={(value) =>
                setManualExtraValues((previous) => ({
                  ...previous,
                  [field.key]: value,
                }))
              }
            />
          ))}
        </>
      ) : null}
      {authorizationOptions?.length ? (
        <div className="form-grid">
          <Label>
            <span>Permissions</span>
          </Label>
          {authorizationOptions.map((option) => {
            const checked = selectedAuthorizationOptionIds.includes(option.id);
            return (
              <label key={option.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={option.required}
                  onChange={(event) => toggleOption(option.id, event.target.checked)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small className="block text-muted-foreground">{option.description}</small>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
      {authDescription ? <small className="block text-muted-foreground">{authDescription}</small> : null}
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
            <>
              <Button type="submit" disabled={!canSubmit}>
                {props.auth.type === "oauth2" ? <ExternalLink size={16} /> : <Check size={16} />}
                {submitLabel}
              </Button>
              {props.auth.type === "oauth2" && (remote || props.oauthClientMode === "configured") ? (
                <Button variant="outline" type="button" onClick={props.onConfigureOAuthClient}>
                  <Settings size={16} />
                  {t("saas.authorizationSettings")}
                </Button>
              ) : null}
            </>
          )}
          {shouldShowDisconnectAction(props.connection) ? (
            <Button variant="outline" type="button" disabled={pending} onClick={() => void disconnect()}>
              <Trash2 size={16} />
              {t("providers.buttons.disconnect")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {authorizationUrl ? (
        <a className="text-sm underline" href={authorizationUrl} target="_blank" rel="noopener noreferrer">
          {t("saas.pending")}
        </a>
      ) : null}
      {status ? <FormStatus message={status} /> : null}
    </form>
  );
}

function filterProvidersByStatus(
  providers: ProviderDefinition[],
  status: ProviderStatusFilter,
  statusByService: Map<string, ProviderConnectionStatus>,
  oneKeyServices: Set<string>,
): ProviderDefinition[] {
  if (status === "all") return providers;
  if (status === "one_key") return providers.filter((provider) => oneKeyServices.has(provider.service));
  return providers.filter((provider) => {
    const providerStatus = statusByService.get(provider.service);
    if (status === "connected") return providerStatus?.connected;
    if (status === "no_setup") return providerStatus?.noSetupRequired;
    if (status === "not_connected") return !providerStatus?.connected && !providerStatus?.noSetupRequired;
    return providerStatus?.oauthClientRequired;
  });
}

function countProvidersForStatus(
  providers: ProviderDefinition[],
  status: ProviderStatusFilter,
  statusByService: Map<string, ProviderConnectionStatus>,
  oneKeyServices: Set<string>,
): number {
  return filterProvidersByStatus(providers, status, statusByService, oneKeyServices).length;
}

export function providerBrowserResetKey(
  query: string,
  status: ProviderStatusFilter,
  category: string,
  scenario: ProviderDiscoveryScenario | "all" = "all",
  view: ProviderBrowserView = "discover",
): string {
  return `${query}\u0000${status}\u0000${category}\u0000${scenario}\u0000${view}`;
}

function compactProviderCount(value: number): string {
  return compactNumberFormatter.format(value);
}

export function oauthConfigForProvider(configs: OAuthConfig[], service: string): OAuthConfig | undefined {
  return configs.find((config) => config.service === service);
}

const providerStatusOptions: Array<{ id: ProviderStatusFilter; labelKey: string }> = [
  { id: "all", labelKey: "providers.filters.all" },
  { id: "connected", labelKey: "providers.filters.connected" },
  { id: "one_key", labelKey: "providers.filters.oneKey" },
  { id: "no_setup", labelKey: "providers.filters.noSetup" },
  { id: "not_connected", labelKey: "providers.filters.notConnected" },
  { id: "oauth_needs_config", labelKey: "providers.filters.oauthNeedsConfig" },
];
