import type { UsageResult, UsageWindow } from "./types";

const WORKSPACE_RE = /^wrk_[a-zA-Z0-9]+$/;

const USAGE_PATTERNS = {
  rolling: /rollingUsage:\$R\[\d+\]=(\{[^}]+\})/,
  weekly: /weeklyUsage:\$R\[\d+\]=(\{[^}]+\})/,
  monthly: /monthlyUsage:\$R\[\d+\]=(\{[^}]+\})/,
} as const;

const PLAN_PATTERN = /plan:\$R\[\d+\]="([^"]+)"/;

function parseUsageObject(raw: string): UsageWindow | null {
  try {
    const jsonStr = raw.replace(
      /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
      '$1"$2"$3'
    );
    const parsed = JSON.parse(jsonStr) as {
      usagePercent?: number;
      resetInSec?: number;
    };
    if (
      typeof parsed.usagePercent !== "number" ||
      typeof parsed.resetInSec !== "number"
    ) {
      return null;
    }
    return {
      usagePercent: parsed.usagePercent,
      resetInSec: parsed.resetInSec,
    };
  } catch {
    return null;
  }
}

export function validateWorkspaceId(workspaceId: string): string | null {
  if (!workspaceId?.trim()) return "Workspace ID 不能为空";
  if (!WORKSPACE_RE.test(workspaceId.trim())) {
    return "Workspace ID 格式无效（应为 wrk_xxx）";
  }
  return null;
}

export function validateAuthCookie(authCookie: string): string | null {
  if (!authCookie?.trim()) return "Auth Cookie 不能为空";
  if (!authCookie.trim().startsWith("Fe26.")) {
    return "Auth Cookie 格式无效（应以 Fe26. 开头）";
  }
  return null;
}

export async function fetchGoQuota(
  workspaceId: string,
  authCookie: string
): Promise<UsageResult> {
  const wsError = validateWorkspaceId(workspaceId);
  if (wsError) throw new Error(wsError);
  const cookieError = validateAuthCookie(authCookie);
  if (cookieError) throw new Error(cookieError);

  const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:148.0) Gecko/20100101 Firefox/148.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Cookie: `auth=${authCookie.trim()}`,
    },
    redirect: "follow",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("认证失败，Cookie 可能已过期");
  }
  if (!response.ok) {
    throw new Error(`请求失败 (HTTP ${response.status})`);
  }

  const finalUrl = response.url;
  if (finalUrl.includes("/sign-in") || finalUrl.includes("/login")) {
    throw new Error("会话已过期，请重新登录并更新 Cookie");
  }

  const html = await response.text();
  if (html.includes("/sign-in") && !html.includes("rollingUsage")) {
    throw new Error("会话已过期，请重新登录并更新 Cookie");
  }

  const usage: UsageResult = {
    rolling: null,
    weekly: null,
    monthly: null,
    plan: null,
    fetchedAt: new Date().toISOString(),
  };

  for (const [key, pattern] of Object.entries(USAGE_PATTERNS)) {
    const match = html.match(pattern);
    if (match) {
      usage[key] = parseUsageObject(match[1]);
    }
  }

  const planMatch = html.match(PLAN_PATTERN);
  if (planMatch) {
    usage.plan = planMatch[1];
  }

  if (!usage.rolling && !usage.weekly && !usage.monthly) {
    throw new Error("无法从页面解析额度数据，OpenCode 页面结构可能已变更");
  }

  return usage;
}