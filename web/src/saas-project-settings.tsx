import type { OAuthConfig, SaasProjectState, SaasProviderConfig } from "./model";
import type { ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPut } from "./api";
import { SaasFeedback } from "./saas-feedback";
import { Badge } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const projectPath = "/api/oauth/managed-project";

interface SaasProjectSettingsProps {
  onRefresh(): void;
}

interface OAuthSourceFormProps {
  localConfiguration?: ReactNode;
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
  const [error, setError] = useState<unknown>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingKey, setEditingKey] = useState(false);

  useEffect(() => {
    let active = true;
    setError(undefined);
    void apiGet<SaasProjectState>(projectPath)
      .then((state) => {
        if (!active) return;
        setProject(state);
      })
      .catch((error: unknown) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
    };
  }, [t, reload]);

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const state = await apiPut<SaasProjectState>(projectPath, {
        baseUrl: project?.baseUrl ?? "https://connector.oomol.com",
        projectApiKey,
      });
      setProject(state);
      setProjectApiKey("");
      setEditingKey(false);
      setMessage(t("saas.saved"));
      props.onRefresh();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      setProject(await apiDelete<SaasProjectState>(projectPath));
      setProjectApiKey("");
      setEditingKey(false);
      setConfirmRemove(false);
      setMessage(t("saas.removed"));
      props.onRefresh();
    } catch (error) {
      setError(error);
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
        {project?.configured ? (
          <div className="saas-project-summary">
            <div className="grid min-w-0 gap-1">
              <span className="text-xs text-muted-foreground">{t("saas.projectId")}</span>
              <code className="break-all text-sm">{project.projectId}</code>
              <p className="text-xs text-muted-foreground">{t("saas.keyStored")}</p>
            </div>
            {!editingKey && project.status !== "auth_error" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setEditingKey(true);
                  setMessage(undefined);
                  setError(undefined);
                }}
              >
                {t("saas.updateKey")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {!project?.configured || editingKey || project.status === "auth_error" ? (
          <div className="field saas-project-key-editor">
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
                {t(pending ? "saas.saving" : project?.configured ? "saas.updateKey" : "saas.save")}
              </Button>
            </div>
            <small id="saas-project-key-hint">{t("saas.keyHint")}</small>
            {editingKey && project?.status !== "auth_error" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start"
                disabled={pending}
                onClick={() => {
                  setEditingKey(false);
                  setProjectApiKey("");
                  setError(undefined);
                }}
              >
                {t("providers.buttons.cancel")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className="saas-project-notice">{t("saas.remoteNotice")}</p>
        {!project ? (
          <Button
            className="justify-self-start"
            type="button"
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
          >
            {t("saas.retry")}
          </Button>
        ) : null}
        <SaasFeedback error={error} message={message} />
        {project?.configured ? (
          <details className="saas-project-maintenance">
            <summary>
              {t("saas.manageProject")}
              {project.cleanup.pending || project.cleanup.manual || project.cleanup.paused ? (
                <span className="ml-2 text-warning">
                  {t("saas.cleanup", { pending: project.cleanup.pending, manual: project.cleanup.manual })}
                </span>
              ) : null}
            </summary>
            <div className="mt-3 grid gap-3">
              <p className="text-xs text-muted-foreground">{t("saas.removeHint")}</p>
              {project.cleanup.paused ? <p className="text-sm text-warning">{t("saas.paused")}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setReload((value) => value + 1)}
                >
                  {t("saas.retry")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => setConfirmRemove(!confirmRemove)}
                >
                  {t("saas.remove")}
                </Button>
              </div>
              {confirmRemove ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove()}>
                    {t("saas.confirmRemove")}
                  </Button>
                  <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmRemove(false)}>
                    {t("providers.buttons.cancel")}
                  </Button>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
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
  const [loadError, setLoadError] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    setSelected(saved);
  }, [saved, props.service]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(undefined);
    setConfigs([]);
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
        if (active) setLoadError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.service, reload]);

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await apiPut(
        `/api/oauth/sources/${encodeURIComponent(props.service)}`,
        selected ? { mode: "saas", providerConfigId: selected } : { mode: "local" },
      );
      setMessage(t("saas.saved"));
      props.onRefresh();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  const config = configs.find((item) => item.id === selected);
  return (
    <>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <Label htmlFor="oauth-source">{t("saas.defaultSource")}</Label>
        <Select
          value={selected ? `config:${selected}` : "local"}
          onValueChange={(value) => setSelected(value === "local" ? "" : value.slice(7))}
          disabled={pending || loading}
        >
          <SelectTrigger id="oauth-source" className="w-full">
            <SelectValue>{selected && !config ? t("saas.remote") : undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="p-1">
            <SelectItem value="local">{t("saas.local")}</SelectItem>
            {saved && !configs.some((item) => item.id === saved) ? (
              <SelectItem value={`config:${saved}`} disabled>
                {t("saas.remote")} · {t(loadError ? "saas.loadFailed" : "saas.configUnavailable")}
              </SelectItem>
            ) : null}
            {configs.map((item) => (
              <SelectItem key={item.id} value={`config:${item.id}`}>
                {t("saas.remote")} · {item.displayName}
                {configs.filter((entry) => entry.displayName === item.displayName).length > 1 ? ` · ${item.id}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{t("saas.sourceHint")}</p>
        {selected ? <p className="text-sm text-muted-foreground">{t("saas.remoteNotice")}</p> : null}
        {config ? (
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{t("saas.capabilities", { count: config.actionIds.length })}</Badge>
              <Badge>{t(config.proxyAvailable ? "saas.proxyYes" : "saas.proxyNo")}</Badge>
            </div>
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">{t("saas.configurationDetails")}</summary>
              <dl className="mt-3 grid gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t("saas.configurationId")}</dt>
                  <dd className="mt-1 break-all font-mono">{config.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("providers.oauthClientSettings.callbackUrl")}</dt>
                  <dd className="mt-1 break-all font-mono">{config.callbackUrl}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("saas.scopes")}</dt>
                  <dd className="mt-1">
                    {config.effectiveScopes.length ? (
                      <ul className="grid gap-1 font-mono">
                        {config.effectiveScopes.map((scope) => (
                          <li key={scope} className="break-all">
                            {scope}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        ) : loading ? (
          <span role="status">{t("saas.loading")}</span>
        ) : !loadError && selected ? (
          <p className="text-sm text-muted-foreground">{t("saas.configUnavailableHint")}</p>
        ) : !loadError && configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("saas.noConfigs")}</p>
        ) : null}
        <Button
          className="justify-self-start"
          type="submit"
          disabled={pending || loading || selected === saved || Boolean(selected && !config)}
        >
          {t(pending ? "saas.saving" : "saas.saveSource")}
        </Button>
        <SaasFeedback error={error ?? loadError} message={message} />
        {!loading && (loadError || !config) ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={pending}
            onClick={() => setReload((value) => value + 1)}
          >
            {t("saas.retry")}
          </Button>
        ) : null}
      </form>
      {!selected && props.localConfiguration ? <div className="border-t pt-4">{props.localConfiguration}</div> : null}
    </>
  );
}
