import type { CustomMcpRecord, McpHeaderDefinition } from "../../src/custom-mcp/definition";
import type { CustomMcpRegistration } from "../../src/custom-mcp/definition";
import type { ConnectionRecord } from "./model";
import type { ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { suggestMcpService } from "../../src/custom-mcp/definition";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddCustomMcpProps {
  onRefresh(): void;
}

export function AddCustomMcp({ onRefresh }: AddCustomMcpProps): ReactNode {
  const t = useTranslate();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [service, setService] = useState<string>();
  const [endpoint, setEndpoint] = useState("");
  const [auth, setAuth] = useState("none");
  const [transport, setTransport] = useState("streamable_http");
  const [headers, setHeaders] = useState<McpHeaderDefinition[]>([{ name: "Authorization", prefix: "Bearer " }]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [manual, setManual] = useState(false);
  const [issuer, setIssuer] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [scopes, setScopes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let authentication: CustomMcpRegistration["auth"] = { type: "none" };
      if (auth === "headers") authentication = { type: "headers", headers };
      if (auth === "oauth2") {
        authentication = {
          type: "oauth2",
          client: clientId.trim() ? { clientId, clientSecret } : undefined,
          manual: manual
            ? {
                issuer,
                authorizationUrl,
                tokenUrl,
                scopes: scopes.split(/\s+/).filter(Boolean),
                tokenEndpointAuthMethod: clientSecret ? "client_secret_post" : "none",
              }
            : undefined,
        };
      }
      const record = await apiPost<CustomMcpRecord>("/api/custom-mcp", {
        service: service ?? suggestMcpService(name),
        displayName: name,
        endpoint,
        transport,
        auth: authentication,
      });
      onRefresh();
      setOpen(false);
      setClientSecret("");
      navigate(`/providers/${record.service}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus size={16} />
        {t("customMcp.add")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("customMcp.add")}</DialogTitle>
            <DialogDescription>{t("customMcp.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mcp-name">{t("customMcp.name")}</Label>
              <Input id="mcp-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-service">{t("customMcp.service")}</Label>
              <Input
                id="mcp-service"
                required
                maxLength={100}
                pattern="[a-z0-9_\-]+"
                value={service ?? suggestMcpService(name)}
                onChange={(e) => setService(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">{t("customMcp.serviceHelp")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-endpoint">{t("customMcp.endpoint")}</Label>
              <Input
                id="mcp-endpoint"
                type="url"
                required
                placeholder="https://example.com/mcp"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("customMcp.transport")}</Label>
              <Select value={transport} onValueChange={setTransport}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("customMcp.auth")}</Label>
              <Select value={auth} onValueChange={setAuth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("customMcp.noAuth")}</SelectItem>
                  <SelectItem value="headers">{t("customMcp.headers")}</SelectItem>
                  <SelectItem value="oauth2">OAuth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {auth === "headers" ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">{t("customMcp.headerHelp")}</p>
                {headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      aria-label={t("customMcp.headerName")}
                      placeholder="Authorization"
                      value={header.name}
                      onChange={(e) =>
                        setHeaders(
                          headers.map((value, i) => (i === index ? { ...value, name: e.target.value } : value)),
                        )
                      }
                    />
                    <Input
                      aria-label={t("customMcp.prefix")}
                      placeholder="Bearer "
                      value={header.prefix}
                      onChange={(e) =>
                        setHeaders(
                          headers.map((value, i) => (i === index ? { ...value, prefix: e.target.value } : value)),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("customMcp.removeHeader")}
                      disabled={headers.length === 1}
                      onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setHeaders([...headers, { name: "", prefix: "" }])}
                >
                  {t("customMcp.addHeader")}
                </Button>
              </div>
            ) : null}
            {auth === "oauth2" ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">{t("customMcp.oauthHelp")}</p>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-client">Client ID</Label>
                  <Input
                    id="mcp-client"
                    required={manual}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-secret">Client Secret</Label>
                  <Input
                    id="mcp-secret"
                    type="password"
                    autoComplete="new-password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
                <Label>
                  <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
                  {t("customMcp.manualOAuth")}
                </Label>
                {manual ? (
                  <>
                    <Input
                      aria-label={t("customMcp.issuer")}
                      placeholder={t("customMcp.issuer")}
                      type="url"
                      required
                      value={issuer}
                      onChange={(e) => setIssuer(e.target.value)}
                    />
                    <Input
                      aria-label={t("customMcp.authorizationUrl")}
                      placeholder={t("customMcp.authorizationUrl")}
                      type="url"
                      required
                      value={authorizationUrl}
                      onChange={(e) => setAuthorizationUrl(e.target.value)}
                    />
                    <Input
                      aria-label={t("customMcp.tokenUrl")}
                      placeholder={t("customMcp.tokenUrl")}
                      type="url"
                      required
                      value={tokenUrl}
                      onChange={(e) => setTokenUrl(e.target.value)}
                    />
                    <Input
                      aria-label={t("customMcp.scopes")}
                      placeholder={t("customMcp.scopes")}
                      value={scopes}
                      onChange={(e) => setScopes(e.target.value)}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {t(busy ? "customMcp.working" : "customMcp.add")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface CustomMcpSettingsProps {
  service: string;
  connections: ConnectionRecord[];
  onRefresh(): void;
}

export function CustomMcpSettings({ service, connections, onRefresh }: CustomMcpSettingsProps): ReactNode {
  const t = useTranslate();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CustomMcpRecord>();
  const [connectionId, setConnectionId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRecord(undefined);
    setError("");
    void apiGet<CustomMcpRecord>(`/api/custom-mcp/${service}`).then(
      (record) => {
        if (active) {
          setRecord(record);
          setName(record.displayName);
          setConnectionId(record.syncConnectionId ?? connections[0]?.id ?? "");
        }
      },
      (error: Error) => {
        if (active && !(error instanceof ApiError && error.status === 404)) setError(error.message);
      },
    );
    return () => {
      active = false;
    };
  }, [service, connections]);

  async function run(operation: "sync" | "save" | "toggle" | "delete"): Promise<void> {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      switch (operation) {
        case "delete":
          await apiDelete(`/api/custom-mcp/${service}`);
          navigate("/providers");
          break;
        case "sync":
          setRecord(
            await apiPost<CustomMcpRecord>(`/api/custom-mcp/${service}/sync`, {
              connectionId: connectionId || undefined,
            }),
          );
          break;
        case "save":
        case "toggle":
          setRecord(
            await apiPatch<CustomMcpRecord>(`/api/custom-mcp/${service}`, {
              displayName: name,
              enabled: operation === "toggle" ? !record.enabled : record.enabled,
            }),
          );
          break;
      }
      onRefresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!record && !error) return null;

  return (
    <section className="detail-panel grid gap-3">
      <h3>{t("customMcp.settings")}</h3>
      {record ? (
        <>
          <p className="break-all text-sm text-muted-foreground">{record.endpoint}</p>
          <div className="flex gap-2">
            <Input aria-label={t("customMcp.name")} value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="outline" disabled={busy || !name.trim()} onClick={() => void run("save")}>
              {t("customMcp.save")}
            </Button>
          </div>
          {record.auth.type !== "none" ? (
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger aria-label={t("customMcp.syncConnection")}>
                <SelectValue placeholder={t("customMcp.syncConnection")} />
              </SelectTrigger>
              <SelectContent>
                {connections
                  .filter((connection) => connection.configured && !connection.virtual && connection.id)
                  .map((connection) => (
                    <SelectItem key={connection.id} value={connection.id!}>
                      {connection.connectionName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
          <p className="text-sm">
            {record.syncedAt
              ? t("customMcp.synced", {
                  count: record.actions.length,
                  time: new Date(record.syncedAt).toLocaleString(),
                })
              : t("customMcp.notSynced")}
          </p>
          {record.syncError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("customMcp.syncFailed")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || (record.auth.type !== "none" && !connectionId)} onClick={() => void run("sync")}>
              {t(busy ? "customMcp.working" : "customMcp.sync")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void run("toggle")}>
              {t(record.enabled ? "customMcp.disable" : "customMcp.enable")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || connections.some((connection) => connection.configured && !connection.virtual)}
              onClick={() => void run("delete")}
            >
              {t("customMcp.delete")}
            </Button>
          </div>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
