import type { AppData, OAuthAuthDefinition, OAuthConfig, ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Fingerprint, Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { OAuthAppDialog } from "./oauth-app-form";
import { Badge, EmptyState, ProviderIcon } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OAuthAppsPageProps {
  data: AppData;
  onRefresh(): void;
}

interface OAuthProvider {
  provider: ProviderDefinition;
  auth: OAuthAuthDefinition;
  config?: OAuthConfig;
}

export function OAuthAppsPage(props: OAuthAppsPageProps): ReactNode {
  const t = useTranslate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OAuthProvider | null>(null);
  const providers = useMemo(() => oauthProviders(props.data), [props.data]);
  const visibleProviders = useMemo(() => filterOAuthProviders(providers, query), [providers, query]);

  return (
    <section className="oauth-apps-panel">
      <header className="oauth-apps-header">
        <div>
          <h2>{t("oauthApps.title")}</h2>
          <p>{t("oauthApps.description")}</p>
        </div>
        <label className="oauth-apps-search">
          <Search size={15} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("oauthApps.searchPlaceholder")}
            aria-label={t("oauthApps.searchPlaceholder")}
          />
        </label>
      </header>

      {visibleProviders.length === 0 ? (
        <EmptyState
          icon={<Fingerprint size={20} />}
          title={t(query ? "oauthApps.noResultsTitle" : "oauthApps.emptyTitle")}
          description={t(query ? "oauthApps.noResultsDescription" : "oauthApps.emptyDescription")}
          density="compact"
        />
      ) : (
        <div className="oauth-apps-list">
          {visibleProviders.map((item) => {
            const configured = item.config?.configured ?? false;
            return (
              <div className="oauth-app-row" key={item.provider.service}>
                <ProviderIcon provider={item.provider} />
                <div className="oauth-app-provider">
                  <strong>{item.provider.displayName}</strong>
                  <span>{item.provider.service}</span>
                </div>
                <div className="oauth-app-status">
                  <Badge tone={configured ? "success" : undefined}>
                    {t(configured ? "oauthApps.configured" : "oauthApps.notConfigured")}
                  </Badge>
                  {item.config?.clientId ? <code>{item.config.clientId}</code> : null}
                </div>
                <Button variant="outline" size="sm" type="button" onClick={() => setSelected(item)}>
                  <Settings size={15} />
                  {t(configured ? "oauthApps.edit" : "oauthApps.configure")}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {selected ? (
        <OAuthAppDialog
          open
          provider={selected.provider}
          auth={selected.auth}
          config={props.data.oauthConfigs.find((config) => config.service === selected.provider.service)}
          onOpenChange={(open) => (!open ? setSelected(null) : undefined)}
          onRefresh={props.onRefresh}
        />
      ) : null}
    </section>
  );
}

function oauthProviders(data: AppData): OAuthProvider[] {
  const configs = new Map(data.oauthConfigs.map((config) => [config.service, config]));
  return data.providers.flatMap((provider) => {
    const auth = provider.auth.find(
      (candidate): candidate is OAuthAuthDefinition => candidate.type === "oauth1" || candidate.type === "oauth2",
    );
    return auth ? [{ provider, auth, config: configs.get(provider.service) }] : [];
  });
}

function filterOAuthProviders(providers: OAuthProvider[], query: string): OAuthProvider[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return providers;
  }
  return providers.filter(({ provider }) =>
    `${provider.displayName} ${provider.service}`.toLowerCase().includes(normalized),
  );
}
