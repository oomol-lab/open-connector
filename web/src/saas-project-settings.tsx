import type { OAuthConfig, SaasProjectState, SaasProviderConfig } from "./model";
import type { ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPut } from "./api";
import { Badge, FormStatus } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const projectPath = "/api/oauth/managed-project";

interface SaasProjectSettingsProps {
  onRefresh(): void;
}

interface OAuthSourceFormProps {
  service: string;
  config?: OAuthConfig;
  onRefresh(): void;
}

export function SaasProjectSettings(props: SaasProjectSettingsProps): ReactNode {
  const t = useTranslate();
  const [reload, setReload] = useState(0);
  const [project, setProject] = useState<SaasProjectState>();
  const [projectApiKey, setProjectApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let active = true;
    void apiGet<SaasProjectState>(projectPath)
      .then((state) => {
        if (!active) return;
        setProject(state);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : t("saas.failed"));
      });
    return () => {
      active = false;
    };
  }, [t, reload]);

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const state = await apiPut<SaasProjectState>(projectPath, {
        baseUrl: project?.baseUrl ?? "https://connector.oomol.com",
        projectApiKey,
      });
      setProject(state);
      setProjectApiKey("");
      setMessage(t("saas.saved"));
      props.onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saas.failed"));
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    setPending(true);
    setMessage(undefined);
    try {
      setProject(await apiDelete<SaasProjectState>(projectPath));
      setProjectApiKey("");
      setConfirmRemove(false);
      setMessage(t("saas.removed"));
      props.onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saas.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="oauth-apps-panel">
      <header className="oauth-apps-header saas-project-header">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2>{t("saas.project")}</h2>
            {project ? (
              <Badge tone={project.status === "available" ? "success" : project.configured ? "warning" : undefined}>
                {t(`saas.status.${project.status}`)}
              </Badge>
            ) : (
              <span role="status">{t("saas.loading")}</span>
            )}
          </div>
          <p>{t("saas.projectDescription")}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <a href="https://console.oomol.com/projects" target="_blank" rel="noopener noreferrer">
            {t("saas.openProjects")}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </Button>
      </header>
      <form className="form-grid saas-settings" onSubmit={(event) => void save(event)}>
        {project?.projectId ? (
          <p className="text-sm">
            {t("saas.projectId")}: <code>{project.projectId}</code>
          </p>
        ) : null}
        <div className="field">
          <Label htmlFor="saas-project-key">{t("saas.projectKey")}</Label>
          <div className="saas-project-key-row">
            <Input
              id="saas-project-key"
              type="password"
              autoComplete="new-password"
              aria-describedby="saas-project-key-hint"
              value={projectApiKey}
              onChange={(event) => setProjectApiKey(event.target.value)}
              required
              disabled={pending || !project}
            />
            <Button type="submit" disabled={pending || !project}>
              {t(pending ? "saas.saving" : "saas.save")}
            </Button>
          </div>
          <small id="saas-project-key-hint">{t("saas.keyHint")}</small>
        </div>
        <p className="saas-project-notice">{t("saas.remoteNotice")}</p>
        {project?.configured ? (
          <p className="text-sm text-muted-foreground">
            {t("saas.cleanup", { pending: project.cleanup.pending, manual: project.cleanup.manual })}
            {project.cleanup.paused ? ` ${t("saas.paused")}` : ""}
          </p>
        ) : null}
        {!project || project.configured ? (
          <div className="button-row">
            {!project ? (
              <Button type="button" variant="outline" onClick={() => setReload((value) => value + 1)}>
                {t("saas.retry")}
              </Button>
            ) : null}
            {project?.configured ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmRemove(!confirmRemove)}
              >
                {t("saas.remove")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {confirmRemove ? (
          <div className="form-grid">
            <p className="text-sm">{t("saas.removeHint")}</p>
            <div className="button-row">
              <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove()}>
                {t("saas.confirmRemove")}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmRemove(false)}>
                {t("providers.buttons.cancel")}
              </Button>
            </div>
          </div>
        ) : null}
        {message ? <FormStatus message={message} /> : null}
      </form>
    </section>
  );
}

export function OAuthSourceForm(props: OAuthSourceFormProps): ReactNode {
  const t = useTranslate();
  const source = props.config?.oauthSource;
  const saved = source?.mode === "saas" ? source.providerConfigId : "";
  const [selected, setSelected] = useState(saved);
  const [configs, setConfigs] = useState<SaasProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    setSelected(saved);
  }, [saved, props.service]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void apiGet<SaasProjectState>(projectPath)
      .then(async (project) =>
        project.configured
          ? (await apiGet<{ providerConfigs: SaasProviderConfig[] }>(`${projectPath}/provider-configs`)).providerConfigs
          : [],
      )
      .then((items) => {
        if (active) setConfigs(items.filter((item) => item.service === props.service));
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : t("saas.failed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.service, t]);

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      await apiPut(
        `/api/oauth/sources/${encodeURIComponent(props.service)}`,
        selected ? { mode: "saas", providerConfigId: selected } : { mode: "local" },
      );
      setMessage(t("saas.saved"));
      props.onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saas.failed"));
    } finally {
      setPending(false);
    }
  }
  const config = configs.find((item) => item.id === selected);
  return (
    <form className="form-grid border-b pb-4" onSubmit={(event) => void save(event)}>
      <Label htmlFor="oauth-source">{t("saas.defaultSource")}</Label>
      <Select
        value={selected ? `config:${selected}` : "local"}
        onValueChange={(value) => setSelected(value === "local" ? "" : value.slice(7))}
        disabled={pending}
      >
        <SelectTrigger id="oauth-source" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="local">{t("saas.local")}</SelectItem>
          {saved && !configs.some((item) => item.id === saved) ? (
            <SelectItem value={`config:${saved}`} disabled>
              {t("saas.remote")} · {saved}
            </SelectItem>
          ) : null}
          {configs.map((item) => (
            <SelectItem key={item.id} value={`config:${item.id}`}>
              {item.displayName} · {item.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">{t("saas.sourceHint")}</p>
      {selected ? <p className="text-sm text-muted-foreground">{t("saas.remoteNotice")}</p> : null}
      {config ? (
        <div className="text-sm">
          <p>
            {t("saas.capabilities", { count: config.actionIds.length })} ·{" "}
            {t(config.proxyAvailable ? "saas.proxyYes" : "saas.proxyNo")}
          </p>
          <p className="break-all">
            {t("providers.oauthClientSettings.callbackUrl")}: {config.callbackUrl}
          </p>
          <p className="break-words">
            {t("saas.scopes")}: {config.effectiveScopes.join(", ") || "—"}
          </p>
        </div>
      ) : loading ? (
        <span role="status">{t("saas.loading")}</span>
      ) : configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("saas.noConfigs")}</p>
      ) : null}
      <Button
        className="justify-self-start"
        type="submit"
        disabled={pending || selected === saved || Boolean(selected && !config)}
      >
        {t(pending ? "saas.saving" : "saas.saveSource")}
      </Button>
      {message ? <FormStatus message={message} /> : null}
    </form>
  );
}
