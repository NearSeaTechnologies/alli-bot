import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const source = await readFile(path.join(repoRoot, "source/shared/node/inference-router-grok.ts"), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

function entry(overrides = {}) {
  return {
    key: "access-token",
    auth_mode: "oidc",
    refresh_token: "refresh-token",
    oidc_issuer: "https://auth.x.ai",
    oidc_client_id: "client-1",
    create_time: "2026-08-24T00:00:00.000Z",
    expires_at: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

test("Grok OIDC login loads the newest usable auth.x.ai session", async () => {
  const grok = await loadModule();
  const directory = await mkdtemp(path.join(os.tmpdir(), "alli-grok-auth-"));
  const authPath = path.join(directory, "auth.json");
  try {
    await writeFile(authPath, JSON.stringify({
      "https://auth.x.ai::old": entry({ key: "old-token", create_time: "2026-08-01T00:00:00.000Z" }),
      "https://auth.x.ai::new": entry({ key: "new-token", create_time: "2026-08-24T12:00:00.000Z" }),
    }), { mode: 0o600 });
    await chmod(authPath, 0o600);
    const credentials = grok.loadGrokCredentials(authPath);
    assert.equal(credentials.accessToken, "new-token");
    assert.equal(credentials.clientId, "client-1");
    assert.equal(grok.hasUsableGrokLogin(authPath), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Grok OIDC refresh persists rotated tokens and retries unauthorized requests", async () => {
  const grok = await loadModule();
  const directory = await mkdtemp(path.join(os.tmpdir(), "alli-grok-refresh-"));
  const authPath = path.join(directory, "auth.json");
  try {
    await writeFile(authPath, JSON.stringify({
      "https://auth.x.ai::client-1": entry({ key: "stale-token", expires_at: "2020-01-01T00:00:00.000Z" }),
    }), { mode: 0o600 });
    await chmod(authPath, 0o600);
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url: String(url), body: typeof init?.body === "string" ? init.body : String(init?.body ?? "") });
      if (String(url).includes("/oauth2/token")) {
        return Response.json({ access_token: "fresh-token", refresh_token: "fresh-refresh", expires_in: 3600 });
      }
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization === "Bearer stale-token") return new Response("expired", { status: 401 });
      assert.equal(authorization, "Bearer fresh-token");
      return Response.json({ ok: true });
    };
    const credentials = grok.loadGrokCredentials(authPath);
    const authed = grok.grokAuthenticatedFetch(credentials, fetchImpl, () => Date.parse("2026-08-24T12:00:00.000Z"));
    const response = await authed("https://api.x.ai/v1/models");
    assert.equal(response.status, 200);
    const persisted = JSON.parse(await readFile(authPath, "utf8"));
    assert.equal(persisted["https://auth.x.ai::client-1"].key, "fresh-token");
    assert.equal(persisted["https://auth.x.ai::client-1"].refresh_token, "fresh-refresh");
    assert.equal(requests[0].url, grok.GROK_OIDC_TOKEN_ENDPOINT);
    assert.match(requests[0].body, /grant_type=refresh_token/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
