import { Button, Label, SensitiveInput, Text } from "@cloudflare/kumo";
import { useState } from "react";
import { login } from "../lib/api";

interface Props {
  onSuccess: () => void;
}

export default function LoginForm({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-kumo-line bg-kumo-elevated p-6 shadow-sm"
      >
        <Text variant="heading3" as="h1" DANGEROUS_className="m-0">
          OpenCode Go 额度管理
        </Text>
        <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-2 text-sm">
          输入管理密码以查看团队账号用量。Cookie 仅保存在服务端 D1，不会返回给浏览器。
        </Text>

        <div className="mt-5 flex flex-col gap-1.5">
          <Label htmlFor="admin-password">管理密码</Label>
          <SensitiveInput
            id="admin-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ADMIN_PASSWORD"
            autoComplete="current-password"
            autoFocus
          />
        </div>

        {error ? (
          <Text
            variant="secondary"
            as="p"
            DANGEROUS_className="m-0 mt-3 text-sm text-kumo-danger"
          >
            {error}
          </Text>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          className="mt-5 w-full"
          disabled={loading || !password}
        >
          {loading ? "登录中…" : "登录"}
        </Button>
      </form>
    </div>
  );
}