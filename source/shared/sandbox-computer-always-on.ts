/** Guest desktop keep-awake: disable DPMS, screensaver, and sleep/power-off UI. */
export const SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND = [
  "for d in :0 :1 :2 :3; do",
  "  DISPLAY=$d xset s off >/dev/null 2>&1 || true",
  "  DISPLAY=$d xset -dpms >/dev/null 2>&1 || true",
  "  DISPLAY=$d xset s noblank >/dev/null 2>&1 || true",
  "done",
  "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false --create -t bool >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -s 0 --create -t int >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-battery -s 0 --create -t int >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/inactivity-sleep-mode-on-ac -s 0 --create -t int >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/inactivity-sleep-mode-on-battery -s 0 --create -t int >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-session -p /shutdown/ShowHibernate -s false --create -t bool >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-session -p /shutdown/ShowSuspend -s false --create -t bool >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-session -p /shutdown/ShowHybridSleep -s false --create -t bool >/dev/null 2>&1 || true",
  "xfconf-query -c xfce4-session -p /shutdown/LockCommand -s '' --create -t string >/dev/null 2>&1 || true",
].join("\n");

export async function runSandboxComputerKeepAwake(
  run: (command: string) => Promise<unknown>,
): Promise<"applied" | "skipped"> {
  try {
    await run(SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND);
    return "applied";
  } catch {
    return "skipped";
  }
}
