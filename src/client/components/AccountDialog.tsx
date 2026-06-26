import {
  Button,
  Dialog,
  Input,
  Label,
  SensitiveInput,
  Text,
  Textarea,
} from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import type { Account, AccountFormData } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
  onSave: (form: AccountFormData) => Promise<void>;
}

const EMPTY_FORM: AccountFormData = {
  name: "",
  workspaceId: "",
  authCookie: "",
  notes: "",
};

export default function AccountDialog({
  open,
  onOpenChange,
  account,
  onSave,
}: Props) {
  const [form, setForm] = useState<AccountFormData>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(account);

  useEffect(() => {
    if (open) {
      setError("");
      setForm(
        account
          ? {
              name: account.name,
              workspaceId: account.workspaceId,
              authCookie: "",
              notes: account.notes,
            }
          : EMPTY_FORM
      );
    }
  }, [open, account]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="max-w-lg p-6">
        <Dialog.Title>{isEdit ? "编辑账号" : "添加账号"}</Dialog.Title>
        <Dialog.Description className="mt-1">
          从浏览器开发者工具复制 auth Cookie 和 Workspace ID。Cookie 保存后不会再次显示。
        </Dialog.Description>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-name">显示名称</Label>
            <Input
              id="account-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="张三 / 主号 / dev-team-01"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-id">Workspace ID</Label>
            <Input
              id="workspace-id"
              value={form.workspaceId}
              onChange={(e) =>
                setForm((f) => ({ ...f, workspaceId: e.target.value }))
              }
              placeholder="wrk_xxxxxxxx"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-cookie">
              Auth Cookie{isEdit ? "（留空则保持不变）" : ""}
            </Label>
            <SensitiveInput
              id="auth-cookie"
              value={form.authCookie}
              onChange={(e) =>
                setForm((f) => ({ ...f, authCookie: e.target.value }))
              }
              placeholder="Fe26.2**..."
              required={!isEdit}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-notes">备注（可选）</Label>
            <Textarea
              id="account-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="团队、用途、到期提醒等"
              rows={2}
            />
          </div>

          {error ? (
            <Text
              variant="secondary"
              as="p"
              DANGEROUS_className="m-0 text-sm text-kumo-danger"
            >
              {error}
            </Text>
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}