import type { PolicyRules, ProviderDefinition } from "./model";
import type { AllowMode, PolicyEditorDraft, PolicyResource } from "./policy";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  filterPolicyRuleCandidates,
  isKnownPolicyRule,
  parsePolicyLines,
  policyRuleCandidates,
  policyRuleIssue,
  validatePolicyEditorDraft,
} from "./policy";
import { PolicySuggestionInput } from "./policy-suggestion-input";
import { Badge } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface PolicyEditorProps {
  draft: PolicyEditorDraft;
  providers: ProviderDefinition[];
  includeProxies: boolean;
  onChange(draft: PolicyEditorDraft): void;
}

export function PolicyEditor(props: PolicyEditorProps): ReactNode {
  const t = useTranslate();
  const issues = validatePolicyEditorDraft(props.draft, props.includeProxies);
  const actionEditor = (
    <PolicyResourceEditor resource="action" draft={props.draft} providers={props.providers} onChange={props.onChange} />
  );

  return (
    <div className="structured-policy-editor">
      {props.includeProxies ? (
        <Tabs defaultValue="action">
          <TabsList variant="line" aria-label={t("access.policy.editor.resourceLabel")}>
            <TabsTrigger value="action">{t("access.policy.editor.actionsTab")}</TabsTrigger>
            <TabsTrigger value="proxy">{t("access.policy.editor.proxiesTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="action">{actionEditor}</TabsContent>
          <TabsContent value="proxy">
            <PolicyResourceEditor
              resource="proxy"
              draft={props.draft}
              providers={props.providers}
              onChange={props.onChange}
            />
          </TabsContent>
        </Tabs>
      ) : (
        actionEditor
      )}
      {issues.length > 0 ? (
        <div className="policy-editor-error" role="alert">
          <CircleAlert size={15} />
          <span>{draftIssueLabel(issues[0], t)}</span>
        </div>
      ) : null}
    </div>
  );
}

interface PolicyResourceEditorProps {
  resource: PolicyResource;
  draft: PolicyEditorDraft;
  providers: ProviderDefinition[];
  onChange(draft: PolicyEditorDraft): void;
}

function PolicyResourceEditor(props: PolicyResourceEditorProps): ReactNode {
  const t = useTranslate();
  const fields = resourceFields(props.resource);
  const allowMode = props.draft[fields.allowMode];

  function setAllowMode(mode: AllowMode): void {
    props.onChange({
      ...props.draft,
      [fields.allowMode]: mode,
      rules: mode === "unrestricted" ? { ...props.draft.rules, [fields.allowed]: [] } : props.draft.rules,
    });
  }

  function setRules(field: keyof PolicyRules, values: string[]): void {
    props.onChange({ ...props.draft, rules: { ...props.draft.rules, [field]: values } });
  }

  return (
    <div className="policy-resource-editor">
      <fieldset className="policy-allow-mode">
        <legend>{t("access.policy.editor.allowMode")}</legend>
        <label>
          <input
            type="radio"
            name={`${props.resource}-allow-mode`}
            value="unrestricted"
            checked={allowMode === "unrestricted"}
            onChange={() => setAllowMode("unrestricted")}
          />
          <span>
            <strong>{t("access.policy.editor.unrestricted")}</strong>
            <small>{t(`access.policy.editor.${props.resource}UnrestrictedHint`)}</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name={`${props.resource}-allow-mode`}
            value="restricted"
            checked={allowMode === "restricted"}
            onChange={() => setAllowMode("restricted")}
          />
          <span>
            <strong>{t("access.policy.editor.restricted")}</strong>
            <small>{t(`access.policy.editor.${props.resource}RestrictedHint`)}</small>
          </span>
        </label>
      </fieldset>

      {allowMode === "restricted" ? (
        <RuleListEditor
          resource={props.resource}
          effect="allow"
          values={props.draft.rules[fields.allowed]}
          providers={props.providers}
          onChange={(values) => setRules(fields.allowed, values)}
        />
      ) : null}

      <RuleListEditor
        resource={props.resource}
        effect="block"
        values={props.draft.rules[fields.blocked]}
        providers={props.providers}
        onChange={(values) => setRules(fields.blocked, values)}
      />

      <details className="policy-advanced-editor">
        <summary>{t("access.policy.editor.advanced")}</summary>
        <p>{t("access.policy.editor.advancedHint")}</p>
        <div className="policy-advanced-grid">
          <Label className="field">
            <span>{t("access.policy.editor.allowedRaw")}</span>
            <Textarea
              value={allowMode === "restricted" ? props.draft.rules[fields.allowed].join("\n") : ""}
              placeholder={props.resource === "action" ? "github.*" : "github"}
              onChange={(event) => {
                const values = parsePolicyLines(event.target.value);
                props.onChange({
                  ...props.draft,
                  [fields.allowMode]: values.length > 0 ? "restricted" : "unrestricted",
                  rules: { ...props.draft.rules, [fields.allowed]: values },
                });
              }}
            />
          </Label>
          <Label className="field">
            <span>{t("access.policy.editor.blockedRaw")}</span>
            <Textarea
              value={props.draft.rules[fields.blocked].join("\n")}
              placeholder={props.resource === "action" ? "github.delete_repository" : "*"}
              onChange={(event) => setRules(fields.blocked, parsePolicyLines(event.target.value))}
            />
          </Label>
        </div>
      </details>
    </div>
  );
}

interface RuleListEditorProps {
  resource: PolicyResource;
  effect: "allow" | "block";
  values: string[];
  providers: ProviderDefinition[];
  onChange(values: string[]): void;
}

function RuleListEditor(props: RuleListEditorProps): ReactNode {
  const t = useTranslate();
  const listId = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const candidates = useMemo(
    () => policyRuleCandidates(props.providers, props.resource),
    [props.providers, props.resource],
  );
  const suggestions = useMemo(() => {
    return input.trim() ? filterPolicyRuleCandidates(candidates, input, 6) : [];
  }, [candidates, input]);

  function addRule(): boolean {
    const rule = input.trim();
    if (!rule) {
      setError(t("access.policy.editor.ruleRequired"));
      return false;
    }
    const issue = policyRuleIssue(rule, props.resource);
    if (issue) {
      setError(t(`access.policy.editor.${issue === "too_long" ? "ruleTooLong" : "ruleInvalid"}`));
      return false;
    }
    if (props.values.includes(rule)) {
      setError(t("access.policy.editor.ruleDuplicate"));
      return false;
    }
    if (props.values.length >= 128) {
      setError(t("access.policy.editor.tooManyRules"));
      return false;
    }
    props.onChange([...props.values, rule]);
    setInput("");
    setError(null);
    setSuggestionsOpen(false);
    return true;
  }

  return (
    <section className="policy-rule-section">
      <div className="policy-rule-heading">
        <div>
          <h4>{t(`access.policy.editor.${props.effect === "allow" ? "allowedList" : "blockedList"}`)}</h4>
          <p>
            {t(`access.policy.editor.${props.resource}${props.effect === "allow" ? "AllowedHint" : "BlockedHint"}`)}
          </p>
        </div>
        <span>{t("access.policy.editor.ruleCount", { count: props.values.length })}</span>
      </div>
      <div className="policy-rule-add">
        <label className="sr-only" htmlFor={`${listId}-input`}>
          {t(`access.policy.editor.${props.resource}${props.effect === "allow" ? "AllowedInput" : "BlockedInput"}`)}
        </label>
        <PolicySuggestionInput
          id={`${listId}-input`}
          value={input}
          suggestions={suggestions}
          invalid={Boolean(error)}
          open={suggestionsOpen}
          placeholder={t(
            `access.policy.editor.${props.resource}${props.effect === "allow" ? "AllowedInput" : "BlockedInput"}`,
          )}
          onChange={(value) => {
            setInput(value);
            setError(null);
          }}
          onOpenChange={setSuggestionsOpen}
          onSubmit={addRule}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("access.policy.editor.addRule")}
          onClick={(event) => {
            if (addRule()) {
              event.currentTarget.focus();
            }
          }}
        >
          <Plus size={16} />
        </Button>
      </div>
      {error ? <p className="policy-rule-error">{error}</p> : null}
      {props.values.length > 0 ? (
        <div className="policy-rule-list">
          {props.values.map((rule) => {
            const known = isKnownPolicyRule(rule, props.resource, props.providers);
            return (
              <div className="policy-rule-row" key={rule}>
                <code>{rule}</code>
                {!known ? <span className="policy-rule-unknown">{t("access.policy.editor.unknownRule")}</span> : null}
                <Badge tone={props.effect === "allow" ? "success" : "error"}>
                  {t(`access.policy.editor.${props.effect}`)}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("access.policy.editor.removeRule", { rule })}
                  onClick={() => props.onChange(props.values.filter((value) => value !== rule))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="policy-rule-empty">{t("access.policy.editor.noRules")}</p>
      )}
    </section>
  );
}

function resourceFields(resource: PolicyResource): {
  allowed: "allowedActions" | "allowedProxies";
  blocked: "blockedActions" | "blockedProxies";
  allowMode: "actionAllowMode" | "proxyAllowMode";
} {
  return resource === "action"
    ? { allowed: "allowedActions", blocked: "blockedActions", allowMode: "actionAllowMode" }
    : { allowed: "allowedProxies", blocked: "blockedProxies", allowMode: "proxyAllowMode" };
}

function draftIssueLabel(
  issue: ReturnType<typeof validatePolicyEditorDraft>[number],
  t: NonNullable<ReturnType<typeof useTranslate>>,
): string {
  if (issue.code === "required") {
    return t(
      issue.field === "allowedActions"
        ? "access.policy.editor.actionAllowRequired"
        : "access.policy.editor.proxyAllowRequired",
    );
  }
  if (issue.code === "too_many") {
    return t("access.policy.editor.tooManyRules");
  }
  return t(issue.code === "too_long" ? "access.policy.editor.ruleTooLong" : "access.policy.editor.ruleInvalid");
}
