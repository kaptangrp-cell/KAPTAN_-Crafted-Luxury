export const IDLE_TIMEOUT_MS = 60_000;
export const idleKey = (user: { id: string; last_sign_in_at?: string }) =>
  `kaptan-activity:${user.id}:${user.last_sign_in_at ?? "session"}`;
export function sessionExpired(lastActivity: number, now = Date.now()) {
  return Number.isFinite(lastActivity) && lastActivity > 0 && now - lastActivity >= IDLE_TIMEOUT_MS;
}
export function readActivity(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
