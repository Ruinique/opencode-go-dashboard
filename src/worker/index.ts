import {
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  sessionCookie,
} from "./auth";
import {
  createAccount,
  deleteAccount,
  getAccountRow,
  listAccounts,
  updateAccount,
} from "./db";
import { fetchGoQuota, validateAuthCookie, validateWorkspaceId } from "./quota";
import type {
  AccountWithUsage,
  CreateAccountBody,
  UpdateAccountBody,
  UsageResult,
} from "./types";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ADMIN_PASSWORD: string;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApi(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "服务未配置 ADMIN_PASSWORD" }, 500);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...JSON_HEADERS,
        "Set-Cookie": clearSessionCookie(),
      },
    });
  }

  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    const authed = await isAuthenticated(request, env.ADMIN_PASSWORD);
    return json({ authenticated: authed });
  }

  const authed = await isAuthenticated(request, env.ADMIN_PASSWORD);
  if (!authed) {
    return json({ error: "未授权，请先登录" }, 401);
  }

  if (url.pathname === "/api/accounts") {
    if (request.method === "GET") return handleListAccounts(env);
    if (request.method === "POST") return handleCreateAccount(request, env);
  }

  const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch) {
    const id = accountMatch[1];
    if (request.method === "PUT") return handleUpdateAccount(request, env, id);
    if (request.method === "DELETE") return handleDeleteAccount(env, id);
  }

  const refreshMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/refresh$/);
  if (refreshMatch && request.method === "POST") {
    return handleRefreshOne(env, refreshMatch[1]);
  }

  if (url.pathname === "/api/refresh" && request.method === "POST") {
    return handleRefreshAll(request, env);
  }

  return json({ error: "Not found" }, 404);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { password?: string };
    if (!body.password || body.password !== env.ADMIN_PASSWORD) {
      return json({ error: "密码错误" }, 401);
    }
    const token = await createSessionToken(env.ADMIN_PASSWORD);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...JSON_HEADERS,
        "Set-Cookie": sessionCookie(token),
      },
    });
  } catch {
    return json({ error: "请求格式错误" }, 400);
  }
}

async function handleListAccounts(env: Env): Promise<Response> {
  const accounts = await listAccounts(env.DB);
  return json({ accounts });
}

async function handleCreateAccount(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as CreateAccountBody;
    const nameError = !body.name?.trim() ? "名称不能为空" : null;
    const wsError = validateWorkspaceId(body.workspaceId ?? "");
    const cookieError = validateAuthCookie(body.authCookie ?? "");
    const error = nameError ?? wsError ?? cookieError;
    if (error) return json({ error }, 400);

    const account = await createAccount(env.DB, body);
    return json({ account }, 201);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "创建失败" },
      500
    );
  }
}

async function handleUpdateAccount(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  try {
    const body = (await request.json()) as UpdateAccountBody;
    if (body.workspaceId) {
      const wsError = validateWorkspaceId(body.workspaceId);
      if (wsError) return json({ error: wsError }, 400);
    }
    if (body.authCookie) {
      const cookieError = validateAuthCookie(body.authCookie);
      if (cookieError) return json({ error: cookieError }, 400);
    }
    if (body.name !== undefined && !body.name.trim()) {
      return json({ error: "名称不能为空" }, 400);
    }

    const account = await updateAccount(env.DB, id, body);
    if (!account) return json({ error: "账号不存在" }, 404);
    return json({ account });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "更新失败" },
      500
    );
  }
}

async function handleDeleteAccount(env: Env, id: string): Promise<Response> {
  const ok = await deleteAccount(env.DB, id);
  if (!ok) return json({ error: "账号不存在" }, 404);
  return json({ ok: true });
}

async function handleRefreshOne(
  env: Env,
  id: string
): Promise<Response> {
  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  try {
    const usage = await fetchGoQuota(row.workspace_id, row.auth_cookie);
    return json({ id, usage });
  } catch (err) {
    const usage: UsageResult = {
      rolling: null,
      weekly: null,
      monthly: null,
      plan: null,
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "查询失败",
    };
    return json({ id, usage });
  }
}

async function handleRefreshAll(
  request: Request,
  env: Env
): Promise<Response> {
  let ids: string[] | null = null;
  try {
    const body = (await request.json()) as { ids?: string[] };
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      ids = body.ids;
    }
  } catch {
    // refresh all when body empty or invalid
  }

  const accounts = await listAccounts(env.DB);
  const targetIds = new Set(
    ids ?? accounts.map((a) => a.id)
  );

  const results: AccountWithUsage[] = await Promise.all(
    accounts
      .filter((a) => targetIds.has(a.id))
      .map(async (account) => {
        const row = await getAccountRow(env.DB, account.id);
        if (!row) {
          return { ...account, usage: null };
        }
        try {
          const usage = await fetchGoQuota(row.workspace_id, row.auth_cookie);
          return { ...account, usage };
        } catch (err) {
          const usage: UsageResult = {
            rolling: null,
            weekly: null,
            monthly: null,
            plan: null,
            fetchedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : "查询失败",
          };
          return { ...account, usage };
        }
      })
  );

  return json({ accounts: results });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}