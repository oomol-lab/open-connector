import type {
  PolicyRules,
  ProviderDefinition,
  RuntimePolicyState,
  RuntimeTokenCreation,
  RuntimeTokenSummary,
} from "./model";
import type { PolicyEditorDraft, PolicyEvaluation, PolicyResource } from "./policy";
import type { FormEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiDelete, apiPost, apiPut } from "./api";
import { formatDate } from "./model";
import {
  countAllowedActions,
  countAllowedProxies,
  createPolicyEditorDraft,
  evaluatePolicy,
  filterPolicyRuleCandidates,
  parsePolicyLines,
  policyEditorDraftEquals,
  policyLayers,
  policyRuleCandidates,
  policyRulesFromEditorDraft,
  validatePolicyEditorDraft,
} from "./policy";
import { PolicyEditor } from "./policy-editor";
import { PolicySuggestionInput } from "./policy-suggestion-input";
import { Badge, EmptyState, FormStatus } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface AccessPageProps {
  providers: ProviderDefinition[];
  tokens: RuntimeTokenSummary[];
  policy: RuntimePolicyState;
  onRefresh(): void;
}

interface CreateTokenDialogProps {
  name: string;
  created: RuntimeTokenCreation | null;
  status: string | null;
  copied: boolean;
  draft: PolicyEditorDraft;
  providers: ProviderDefinition[];
  onNameChange(name: string): void;
  onDraftChange(draft: PolicyEditorDraft): void;
  onSubmit(event: FormEvent): Promise<void>;
  onCopy(token: string): void;
  onClose(): void;
}

export interface PolicyDraft {
  allowedActions: string;
  blockedActions: string;
  allowedProxies: string;
  blockedProxies: string;
}

export function createTokenDialogMode(created: RuntimeTokenCreation | null): "form" | "created" {
  return created ? "created" : "form";
}

export function AccessPage(props: AccessPageProps): ReactNode {
  const t = useTranslate();
  const [name, setName] = useState("");
  const [createDraft, setCreateDraft] = useState(() => createPolicyEditorDraft(emptyPolicyRules()));
  const [created, setCreated] = useState<RuntimeTokenCreation | null>(null);
  const [editingToken, setEditingToken] = useState<RuntimeTokenSummary | null>(null);
  const [editTokenDraft, setEditTokenDraft] = useState(() => createPolicyEditorDraft(emptyPolicyRules()));
  const [policy, setPolicy] = useState(props.policy);
  const [runtimeDraft, setRuntimeDraft] = useState(() => createPolicyEditorDraft(props.policy.runtime));
  const [runtimeEditing, setRuntimeEditing] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [confirmRuntimeSave, setConfirmRuntimeSave] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const previousPolicy = useRef(props.policy);
  const { copy, copied } = useClipboard();
  const savedRuntimeDraft = useMemo(() => createPolicyEditorDraft(policy.runtime), [policy.runtime]);
  const runtimeDirty = !policyEditorDraftEquals(runtimeDraft, savedRuntimeDraft);
  const runtimeRules = useMemo(() => policyRulesFromEditorDraft(runtimeDraft), [runtimeDraft]);
  const runtimeDraftState: RuntimePolicyState = useMemo(
    () => ({ ...policy, runtime: runtimeRules }),
    [policy, runtimeRules],
  );
  const runtimeIssues = validatePolicyEditorDraft(runtimeDraft, true);
  const runtimeRisk = useMemo(
    () => (runtimeEditing ? policyRisk(runtimeDraftState, props.providers) : null),
    [runtimeDraftState, props.providers, runtimeEditing],
  );

  useEffect(() => {
    if (props.policy === previousPolicy.current) {
      return;
    }
    previousPolicy.current = props.policy;
    if (!runtimeEditing) {
      setPolicy(props.policy);
      setRuntimeDraft(createPolicyEditorDraft(props.policy.runtime));
    }
  }, [props.policy, runtimeEditing]);

  async function submitToken(event: FormEvent): Promise<void> {
    event.preventDefault();
    setTokenStatus(t("access.creating"));
    setCreated(null);
    const rules = policyRulesFromEditorDraft(createDraft);
    try {
      const result = await apiPost<RuntimeTokenCreation>("/api/runtime-tokens", {
        name,
        allowedActions: rules.allowedActions,
        blockedActions: rules.blockedActions,
      });
      setCreated(result);
      setName("");
      setCreateDraft(createPolicyEditorDraft(emptyPolicyRules()));
      setTokenStatus(t("access.created"));
      props.onRefresh();
    } catch (error) {
      setTokenStatus(error instanceof Error ? error.message : t("access.createFailed"));
    }
  }

  async function persistRuntimePolicy(): Promise<void> {
    setRuntimeSaving(true);
    setRuntimeStatus(t("access.policy.saving"));
    try {
      const updated = await apiPut<RuntimePolicyState>("/api/runtime-policy", runtimeRules);
      setPolicy(updated);
      setRuntimeDraft(createPolicyEditorDraft(updated.runtime));
      setRuntimeStatus(t("access.policy.saved"));
      setRuntimeEditing(false);
      props.onRefresh();
    } catch (error) {
      setRuntimeStatus(error instanceof Error ? error.message : t("access.policy.saveFailed"));
    } finally {
      setRuntimeSaving(false);
    }
  }

  function requestRuntimeSave(): void {
    if (runtimeIssues.length > 0 || !runtimeDirty) {
      return;
    }
    if (runtimeRisk) {
      setConfirmRuntimeSave(true);
      return;
    }
    void persistRuntimePolicy();
  }

  async function saveTokenPolicy(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!editingToken) {
      return;
    }
    const rules = policyRulesFromEditorDraft(editTokenDraft);
    setTokenStatus(t("access.policy.saving"));
    try {
      await apiPut(`/api/runtime-tokens/${editingToken.id}`, {
        allowedActions: rules.allowedActions,
        blockedActions: rules.blockedActions,
      });
      setEditingToken(null);
      setTokenStatus(t("access.policy.saved"));
      props.onRefresh();
    } catch (error) {
      setTokenStatus(error instanceof Error ? error.message : t("access.policy.saveFailed"));
    }
  }

  async function revoke(id: string): Promise<void> {
    setTokenStatus(t("access.revoking"));
    try {
      await apiDelete(`/api/runtime-tokens/${id}`);
      setTokenStatus(t("access.revoked"));
      props.onRefresh();
    } catch (error) {
      setTokenStatus(error instanceof Error ? error.message : t("access.revokeFailed"));
    }
  }

  function openCreate(): void {
    setName("");
    setCreateDraft(createPolicyEditorDraft(emptyPolicyRules()));
    setCreated(null);
    setTokenStatus(null);
    setCreateOpen(true);
  }

  function closeCreate(): void {
    setCreateOpen(false);
    setName("");
    setCreateDraft(createPolicyEditorDraft(emptyPolicyRules()));
    setCreated(null);
    setTokenStatus(null);
  }

  function openPolicyEditor(token: RuntimeTokenSummary): void {
    setEditingToken(token);
    setEditTokenDraft(
      createPolicyEditorDraft({
        allowedActions: token.allowedActions,
        blockedActions: token.blockedActions,
        allowedProxies: [],
        blockedProxies: [],
      }),
    );
    setTokenStatus(null);
  }

  function startRuntimeEditing(): void {
    setRuntimeDraft(createPolicyEditorDraft(policy.runtime));
    setRuntimeStatus(null);
    setRuntimeEditing(true);
  }

  function discardRuntimeEditing(): void {
    setPolicy(props.policy);
    setRuntimeDraft(createPolicyEditorDraft(props.policy.runtime));
    setRuntimeStatus(null);
    setRuntimeEditing(false);
  }

  return (
    <section className="detail-panel access-panel">
      <section className="runtime-policy-panel">
        <div className="detail-heading">
          <div className="action-mark">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2>{t("access.policy.title")}</h2>
            <p>{t("access.policy.description")}</p>
          </div>
        </div>

        <PolicyBaseline policy={policy} providers={props.providers} />
        <PolicyTester policy={policy} providers={props.providers} tokens={props.tokens} />
        <PolicyLayerDisclosure rules={policy.deployment} />

        {runtimeEditing ? (
          <RuntimePolicyEditor
            draft={runtimeDraft}
            draftState={runtimeDraftState}
            providers={props.providers}
            dirty={runtimeDirty}
            risk={runtimeRisk}
            saving={runtimeSaving}
            status={runtimeStatus}
            onDraftChange={setRuntimeDraft}
            onDiscard={discardRuntimeEditing}
            onSave={requestRuntimeSave}
          />
        ) : (
          <RuntimePolicySummary policy={policy} status={runtimeStatus} onEdit={startRuntimeEditing} />
        )}
      </section>

      <div className="access-panel-header">
        <div className="detail-heading">
          <div className="action-mark">
            <KeyRound size={20} />
          </div>
          <div>
            <h2>{t("access.title")}</h2>
            <p>{t("access.description")}</p>
          </div>
        </div>

        <Button type="button" onClick={openCreate}>
          <KeyRound size={16} />
          {t("access.createToken")}
        </Button>
      </div>

      {!createOpen && tokenStatus ? <FormStatus message={tokenStatus} /> : null}

      <section className="table-panel">
        {props.tokens.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={20} />}
            title={t("access.noTokensTitle")}
            description={t("access.noTokensDescription")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("access.table.name")}</TableHead>
                <TableHead>{t("access.table.status")}</TableHead>
                <TableHead>{t("access.table.policy")}</TableHead>
                <TableHead>{t("access.table.created")}</TableHead>
                <TableHead>{t("access.table.lastUsed")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>
                    <strong>{token.name}</strong>
                  </TableCell>
                  <TableCell>
                    <Badge tone="success">{t("common.active")}</Badge>
                  </TableCell>
                  <TableCell>{tokenPolicySummary(token, t)}</TableCell>
                  <TableCell>{formatDate(token.createdAt)}</TableCell>
                  <TableCell>{token.lastUsedAt ? formatDate(token.lastUsedAt) : ""}</TableCell>
                  <TableCell className="table-actions">
                    <Button variant="outline" size="sm" onClick={() => openPolicyEditor(token)}>
                      <Pencil size={15} />
                      {t("access.policy.edit")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void revoke(token.id)}>
                      <Trash2 size={15} />
                      {t("access.revoke")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {createOpen ? (
        <CreateTokenDialog
          name={name}
          created={created}
          status={tokenStatus}
          copied={copied}
          draft={createDraft}
          providers={props.providers}
          onNameChange={setName}
          onDraftChange={setCreateDraft}
          onSubmit={submitToken}
          onCopy={(token) => void copy(token)}
          onClose={closeCreate}
        />
      ) : null}
      {editingToken ? (
        <EditTokenPolicyDialog
          token={editingToken}
          draft={editTokenDraft}
          providers={props.providers}
          status={tokenStatus}
          onDraftChange={setEditTokenDraft}
          onSubmit={saveTokenPolicy}
          onClose={() => setEditingToken(null)}
        />
      ) : null}
      <Dialog open={confirmRuntimeSave} onOpenChange={setConfirmRuntimeSave}>
        <DialogContent className="max-w-[min(480px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>{t("access.policy.confirm.title")}</DialogTitle>
            <DialogDescription>{t(`access.policy.confirm.${runtimeRisk ?? "actions"}`)}</DialogDescription>
          </DialogHeader>
          <div className="button-row">
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmRuntimeSave(false);
                void persistRuntimePolicy();
              }}
            >
              {t("access.policy.confirm.save")}
            </Button>
            <Button variant="outline" onClick={() => setConfirmRuntimeSave(false)}>
              {t("access.policy.confirm.keepEditing")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PolicyBaseline(props: { policy: RuntimePolicyState; providers: ProviderDefinition[] }): ReactNode {
  const t = useTranslate();
  const titleId = useId();
  const { actions, proxies } = useMemo(() => {
    const layers = policyLayers(props.policy);
    return {
      actions: countAllowedActions(props.providers, layers),
      proxies: countAllowedProxies(props.providers, layers),
    };
  }, [props.policy, props.providers]);
  const deploymentRules = configuredRuleCount(props.policy.deployment);
  const runtimeRules = configuredRuleCount(props.policy.runtime);
  const actionsBlocked = actions.total > 0 && actions.allowed === 0;
  const proxiesBlocked = proxies.total > 0 && proxies.allowed === 0;
  const risk =
    actionsBlocked && proxiesBlocked ? "all" : actionsBlocked ? "actions" : proxiesBlocked ? "proxies" : null;

  return (
    <section className="policy-baseline" aria-labelledby={titleId}>
      <div className="policy-section-title">
        <h3 id={titleId}>{t("access.policy.baseline.title")}</h3>
        <Badge tone={risk ? "error" : "success"}>
          {risk ? <AlertTriangle size={13} /> : <CircleCheck size={13} />}
          {t(risk ? `access.policy.baseline.${risk}Blocked` : "access.policy.baseline.healthy")}
        </Badge>
      </div>
      <div className="policy-baseline-grid">
        <div>
          <span>{t("access.policy.baseline.actions")}</span>
          <strong>{t("access.policy.baseline.allowedCount", actions)}</strong>
          <small>{t("access.policy.baseline.catalogHint")}</small>
        </div>
        <div>
          <span>{t("access.policy.baseline.proxies")}</span>
          <strong>{t("access.policy.baseline.allowedCount", proxies)}</strong>
          <small>{t("access.policy.baseline.providersHint")}</small>
        </div>
        <div>
          <span>{t("access.policy.baseline.layers")}</span>
          <strong>
            {t("access.policy.baseline.layerCount", { deployment: deploymentRules, runtime: runtimeRules })}
          </strong>
          <small>{t("access.policy.baseline.blockPriority")}</small>
        </div>
      </div>
    </section>
  );
}

function PolicyTester(props: {
  policy: RuntimePolicyState;
  providers: ProviderDefinition[];
  tokens: RuntimeTokenSummary[];
  compact?: boolean;
}): ReactNode {
  const t = useTranslate();
  const [resource, setResource] = useState<PolicyResource>("action");
  const [tokenId, setTokenId] = useState("none");
  const candidates = useMemo(
    () =>
      policyRuleCandidates(props.providers, resource).filter(
        (candidate) => candidate !== "*" && !candidate.endsWith(".*"),
      ),
    [props.providers, resource],
  );
  const [input, setInput] = useState("");
  const [testedValue, setTestedValue] = useState("");
  const suggestions = useMemo(
    () => (input.trim() ? filterPolicyRuleCandidates(candidates, input, 6) : []),
    [candidates, input],
  );
  const token = resource === "action" ? props.tokens.find((item) => item.id === tokenId) : undefined;
  const layers = policyLayers(props.policy, token).filter((layer) => resource === "action" || layer.source !== "token");
  const result = testedValue ? evaluatePolicy(testedValue, resource, layers) : null;
  const listId = `policy-tester-${props.compact ? "compact" : "default"}-${resource}`;

  function changeResource(next: PolicyResource): void {
    setResource(next);
    setInput("");
    setTestedValue("");
  }

  return (
    <section className={props.compact ? "policy-tester compact" : "policy-tester"}>
      <div className="policy-section-title">
        <h3>{t("access.policy.tester.title")}</h3>
        {!props.compact ? <p>{t("access.policy.tester.description")}</p> : null}
      </div>
      <form
        className="policy-tester-form"
        onSubmit={(event) => {
          event.preventDefault();
          setTestedValue(input.trim());
        }}
      >
        <ToggleGroup
          className="policy-resource-control bg-muted p-[3px]"
          type="single"
          value={resource}
          spacing={0}
          aria-label={t("access.policy.tester.resourceLabel")}
          onValueChange={(value) => (value ? changeResource(value as PolicyResource) : undefined)}
        >
          <ToggleGroupItem
            value="action"
            className="h-[30px] rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-console-sm"
          >
            {t("access.policy.tester.action")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="proxy"
            className="h-[30px] rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-console-sm"
          >
            {t("access.policy.tester.proxy")}
          </ToggleGroupItem>
        </ToggleGroup>
        {resource === "action" && props.tokens.length > 0 ? (
          <Select value={tokenId} onValueChange={setTokenId}>
            <SelectTrigger className="policy-token-select-trigger" aria-label={t("access.policy.tester.tokenLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="policy-token-select-content" position="popper" align="start" sideOffset={4}>
              <SelectGroup>
                <SelectItem value="none">{t("access.policy.tester.noToken")}</SelectItem>
                {props.tokens.map((item) => (
                  <SelectItem value={item.id} key={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        <Label className="sr-only" htmlFor={`${listId}-input`}>
          {t("access.policy.tester.inputLabel")}
        </Label>
        <PolicySuggestionInput
          id={`${listId}-input`}
          value={input}
          suggestions={suggestions}
          placeholder={t(`access.policy.tester.${resource}Placeholder`)}
          onChange={setInput}
        />
        <Button type="submit" disabled={!input.trim()}>
          <Play size={15} />
          {t("access.policy.tester.test")}
        </Button>
      </form>
      {result ? <PolicyDecisionTrace value={testedValue} result={result} /> : null}
    </section>
  );
}

function PolicyDecisionTrace(props: { value: string; result: PolicyEvaluation }): ReactNode {
  const t = useTranslate();
  return (
    <details className="policy-decision-trace">
      <summary>
        <Badge tone={props.result.allowed ? "success" : "error"}>
          {props.result.allowed ? <CircleCheck size={13} /> : <CircleX size={13} />}
          {t(props.result.allowed ? "access.policy.tester.allowed" : "access.policy.tester.blocked")}
        </Badge>
        <code>{props.value}</code>
        <span>{t("access.policy.tester.trace")}</span>
        <ChevronDown size={15} />
      </summary>
      <ol>
        {props.result.trace.map((check) => (
          <li key={check.source}>
            <strong>{t(`access.policy.sources.${check.source}`)}</strong>
            <span>{t(`access.policy.outcomes.${check.outcome}`)}</span>
            {check.rule ? <code>{check.rule}</code> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function PolicyLayerDisclosure(props: { rules: PolicyRules }): ReactNode {
  const t = useTranslate();
  return (
    <details className="policy-layer-disclosure">
      <summary>
        <ShieldCheck size={16} />
        <strong>{t("access.policy.deploymentSummary.title")}</strong>
        <span>{policyLayerSummary(props.rules, t)}</span>
        <ChevronDown size={15} />
      </summary>
      <PolicyRuleReadout rules={props.rules} />
    </details>
  );
}

function RuntimePolicySummary(props: { policy: RuntimePolicyState; status: string | null; onEdit(): void }): ReactNode {
  const t = useTranslate();
  return (
    <>
      <section className="runtime-policy-summary">
        <div>
          <Save size={16} />
          <strong>{t("access.policy.runtimeSummary.title")}</strong>
        </div>
        <p>{policyLayerSummary(props.policy.runtime, t)}</p>
        {props.policy.updatedAt ? (
          <span>{t("access.policy.runtimeSummary.updated", { date: formatDate(props.policy.updatedAt) })}</span>
        ) : null}
        <Button onClick={props.onEdit}>
          <Pencil size={15} />
          {t("access.policy.runtimeSummary.edit")}
        </Button>
      </section>
      {props.status ? <FormStatus message={props.status} /> : null}
    </>
  );
}

function RuntimePolicyEditor(props: {
  draft: PolicyEditorDraft;
  draftState: RuntimePolicyState;
  providers: ProviderDefinition[];
  dirty: boolean;
  risk: "actions" | "proxies" | "all" | null;
  saving: boolean;
  status: string | null;
  onDraftChange(draft: PolicyEditorDraft): void;
  onDiscard(): void;
  onSave(): void;
}): ReactNode {
  const t = useTranslate();
  const issues = validatePolicyEditorDraft(props.draft, true);

  return (
    <section className="runtime-policy-editor">
      <div className="runtime-policy-editor-heading">
        <div>
          <h3>{t("access.policy.editor.title")}</h3>
          <p>{t("access.policy.editor.description")}</p>
        </div>
        <Badge tone={props.dirty ? "warning" : undefined}>
          {t(props.dirty ? "access.policy.editor.unsaved" : "access.policy.editor.noChanges")}
        </Badge>
      </div>
      <div className="runtime-policy-editor-grid">
        <PolicyEditor draft={props.draft} providers={props.providers} includeProxies onChange={props.onDraftChange} />
        <aside className="policy-impact-panel" id="runtime-policy-impact">
          <h3>{t("access.policy.impact.title")}</h3>
          <p>{t("access.policy.impact.description")}</p>
          <PolicyBaseline policy={props.draftState} providers={props.providers} />
          <PolicyTester policy={props.draftState} providers={props.providers} tokens={[]} compact />
          {props.risk ? (
            <div className="policy-risk-warning" role="alert">
              <AlertTriangle size={16} />
              <span>{t(`access.policy.impact.${props.risk}Blocked`)}</span>
            </div>
          ) : null}
        </aside>
      </div>
      <div className="runtime-policy-actions">
        <span>{t(props.dirty ? "access.policy.editor.unsaved" : "access.policy.editor.noChanges")}</span>
        <div className="button-row">
          <Button type="button" variant="outline" onClick={props.onDiscard}>
            <RotateCcw size={15} />
            {t("access.policy.editor.discard")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById("runtime-policy-impact")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Eye size={15} />
            {t("access.policy.editor.preview")}
          </Button>
          <Button type="button" disabled={!props.dirty || issues.length > 0 || props.saving} onClick={props.onSave}>
            {props.saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
            {t("access.policy.save")}
          </Button>
        </div>
      </div>
      {props.status ? <FormStatus message={props.status} /> : null}
    </section>
  );
}

function PolicyRuleReadout(props: { rules: PolicyRules }): ReactNode {
  const t = useTranslate();
  const fields: Array<[keyof PolicyRules, string]> = [
    ["allowedActions", t("access.policy.allowedActions")],
    ["blockedActions", t("access.policy.blockedActions")],
    ["allowedProxies", t("access.policy.allowedProxies")],
    ["blockedProxies", t("access.policy.blockedProxies")],
  ];
  return (
    <div className="policy-rule-readout">
      {fields.map(([field, label]) => (
        <div key={field}>
          <strong>{label}</strong>
          {props.rules[field].length > 0 ? (
            <div>
              {props.rules[field].map((rule) => (
                <code key={rule}>{rule}</code>
              ))}
            </div>
          ) : (
            <span>{t("access.policy.deploymentSummary.none")}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function CreateTokenDialog(props: CreateTokenDialogProps): ReactNode {
  const t = useTranslate();
  const mode = createTokenDialogMode(props.created);
  const created = mode === "created" ? props.created : null;
  const issues = validatePolicyEditorDraft(props.draft, false);

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="token-dialog policy-token-dialog max-w-[min(760px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(760px,calc(100vw-2rem))]"
        showCloseButton={false}
      >
        <DialogHeader className="token-dialog-header">
          <div>
            <DialogTitle>{mode === "created" ? t("access.newToken") : t("access.createToken")}</DialogTitle>
            <DialogDescription>
              {mode === "created" ? t("access.tokenShownOnce") : t("access.createTokenDescription")}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label={t("access.closeCreateToken")}>
            <X size={16} />
          </Button>
        </DialogHeader>
        <div className="token-dialog-body">
          {created ? (
            <>
              <section className="example-card token-result">
                <div className="tab-row">
                  <strong>{t("access.newToken")}</strong>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => props.onCopy(created.token)}
                    aria-label={props.copied ? t("access.copiedRuntimeToken") : t("access.copyRuntimeToken")}
                  >
                    {props.copied ? <Check size={15} /> : <Copy size={15} />}
                    {props.copied ? t("access.copiedToken") : t("access.copyToken")}
                  </Button>
                </div>
                <pre>{created.token}</pre>
              </section>
              <FormStatus message={t("access.tokenShownOnce")} />
              <div className="button-row">
                <Button variant="outline" type="button" onClick={props.onClose}>
                  {t("common.close")}
                </Button>
              </div>
            </>
          ) : (
            <form className="token-dialog-form" onSubmit={(event) => void props.onSubmit(event)}>
              <Label className="field">
                <span>{t("access.name")}</span>
                <Input
                  value={props.name}
                  onChange={(event) => props.onNameChange(event.target.value)}
                  placeholder={t("access.namePlaceholder")}
                />
              </Label>
              <div className="token-policy-intro">{t("access.policy.editor.tokenHint")}</div>
              <PolicyEditor
                draft={props.draft}
                providers={props.providers}
                includeProxies={false}
                onChange={props.onDraftChange}
              />
              <div className="button-row">
                <Button type="submit" disabled={!props.name.trim() || issues.length > 0}>
                  <KeyRound size={16} />
                  {t("access.createToken")}
                </Button>
                <Button variant="outline" type="button" onClick={props.onClose}>
                  {t("common.close")}
                </Button>
              </div>
              {props.status ? <FormStatus message={props.status} /> : null}
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EditTokenPolicyDialogProps {
  token: RuntimeTokenSummary;
  draft: PolicyEditorDraft;
  providers: ProviderDefinition[];
  status: string | null;
  onDraftChange(draft: PolicyEditorDraft): void;
  onSubmit(event: FormEvent): Promise<void>;
  onClose(): void;
}

function EditTokenPolicyDialog(props: EditTokenPolicyDialogProps): ReactNode {
  const t = useTranslate();
  const issues = validatePolicyEditorDraft(props.draft, false);
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="policy-token-dialog max-h-[calc(100svh-2rem)] max-w-[min(760px,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(760px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("access.policy.editToken")}</DialogTitle>
          <DialogDescription>{props.token.name}</DialogDescription>
        </DialogHeader>
        <form className="token-dialog-form" onSubmit={(event) => void props.onSubmit(event)}>
          <div className="token-policy-intro">{t("access.policy.editor.tokenHint")}</div>
          <PolicyEditor
            draft={props.draft}
            providers={props.providers}
            includeProxies={false}
            onChange={props.onDraftChange}
          />
          <div className="button-row">
            <Button type="submit" disabled={issues.length > 0}>
              <Save size={16} />
              {t("access.policy.save")}
            </Button>
            <Button variant="outline" type="button" onClick={props.onClose}>
              {t("common.close")}
            </Button>
          </div>
          {props.status ? <FormStatus message={props.status} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function policyDraftFromRules(rules: PolicyRules): PolicyDraft {
  return {
    allowedActions: rules.allowedActions.join("\n"),
    blockedActions: rules.blockedActions.join("\n"),
    allowedProxies: rules.allowedProxies.join("\n"),
    blockedProxies: rules.blockedProxies.join("\n"),
  };
}

export function policyRulesFromDraft(draft: PolicyDraft): PolicyRules {
  return {
    allowedActions: parsePolicyLines(draft.allowedActions),
    blockedActions: parsePolicyLines(draft.blockedActions),
    allowedProxies: parsePolicyLines(draft.allowedProxies),
    blockedProxies: parsePolicyLines(draft.blockedProxies),
  };
}

function tokenPolicySummary(token: RuntimeTokenSummary, t: NonNullable<ReturnType<typeof useTranslate>>): string {
  return t("access.policy.tokenSummary", {
    allowed: token.allowedActions.length,
    blocked: token.blockedActions.length,
  });
}

function policyLayerSummary(rules: PolicyRules, t: NonNullable<ReturnType<typeof useTranslate>>): string {
  const action = resourcePolicySummary(rules.allowedActions, rules.blockedActions, t);
  const proxy = resourcePolicySummary(rules.allowedProxies, rules.blockedProxies, t);
  return t("access.policy.layerSummary", { action, proxy });
}

function resourcePolicySummary(
  allowed: string[],
  blocked: string[],
  t: NonNullable<ReturnType<typeof useTranslate>>,
): string {
  const allowSummary =
    allowed.length === 0
      ? t("access.policy.summary.unrestricted")
      : t("access.policy.summary.restricted", { count: allowed.length });
  return blocked.length === 0
    ? allowSummary
    : t("access.policy.summary.withBlocked", { allow: allowSummary, count: blocked.length });
}

function configuredRuleCount(rules: PolicyRules): number {
  return Object.values(rules).reduce((count, values) => count + values.length, 0);
}

function policyRisk(policy: RuntimePolicyState, providers: ProviderDefinition[]): "actions" | "proxies" | "all" | null {
  const layers = policyLayers(policy);
  const actions = countAllowedActions(providers, layers);
  const proxies = countAllowedProxies(providers, layers);
  const actionsBlocked = actions.total > 0 && actions.allowed === 0;
  const proxiesBlocked = proxies.total > 0 && proxies.allowed === 0;
  return actionsBlocked && proxiesBlocked ? "all" : actionsBlocked ? "actions" : proxiesBlocked ? "proxies" : null;
}

function emptyPolicyRules(): PolicyRules {
  return { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };
}
