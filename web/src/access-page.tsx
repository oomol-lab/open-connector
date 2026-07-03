import type { RuntimeTokenCreation, RuntimeTokenSummary } from "./model";
import type { FormEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import { Check, Copy, KeyRound, Trash2, X } from "lucide-react";
import { useState } from "react";
import { apiDelete, apiPost } from "./api";
import { formatDate } from "./model";
import { Badge, EmptyState } from "./shared-ui";

interface AccessPageProps {
  tokens: RuntimeTokenSummary[];
  adminToken?: string;
  onRefresh(): void;
}

interface CreateTokenDialogProps {
  name: string;
  created: RuntimeTokenCreation | null;
  status: string | null;
  copied: boolean;
  onNameChange(name: string): void;
  onSubmit(event: FormEvent): Promise<void>;
  onCopy(token: string): void;
  onClose(): void;
}

export function createTokenDialogMode(created: RuntimeTokenCreation | null): "form" | "created" {
  return created ? "created" : "form";
}

export function AccessPage(props: AccessPageProps): ReactNode {
  const t = useTranslate();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<RuntimeTokenCreation | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { copy, copied } = useClipboard();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus(t("access.creating"));
    setCreated(null);
    try {
      const result = await apiPost<RuntimeTokenCreation>(
        "/api/runtime-tokens",
        { name },
        { adminToken: props.adminToken },
      );
      setCreated(result);
      setName("");
      setStatus(t("access.created"));
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("access.createFailed"));
    }
  }

  async function revoke(id: string): Promise<void> {
    setStatus(t("access.revoking"));
    try {
      await apiDelete(`/api/runtime-tokens/${id}`, { adminToken: props.adminToken });
      setStatus(t("access.revoked"));
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("access.revokeFailed"));
    }
  }

  function openCreate(): void {
    setName("");
    setCreated(null);
    setStatus(null);
    setCreateOpen(true);
  }

  function closeCreate(): void {
    setCreateOpen(false);
    setName("");
    setCreated(null);
    setStatus(null);
  }

  return (
    <section className="detail-panel access-panel">
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

        <button className="primary-button" type="button" onClick={openCreate}>
          <KeyRound size={16} />
          {t("access.createToken")}
        </button>
      </div>

      {!createOpen && status ? <p className="form-status">{status}</p> : null}

      <section className="table-panel">
        {props.tokens.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={20} />}
            title={t("access.noTokensTitle")}
            description={t("access.noTokensDescription")}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("access.table.name")}</th>
                <th>{t("access.table.status")}</th>
                <th>{t("access.table.created")}</th>
                <th>{t("access.table.lastUsed")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.tokens.map((token) => (
                <tr key={token.id}>
                  <td>
                    <strong>{token.name}</strong>
                  </td>
                  <td>
                    {token.revokedAt ? (
                      <Badge>{t("common.revoked")}</Badge>
                    ) : (
                      <Badge tone="success">{t("common.active")}</Badge>
                    )}
                  </td>
                  <td>{formatDate(token.createdAt)}</td>
                  <td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : ""}</td>
                  <td className="table-actions">
                    {!token.revokedAt ? (
                      <button className="secondary-button compact" onClick={() => void revoke(token.id)}>
                        <Trash2 size={15} />
                        {t("access.revoke")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {createOpen ? (
        <CreateTokenDialog
          name={name}
          created={created}
          status={status}
          copied={copied}
          onNameChange={setName}
          onSubmit={submit}
          onCopy={(token) => void copy(token)}
          onClose={closeCreate}
        />
      ) : null}
    </section>
  );
}

function CreateTokenDialog(props: CreateTokenDialogProps): ReactNode {
  const t = useTranslate();
  const mode = createTokenDialogMode(props.created);
  const created = mode === "created" ? props.created : null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-panel token-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-token-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="create-token-title">{mode === "created" ? t("access.newToken") : t("access.createToken")}</h3>
            <p>{mode === "created" ? t("access.tokenShownOnce") : t("access.createTokenDescription")}</p>
          </div>
          <button className="icon-button subtle" onClick={props.onClose} aria-label={t("access.closeCreateToken")}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {created ? (
            <>
              <section className="example-card token-result">
                <div className="tab-row">
                  <strong>{t("access.newToken")}</strong>
                  <button
                    className="secondary-button compact"
                    onClick={() => props.onCopy(created.token)}
                    aria-label={props.copied ? t("access.copiedRuntimeToken") : t("access.copyRuntimeToken")}
                  >
                    {props.copied ? <Check size={15} /> : <Copy size={15} />}
                    {props.copied ? t("access.copiedToken") : t("access.copyToken")}
                  </button>
                </div>
                <pre>{created.token}</pre>
              </section>
              <p className="form-status">{t("access.tokenShownOnce")}</p>
              <div className="button-row">
                <button className="secondary-button" type="button" onClick={props.onClose}>
                  {t("common.close")}
                </button>
              </div>
            </>
          ) : (
            <form className="token-dialog-form" onSubmit={(event) => void props.onSubmit(event)}>
              <label className="field">
                <span>{t("access.name")}</span>
                <input
                  value={props.name}
                  onChange={(event) => props.onNameChange(event.target.value)}
                  placeholder={t("access.namePlaceholder")}
                />
              </label>
              <div className="button-row">
                <button className="primary-button" type="submit" disabled={!props.name.trim()}>
                  <KeyRound size={16} />
                  {t("access.createToken")}
                </button>
                <button className="secondary-button" type="button" onClick={props.onClose}>
                  {t("common.close")}
                </button>
              </div>
              {props.status ? <p className="form-status">{props.status}</p> : null}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
