import type {
  AccountPublic,
  AccountRow,
  CreateAccountBody,
  UpdateAccountBody,
} from "./types";

function toPublic(row: AccountRow): AccountPublic {
  return {
    id: row.id,
    name: row.name,
    workspaceId: row.workspace_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasCookie: Boolean(row.auth_cookie),
  };
}

export async function listAccounts(db: D1Database): Promise<AccountPublic[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, workspace_id, auth_cookie, notes, created_at, updated_at FROM accounts ORDER BY name COLLATE NOCASE"
    )
    .all<AccountRow>();
  return (results ?? []).map(toPublic);
}

export async function getAccountRow(
  db: D1Database,
  id: string
): Promise<AccountRow | null> {
  return db
    .prepare(
      "SELECT id, name, workspace_id, auth_cookie, notes, created_at, updated_at FROM accounts WHERE id = ?"
    )
    .bind(id)
    .first<AccountRow>();
}

export async function createAccount(
  db: D1Database,
  body: CreateAccountBody
): Promise<AccountPublic> {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO accounts (id, name, workspace_id, auth_cookie, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id,
      body.name.trim(),
      body.workspaceId.trim(),
      body.authCookie.trim(),
      (body.notes ?? "").trim(),
      now,
      now
    )
    .run();

  const row = await getAccountRow(db, id);
  if (!row) throw new Error("创建账号失败");
  return toPublic(row);
}

export async function updateAccount(
  db: D1Database,
  id: string,
  body: UpdateAccountBody
): Promise<AccountPublic | null> {
  const existing = await getAccountRow(db, id);
  if (!existing) return null;

  const now = Date.now();
  await db
    .prepare(
      "UPDATE accounts SET name = ?, workspace_id = ?, auth_cookie = ?, notes = ?, updated_at = ? WHERE id = ?"
    )
    .bind(
      body.name?.trim() ?? existing.name,
      body.workspaceId?.trim() ?? existing.workspace_id,
      body.authCookie?.trim() ? body.authCookie.trim() : existing.auth_cookie,
      body.notes !== undefined ? body.notes.trim() : existing.notes,
      now,
      id
    )
    .run();

  const row = await getAccountRow(db, id);
  return row ? toPublic(row) : null;
}

export async function deleteAccount(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM accounts WHERE id = ?")
    .bind(id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}