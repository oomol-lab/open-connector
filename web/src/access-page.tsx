import type { RuntimeTokenCreation, RuntimeTokenSummary } from "./model";
import type { FormEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import { Check, Copy, KeyRound, Trash2, X } from "lucide-react";
import { useState } from "react";
import { apiDelete, apiPost } from "./api";
import { formatDate } from "./model";
import { Badge, EmptyState, FormStatus } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AccessPageProps {
  tokens: RuntimeTokenSummary[];
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
      const result = await apiPost<RuntimeTokenCreation>("/api/runtime-tokens", { name });
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
      await apiDelete(`/api/runtime-tokens/${id}`);
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

        <Button type="button" onClick={openCreate}>
          <KeyRound size={16} />
          {t("access.createToken")}
        </Button>
      </div>

      {!createOpen && status ? <FormStatus message={status} /> : null}

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
                  <TableCell>{formatDate(token.createdAt)}</TableCell>
                  <TableCell>{token.lastUsedAt ? formatDate(token.lastUsedAt) : ""}</TableCell>
                  <TableCell className="table-actions">
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
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="token-dialog max-w-[min(640px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(640px,calc(100vw-2rem))]"
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
              <div className="button-row">
                <Button type="submit" disabled={!props.name.trim()}>
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
