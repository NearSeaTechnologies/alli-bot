export type PacedTextReveal = {
  push(delta: string, accumulated?: string): void;
  finish(): Promise<string>;
};

export function createPacedTextReveal(options: {
  readonly emit: (text: string, streaming: boolean) => void;
  readonly tickMs?: number;
  readonly schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
}): PacedTextReveal {
  const tickMs = options.tickMs ?? 24;
  const schedule: (callback: () => void, ms: number) => ReturnType<typeof setTimeout> =
    options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  let received = "";
  let shown = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let finishing: Promise<string> | null = null;

  const emitShown = (streaming: boolean) => options.emit(shown, streaming);

  const takeCount = (pending: number, flush: boolean) => {
    if (pending <= 0) return 0;
    if (flush) return Math.min(pending, Math.max(8, Math.ceil(pending / 16)));
    return Math.min(pending, Math.max(1, Math.min(14, Math.ceil(pending / 10))));
  };

  const advance = (flush: boolean) => {
    const pending = received.length - shown.length;
    if (pending <= 0) return false;
    let take = takeCount(pending, flush);
    const lookahead = received.slice(shown.length, shown.length + take + 10);
    const boundary = lookahead.search(/[\s.,!?;:]/);
    if (boundary > 0 && boundary <= take + 8) take = Math.min(pending, boundary + 1);
    shown = received.slice(0, shown.length + take);
    emitShown(true);
    return shown.length < received.length;
  };

  const arm = () => {
    if (closed || timer != null || shown.length >= received.length) return;
    timer = schedule(() => {
      timer = null;
      if (closed) return;
      if (advance(false)) arm();
    }, tickMs);
  };

  return {
    push(delta: string, accumulated?: string) {
      if (closed) return;
      received = typeof accumulated === "string" ? accumulated : `${received}${delta}`;
      if (shown.length > received.length) shown = received;
      arm();
    },
    finish() {
      if (finishing != null) return finishing;
      finishing = new Promise<string>(resolve => {
        const drain = () => {
          if (timer != null) {
            clearTimeout(timer);
            timer = null;
          }
          if (advance(true)) {
            timer = schedule(drain, tickMs);
            return;
          }
          closed = true;
          shown = received;
          options.emit(received, false);
          resolve(received);
        };
        drain();
      });
      return finishing;
    },
  };
}
