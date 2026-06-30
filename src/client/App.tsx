import { Button, Loader, Text } from "@cloudflare/kumo";
import { ArrowsClockwise, Plus, SignOut } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AccountDialog from "./components/AccountDialog";
import AccountTable from "./components/AccountTable";
import HistoryDialog from "./components/HistoryDialog";
import LoginForm from "./components/LoginForm";
import {
  checkAuth,
  createAccount,
  deleteAccount,
  fetchAccounts,
  logout,
  refreshAll,
  refreshOne,
  updateAccount,
} from "./lib/api";
import { usageStatus } from "./lib/format";
import type { Account, AccountFormData, AccountWithUsage } from "./types";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<AccountWithUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [historyAccount, setHistoryAccount] = useState<AccountWithUsage | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchAccounts();
      setAccounts((prev) =>
        list.map((account) => {
          const existing = prev.find((a) => a.id === account.id);
          return { ...account, usage: existing?.usage ?? null };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const ok = await checkAuth();
        setAuthed(ok);
        if (ok) await loadAccounts();
      } catch {
        setAuthed(false);
      }
    })();
  }, [loadAccounts]);

  const summary = useMemo(() => {
    const withUsage = accounts.filter((a) => a.usage && !a.usage.error);
    const danger = withUsage.filter((a) => {
      const u = a.usage!;
      const max = Math.max(
        u.rolling?.usagePercent ?? 0,
        u.weekly?.usagePercent ?? 0,
        u.monthly?.usagePercent ?? 0
      );
      return usageStatus(max) === "danger";
    }).length;
    const warn = withUsage.filter((a) => {
      const u = a.usage!;
      const max = Math.max(
        u.rolling?.usagePercent ?? 0,
        u.weekly?.usagePercent ?? 0,
        u.monthly?.usagePercent ?? 0
      );
      return usageStatus(max) === "warn";
    }).length;
    return { total: accounts.length, danger, warn };
  }, [accounts]);

  async function handleLogout() {
    await logout();
    setAuthed(false);
    setAccounts([]);
  }

  async function handleRefreshAll() {
    setRefreshingAll(true);
    setError("");
    try {
      const results = await refreshAll();
      const map = new Map(results.map((a) => [a.id, a]));
      setAccounts((prev) =>
        prev.map((a) => map.get(a.id) ?? a)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setRefreshingAll(false);
    }
  }

  async function handleRefreshOne(id: string) {
    setRefreshingIds((prev) => new Set(prev).add(id));
    try {
      const usage = await refreshOne(id);
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, usage } : a))
      );
    } catch (err) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                usage: {
                  rolling: null,
                  weekly: null,
                  monthly: null,
                  plan: null,
                  fetchedAt: new Date().toISOString(),
                  error: err instanceof Error ? err.message : "查询失败",
                },
              }
            : a
        )
      );
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleSave(form: AccountFormData) {
    if (editingAccount) {
      const payload: Partial<AccountFormData> = {
        name: form.name,
        workspaceId: form.workspaceId,
        notes: form.notes,
      };
      if (form.authCookie.trim()) {
        payload.authCookie = form.authCookie;
      }
      const updated = await updateAccount(editingAccount.id, payload);
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === updated.id ? { ...updated, usage: a.usage } : a
        )
      );
    } else {
      const created = await createAccount(form);
      setAccounts((prev) => [...prev, { ...created, usage: null }]);
    }
  }

  async function handleDelete(account: AccountWithUsage) {
    if (!confirm(`确定删除账号「${account.name}」？`)) return;
    await deleteAccount(account.id);
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
  }

  if (authed === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-kumo-subtle">
        <Loader />
        加载中…
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginForm
        onSuccess={async () => {
          setAuthed(true);
          await loadAccounts();
        }}
      />
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text variant="heading2" as="h1" DANGEROUS_className="m-0">
            OpenCode Go 额度管理
          </Text>
          <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-1 text-sm">
            团队多账号用量一览 · Cookie 仅存服务端
          </Text>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-kumo-subtle">
            <span>共 {summary.total} 个账号</span>
            {summary.warn > 0 ? (
              <span className="text-kumo-warning">⚠ {summary.warn} 个接近上限</span>
            ) : null}
            {summary.danger > 0 ? (
              <span className="text-kumo-danger">● {summary.danger} 个需关注</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={ArrowsClockwise}
            onClick={handleRefreshAll}
            disabled={refreshingAll || accounts.length === 0}
          >
            {refreshingAll ? "刷新中…" : "全部刷新"}
          </Button>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => {
              setEditingAccount(null);
              setDialogOpen(true);
            }}
          >
            添加账号
          </Button>
          <Button variant="secondary" icon={SignOut} onClick={handleLogout}>
            退出
          </Button>
        </div>
      </header>

      {error ? (
        <Text
          variant="secondary"
          as="p"
          DANGEROUS_className="mb-4 text-kumo-danger"
        >
          {error}
        </Text>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-kumo-subtle">
          <Loader />
          加载账号…
        </div>
      ) : (
        <AccountTable
          accounts={accounts}
          refreshingIds={refreshingIds}
          onRefresh={handleRefreshOne}
          onEdit={(account) => {
            setEditingAccount(account);
            setDialogOpen(true);
          }}
          onDelete={handleDelete}
          onHistory={(account) => setHistoryAccount(account)}
        />
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
        onSave={handleSave}
      />

      <HistoryDialog
        open={historyAccount !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryAccount(null);
        }}
        accountId={historyAccount?.id ?? ""}
        accountName={historyAccount?.name ?? ""}
      />

      <Text
        variant="secondary"
        as="p"
        DANGEROUS_className="m-0 mt-8 text-center text-xs"
      >
        额度数据来自 opencode.ai Dashboard 页面解析，Cookie 过期后需重新复制更新
      </Text>
    </div>
  );
}