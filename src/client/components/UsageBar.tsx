import { Text } from "@cloudflare/kumo";
import {
  formatDuration,
  usageBarColor,
  usageTextColor,
} from "../lib/format";
import type { UsageWindow } from "../types";

interface Props {
  label: string;
  data: UsageWindow | null;
}

export default function UsageBar({ label, data }: Props) {
  if (!data) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <Text variant="secondary" as="span">
            {label}
          </Text>
          <Text variant="secondary" as="span">
            —
          </Text>
        </div>
        <div className="h-2 rounded-full bg-kumo-recessed" />
      </div>
    );
  }

  const percent = Math.min(100, Math.max(0, data.usagePercent));
  const barColor = usageBarColor(percent);
  const textColor = usageTextColor(percent);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <Text variant="secondary" as="span">
          {label}
        </Text>
        <span className={`font-medium tabular-nums ${textColor}`}>
          {percent}% · 重置 {formatDuration(data.resetInSec)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-kumo-recessed">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}