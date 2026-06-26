export interface UsageWindow {
  usagePercent: number;
  resetInSec: number;
}

export interface UsageResult {
  rolling: UsageWindow | null;
  weekly: UsageWindow | null;
  monthly: UsageWindow | null;
  plan: string | null;
  fetchedAt: string;
  error?: string;
}

export interface AccountRow {
  id: string;
  name: string;
  workspace_id: string;
  auth_cookie: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

export interface AccountPublic {
  id: string;
  name: string;
  workspaceId: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  hasCookie: boolean;
}

export interface AccountWithUsage extends AccountPublic {
  usage: UsageResult | null;
  loading?: boolean;
}

export interface CreateAccountBody {
  name: string;
  workspaceId: string;
  authCookie: string;
  notes?: string;
}

export interface UpdateAccountBody {
  name?: string;
  workspaceId?: string;
  authCookie?: string;
  notes?: string;
}