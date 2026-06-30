import {
  Button,
  Dialog,
  Loader,
  Text,
} from "@cloudflare/kumo";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { fetchUsageHistory } from "../lib/api";
import type { UsageHistoryItem, UsageHistoryResult } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountId: string;
}

const PAGE_STEP = 1;

function formatTokens(n: number): string {
  return n.toLocaleString("zh-CN");
}

function formatCost(cost: number): string {
  // OpenCode cost is the dollar value scaled by 10^9 (e.g. 6308544 ≈ $0.0063).
  const usd = cost / 1_000_000_000;
  return `$${usd.toFixed(6)}`;
}

function cacheRate(item: UsageHistoryItem): string {
  const denom = item.inputTokens + item.cacheReadTokens;
  if (denom === 0) return "—";
  return `${((item.cacheReadTokens / denom) * 100).toFixed(1)}%`;
}

export default function HistoryDialog({
  open,
  onOpenChange,
  accountName,
  accountId,
}: Props) {
  const [data, setData] = useState<UsageHistoryResult | null>(null);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setData(null);
      setCursor(0);
      setError("");
      return;
    }
  }, [open, accountId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchUsageHistory(accountId, cursor);
        if (cancelled) return;
        setData(res);
        if (res.error) setError(res.error);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载历史失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, cursor]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="max-w-5xl p-6">
        <Dialog.Title>使用历史 · {accountName}</Dialog.Title>
        <Dialog.Description className="mt-1">
          来自 opencode.ai 的最近用量记录。
        </Dialog.Description>

        <div className="mt-4 max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-kumo-subtle">
              <Loader />
              加载历史…
            </div>
          ) : error ? (
            <Text
              variant="secondary"
              as="p"
              DANGEROUS_className="m-0 text-sm text-kumo-danger"
            >
              {error}
            </Text>
          ) : data && data.items.length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-kumo-subtle">
                  <th className="border-b border-kumo-line px-2 py-2">时间</th>
                  <th className="border-b border-kumo-line px-2 py-2">模型</th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">输入</th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">输出</th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">推理</th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">缓存读</th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">缓存率</th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">费用</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: UsageHistoryItem) => (
                  <tr key={item.id} className="align-top">
                    <td className="border-b border-kumo-line px-2 py-2 whitespace-nowrap tabular-nums">
                      {new Date(item.timeCreated).toLocaleString("zh-CN")}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2">
                      <div className="font-mono text-xs">{item.model}</div>
                      <div className="text-xs text-kumo-subtle">{item.provider}{item.plan ? ` · ${item.plan}` : ""}</div>
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.inputTokens)}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.outputTokens)}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.reasoningTokens)}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.cacheReadTokens)}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {cacheRate(item)}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatCost(item.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Text variant="secondary" as="p" DANGEROUS_className="m-0 text-sm">
              暂无历史记录。
            </Text>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-kumo-subtle">
            <Button
              variant="secondary"
              size="sm"
              icon={CaretLeft}
              onClick={() => setCursor((c) => Math.max(0, c - PAGE_STEP))}
              disabled={loading || cursor === 0}
            >
              上一页
            </Button>
            <span className="tabular-nums">第 {cursor + 1} 页</span>
            <Button
              variant="secondary"
              size="sm"
              icon={CaretRight}
              onClick={() => setCursor((c) => c + PAGE_STEP)}
              disabled={loading || !data || data.items.length === 0 || Boolean(data?.error)}
            >
              下一页
            </Button>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}