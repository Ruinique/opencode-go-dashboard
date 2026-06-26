import type {
  Account,
  AccountFormData,
  AccountWithUsage,
  UsageResult,
} from "../types";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `请求失败 (${res.status})`);
  }
  return data;
}

export async function checkAuth(): Promise<boolean> {
  const data = await request<{ authenticated: boolean }>("/api/auth/status");
  return data.authenticated;
}

export async function login(password: string): Promise<void> {
  await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

export async function fetchAccounts(): Promise<Account[]> {
  const data = await request<{ accounts: Account[] }>("/api/accounts");
  return data.accounts;
}

export async function createAccount(form: AccountFormData): Promise<Account> {
  const data = await request<{ account: Account }>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(form),
  });
  return data.account;
}

export async function updateAccount(
  id: string,
  form: Partial<AccountFormData>
): Promise<Account> {
  const data = await request<{ account: Account }>(`/api/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(form),
  });
  return data.account;
}

export async function deleteAccount(id: string): Promise<void> {
  await request(`/api/accounts/${id}`, { method: "DELETE" });
}

export async function refreshAll(
  ids?: string[]
): Promise<AccountWithUsage[]> {
  const data = await request<{ accounts: AccountWithUsage[] }>("/api/refresh", {
    method: "POST",
    body: JSON.stringify(ids?.length ? { ids } : {}),
  });
  return data.accounts;
}

export async function refreshOne(id: string): Promise<UsageResult> {
  const data = await request<{ id: string; usage: UsageResult }>(
    `/api/accounts/${id}/refresh`,
    { method: "POST" }
  );
  return data.usage;
}