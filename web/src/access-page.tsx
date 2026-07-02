import type { RuntimeTokenCreation, RuntimeTokenSummary } from "./model";
import type { FormEvent, ReactNode } from "react";

import { useClipboard } from "foxact/use-clipboard";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiDelete, apiPost } from "./api";
import { formatDate } from "./model";
import { Badge, EmptyState } from "./shared-ui";

interface AccessPageProps {
  tokens: RuntimeTokenSummary[];
  adminToken?: string;
  onRefresh(): void;
}

export function AccessPage(props: AccessPageProps): ReactNode {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<RuntimeTokenCreation | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { copy, copied } = useClipboard();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("Creating token...");
    setCreated(null);
    try {
      const result = await apiPost<RuntimeTokenCreation>(
        "/api/runtime-tokens",
        { name },
        { adminToken: props.adminToken },
      );
      setCreated(result);
      setName("");
      setStatus("Token created.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create token.");
    }
  }

  async function revoke(id: string): Promise<void> {
    setStatus("Revoking token...");
    try {
      await apiDelete(`/api/runtime-tokens/${id}`, { adminToken: props.adminToken });
      setStatus("Token revoked.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to revoke token.");
    }
  }

  return (
    <section className="detail-panel access-panel">
      <div className="access-panel-header">
        <div className="detail-heading">
          <div className="action-mark">
            <KeyRound size={20} />
          </div>
          <div>
            <h2>Runtime Tokens</h2>
            <p>Issue bearer tokens for /v1 and MCP clients. New tokens are shown once.</p>
          </div>
        </div>

        <form className="token-create-form" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Local MCP client" />
          </label>
          <button className="primary-button" type="submit" disabled={!name.trim()}>
            <KeyRound size={16} />
            Create Token
          </button>
        </form>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      {created ? (
        <section className="example-card token-result">
          <div className="tab-row">
            <strong>New token</strong>
            <button
              className="icon-button subtle"
              onClick={() => void copy(created.token)}
              aria-label={copied ? "Copied runtime token" : "Copy runtime token"}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <pre>{created.token}</pre>
        </section>
      ) : null}

      <section className="table-panel">
        {props.tokens.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={20} />}
            title="No runtime tokens yet"
            description="Create one before connecting an MCP client or local script. The token is shown once."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.tokens.map((token) => (
                <tr key={token.id}>
                  <td>
                    <strong>{token.name}</strong>
                  </td>
                  <td>{token.revokedAt ? <Badge>Revoked</Badge> : <Badge tone="success">Active</Badge>}</td>
                  <td>{formatDate(token.createdAt)}</td>
                  <td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : ""}</td>
                  <td className="table-actions">
                    {!token.revokedAt ? (
                      <button className="secondary-button compact" onClick={() => void revoke(token.id)}>
                        <Trash2 size={15} />
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
