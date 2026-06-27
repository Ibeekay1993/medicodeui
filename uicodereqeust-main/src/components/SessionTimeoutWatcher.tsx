import { useSessionTimeout } from "@/hooks/useSessionTimeout";

export function SessionTimeoutWatcher() {
  useSessionTimeout();
  return null;
}
