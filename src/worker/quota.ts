import type {
  UsageHistoryItem,
  UsageHistoryResult,
  UsageResult,
  UsageWindow,
} from "./types";

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

const USAGE_HISTORY_RECORD_PATTERN =
  /id:\s*"usg_[A-Za-z0-9]+"/g;
const TIME_CREATED_PATTERN =
  /timeCreated:\s*(?:\$R\[\s*\d+\s*\]\s*=\s*)?new Date\("([^"]+)"\)/;
const ID_PATTERN = /id:\s*"usg_([A-Za-z0-9]+)"/;
const STRING_FIELD_PATTERN = (key: string) =>
  new RegExp(`${key}:\\s*"([^"]*)"`);
const NUMBER_FIELD_PATTERN = (key: string) =>
  new RegExp(`${key}:\\s*(\\d+)`);
const NULLABLE_NUMBER_FIELD_PATTERN = (key: string) =>
  new RegExp(`${key}:\\s*(\\d+|null)`);

interface ParsedHistoryRaw {
  matchStart: number;
  matchEnd: number;
}

function findHistoryChunks(body: string): ParsedHistoryRaw[] {
  // Each usage record starts at its `id:"usg_..."` anchor. Slice extends to
  // the next anchor (or end of body) capped so field scans stay bounded.
  const results: ParsedHistoryRaw[] = [];
  for (const match of body.matchAll(USAGE_HISTORY_RECORD_PATTERN)) {
    const start = match.index!;
    results.push({ matchStart: start, matchEnd: start + match[0].length });
  }
  return results;
}

function parseHistoryBody(body: string): UsageHistoryItem[] {
  const items: UsageHistoryItem[] = [];
  const chunks = findHistoryChunks(body);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const boundary = i + 1 < chunks.length ? chunks[i + 1].matchStart : body.length;
    const recordEnd = Math.min(boundary, chunk.matchStart + 4000);
    const slice = body.slice(chunk.matchStart, recordEnd);

    const id = slice.match(ID_PATTERN)?.[1] ?? "";
    if (!id) continue;

    const timeCreated = slice.match(TIME_CREATED_PATTERN)?.[1] ?? "";
    const model = slice.match(STRING_FIELD_PATTERN("model"))?.[1] ?? "";
    const provider = slice.match(STRING_FIELD_PATTERN("provider"))?.[1] ?? "";
    const inputTokens = Number(
      slice.match(NUMBER_FIELD_PATTERN("inputTokens"))?.[1] ?? 0
    );
    const outputTokens = Number(
      slice.match(NUMBER_FIELD_PATTERN("outputTokens"))?.[1] ?? 0
    );
    const reasoningTokens = Number(
      slice.match(NUMBER_FIELD_PATTERN("reasoningTokens"))?.[1] ?? 0
    );
    const cacheReadTokens = Number(
      slice.match(NUMBER_FIELD_PATTERN("cacheReadTokens"))?.[1] ?? 0
    );
    const cacheWrite5mRaw = slice.match(
      NULLABLE_NUMBER_FIELD_PATTERN("cacheWrite5mTokens")
    )?.[1];
    const cacheWrite1hRaw = slice.match(
      NULLABLE_NUMBER_FIELD_PATTERN("cacheWrite1hTokens")
    )?.[1];
    const cost = Number(slice.match(NUMBER_FIELD_PATTERN("cost"))?.[1] ?? 0);
    const keyID = slice.match(STRING_FIELD_PATTERN("keyID"))?.[1] ?? "";
    const sessionID = slice.match(STRING_FIELD_PATTERN("sessionID"))?.[1] ?? "";
    const plan = slice.match(STRING_FIELD_PATTERN("plan"))?.[1] ?? null;

    items.push({
      id: `usg_${id}`,
      timeCreated,
      model,
      provider,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadTokens,
      cacheWrite5mTokens:
        cacheWrite5mRaw && cacheWrite5mRaw !== "null" ? Number(cacheWrite5mRaw) : null,
      cacheWrite1hTokens:
        cacheWrite1hRaw && cacheWrite1hRaw !== "null" ? Number(cacheWrite1hRaw) : null,
      cost,
      keyID,
      sessionID,
      plan,
    });
  }
  return items;
}

export async function fetchGoUsageHistory(
  workspaceId: string,
  authCookie: string,
  cursor: number = 0
): Promise<UsageHistoryResult> {
  const wsError = validateWorkspaceId(workspaceId);
  if (wsError) throw new Error(wsError);
  const cookieError = validateAuthCookie(authCookie);
  if (cookieError) throw new Error(cookieError);

  const wsId = workspaceId.trim();
  const cookie = authCookie.trim();
  const usagePageUrl = `https://opencode.ai/workspace/${encodeURIComponent(wsId)}/usage`;

  const payload = {
    t: {
      t: 9,
      i: 0,
      l: 2,
      a: [
        { t: 1, s: wsId },
        { t: 0, s: cursor },
      ],
      o: 0,
    },
    f: 31,
    m: [],
  };

  const response = await fetch("https://opencode.ai/_server", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Cookie: `auth=${cookie}`,
      Origin: "https://opencode.ai",
      Referer: usagePageUrl,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:148.0) Gecko/20100101 Firefox/148.0",
      "x-server-instance": "server-fn:2",
      "x-server-id":
        "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("认证失败，Cookie 可能已过期");
  }
  if (response.status === 404) {
    throw new Error(
      "RPC 端点不可达 (HTTP 404)，OpenCode 服务接口可能已变更"
    );
  }
  if (!response.ok) {
    throw new Error(`请求失败 (HTTP ${response.status})`);
  }

  const body = await response.text();
  if (body.includes("/sign-in") && !body.includes("usg_")) {
    throw new Error("会话已过期，请重新登录并更新 Cookie");
  }

  const items = parseHistoryBody(body);
  if (items.length === 0) {
    throw new Error("未能解析到使用历史，OpenCode 接口结构可能已变更");
  }

  items.sort(
    (a, b) =>
      new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime()
  );

  return {
    items,
    fetchedAt: new Date().toISOString(),
    cursor,
  };
}