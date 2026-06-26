export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} 分钟`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours} 小时 ${mins} 分` : `${hours} 小时`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
}

export function usageStatus(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 75) return "danger";
  if (percent >= 50) return "warn";
  return "ok";
}

export function usageBarColor(percent: number): string {
  const status = usageStatus(percent);
  if (status === "danger") return "bg-kumo-danger";
  if (status === "warn") return "bg-kumo-warning";
  return "bg-kumo-success";
}

export function usageTextColor(percent: number): string {
  const status = usageStatus(percent);
  if (status === "danger") return "text-kumo-danger";
  if (status === "warn") return "text-kumo-warning";
  return "text-kumo-success";
}