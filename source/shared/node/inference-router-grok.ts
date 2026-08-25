import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const GROK_OIDC_ISSUER = "https://auth.x.ai";
export const GROK_OIDC_TOKEN_ENDPOINT = "https://auth.x.ai/oauth2/token";
export const GROK_API_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_GROK_MODEL = "grok-4.6";

type Loose = Record<string, unknown>;

export interface GrokOidcCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly clientId: string;
  readonly path: string;
  readonly key: string;
  readonly document: Loose;
  readonly entry: Loose;
  readonly expiresAtMs: number | null;
}

export function grokAuthPath(home = homedir()): string {
  return join(process.env.GROK_HOME?.trim() || join(home, ".grok"), "auth.json");
}

export function configuredGrokModel(): string {
  return process.env.SAND_GROK_MODEL?.trim() || DEFAULT_GROK_MODEL;
}

function asRecord(value: unknown): Loose | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Loose : null;
}

function usableEntry(entry: Loose): boolean {
  return entry.auth_mode === "oidc"
    && (entry.oidc_issuer === GROK_OIDC_ISSUER || entry.oidc_issuer == null)
    && typeof entry.key === "string" && entry.key.length > 0
    && typeof entry.refresh_token === "string" && entry.refresh_token.length > 0
    && typeof entry.oidc_client_id === "string" && entry.oidc_client_id.length > 0;
}

function expiresAtMs(entry: Loose): number | null {
  if (typeof entry.expires_at === "string") {
    const parsed = Date.parse(entry.expires_at);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function hasUsableGrokLogin(path = grokAuthPath()): boolean {
  try {
    return loadGrokCredentials(path) != null;
  } catch {
    return false;
  }
}

export function loadGrokCredentials(path = grokAuthPath()): GrokOidcCredentials {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("Grok login credentials must be a private direct regular file.");
  }
  const parsed = asRecord(JSON.parse(readFileSync(path, "utf8")));
  if (parsed == null) throw new Error("Grok is not signed in. Run `grok login`, then reopen Alli Bot.");
  const candidates: Array<{ key: string; entry: Loose; created: number }> = [];
  for (const [key, value] of Object.entries(parsed)) {
    const entry = asRecord(value);
    if (entry == null || !usableEntry(entry)) continue;
    const created = typeof entry.create_time === "string" ? Date.parse(entry.create_time) : 0;
    candidates.push({ key, entry, created: Number.isFinite(created) ? created : 0 });
  }
  candidates.sort((left, right) => right.created - left.created);
  const selected = candidates[0];
  if (selected == null) throw new Error("Grok is not signed in. Run `grok login`, then reopen Alli Bot.");
  return {
    accessToken: selected.entry.key as string,
    refreshToken: selected.entry.refresh_token as string,
    clientId: selected.entry.oidc_client_id as string,
    path,
    key: selected.key,
    document: parsed,
    entry: selected.entry,
    expiresAtMs: expiresAtMs(selected.entry),
  };
}

export async function refreshGrokCredentials(
  current: GrokOidcCredentials,
  fetchImpl: typeof fetch = fetch,
  now = Date.now,
): Promise<GrokOidcCredentials> {
  const refresh = await fetchImpl(GROK_OIDC_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: current.clientId,
    }),
  });
  if (!refresh.ok) throw new Error("Grok login expired and could not be refreshed. Run `grok login` again.");
  const payload = asRecord(await refresh.json());
  if (payload == null || typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    throw new Error("Grok returned an invalid refreshed login. Run `grok login` again.");
  }
  const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) ? payload.expires_in : 6 * 60 * 60;
  const nextEntry: Loose = {
    ...current.entry,
    key: payload.access_token,
    refresh_token: typeof payload.refresh_token === "string" && payload.refresh_token.length > 0 ? payload.refresh_token : current.refreshToken,
    expires_at: new Date(now() + expiresIn * 1000).toISOString(),
  };
  const document = { ...current.document, [current.key]: nextEntry };
  const temporary = `${current.path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(temporary, current.path);
  return loadGrokCredentials(current.path);
}

export function grokAuthenticatedFetch(
  initial: GrokOidcCredentials,
  fetchImpl: typeof fetch = fetch,
  now = Date.now,
): typeof fetch {
  let credentials = initial;
  return async (input, init) => {
    if (credentials.expiresAtMs != null && credentials.expiresAtMs - 60_000 <= now()) {
      credentials = await refreshGrokCredentials(credentials, fetchImpl, now);
    }
    const perform = () => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${credentials.accessToken}`);
      return fetchImpl(input, { ...init, headers });
    };
    let result = await perform();
    if (result.status !== 401) return result;
    credentials = await refreshGrokCredentials(credentials, fetchImpl, now);
    return perform();
  };
}

export function grokLoginInstalled(home = homedir()): boolean {
  return existsSync(grokAuthPath(home));
}
