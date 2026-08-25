export const DEFAULT_MCP_ACCOUNT_KEY = "default";

export function normalizeMcpAccountLabel(rawLabel: string): string {
  return rawLabel.trim().toLowerCase();
}

export function provisionalMcpAccountServerIdentifier(
  rowIdentifier: string,
  accountKey: string,
): string {
  return accountKey === DEFAULT_MCP_ACCOUNT_KEY
    ? rowIdentifier
    : `${rowIdentifier}--${accountKey}`;
}

export const MAX_RENDERED_MCP_ACCOUNT_LABEL_LENGTH = 64;
export const MCP_LABEL_HOSTILE_CHARS =
  /[\u0000-\u001f\u007f"'`\\[\]{}()<>\u2028\u2029]/g;

export function encodeMcpAccountLabelForListing(label: string): string {
  const escaped = label.replace(
    MCP_LABEL_HOSTILE_CHARS,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return `"${escaped}"`;
}

export function decodeMcpAccountLabelArgument(rawArgument: string): string {
  const value = rawArgument.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {}
  }
  return rawArgument;
}

export function formatMcpAccountLabelForPrompt(rawLabel: string): string {
  const inert = rawLabel
    .replace(/["'`\\[\]{}()<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return inert.slice(0, MAX_RENDERED_MCP_ACCOUNT_LABEL_LENGTH);
}

export function formatMcpAccountDisplayName(
  name: string,
  accountKey: string | null | undefined,
): string {
  return accountKey != null && accountKey !== DEFAULT_MCP_ACCOUNT_KEY
    ? `${name} (${formatMcpAccountLabelForPrompt(accountKey)})`
    : name;
}

export function mcpAccountKeyFromProviderIdentifier(providerIdentifier: string): string {
  const match = /--([A-Za-z0-9][A-Za-z0-9_-]*)$/.exec(providerIdentifier.trim());
  return match?.[1] ?? DEFAULT_MCP_ACCOUNT_KEY;
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function emailFromPluginInput(input: unknown): string | null {
  if (typeof input !== "object" || input == null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  for (const key of ["email", "user_email", "userEmail", "accountEmail", "mailbox", "account", "user"]) {
    const value = record[key];
    if (typeof value === "string" && value.includes("@")) return value.trim();
  }
  for (const value of Object.values(record)) {
    if (typeof value !== "string") continue;
    const match = EMAIL_PATTERN.exec(value);
    if (match) return match[0];
  }
  return null;
}

export function lastEmailFromConversation(messages: readonly { readonly role?: unknown; readonly content?: unknown }[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" && message?.role !== "assistant") continue;
    const content = typeof message.content === "string" ? message.content : "";
    const matches = [...content.matchAll(new RegExp(EMAIL_PATTERN, "g"))].map(match => match[0]);
    if (matches.length > 0) return matches[matches.length - 1] ?? null;
  }
  return null;
}

export function matchingConnectedAccountEmail(
  email: string | null | undefined,
  listedTools: readonly Record<string, unknown>[] = [],
  definition?: Record<string, unknown> | null,
): string | null {
  if (email == null || email.length === 0) return null;
  const lowered = email.toLowerCase();
  const candidates = [
    ...(definition != null ? [definition] : []),
    ...listedTools,
  ];
  for (const tool of candidates) {
    const accountEmail = typeof tool.accountEmail === "string" ? tool.accountEmail : "";
    const accountKey = typeof tool.accountKey === "string" ? tool.accountKey : "";
    if (accountEmail.toLowerCase() === lowered) return accountEmail;
    if (accountKey.toLowerCase() === lowered) return accountEmail.includes("@") ? accountEmail : email;
  }
  return null;
}

export function annotateRoutedMcpTool(
  tool: Record<string, unknown>,
  defaultEmail?: string | null,
): Record<string, unknown> {
  const provider = typeof tool.providerIdentifier === "string" ? tool.providerIdentifier : "";
  const accountKey = typeof tool.accountKey === "string" && tool.accountKey.length > 0
    ? tool.accountKey
    : mcpAccountKeyFromProviderIdentifier(provider);
  const accountEmail = typeof tool.accountEmail === "string" && tool.accountEmail.includes("@")
    ? tool.accountEmail
    : accountKey === DEFAULT_MCP_ACCOUNT_KEY && typeof defaultEmail === "string" && defaultEmail.includes("@")
      ? defaultEmail
      : undefined;
  return { ...tool, accountKey, ...(accountEmail == null ? {} : { accountEmail }) };
}

export function isEffectivePluginInstalled(plugin: { readonly isEnabled: boolean }): boolean {
  return plugin.isEnabled;
}

export function uninstallClearedInstallRecord(result: {
  readonly removed: boolean;
  readonly reason?: string;
}): boolean {
  return result.removed || result.reason === "team-server";
}

export const MAX_CONNECTOR_ERROR_LENGTH = 300;
export const MAX_UNTRUSTED_MARKUP_SCAN_LENGTH = 16_384;

export function stripMarkupAndBoundConnectorError(raw: string): string {
  const collapsed = raw
    .slice(0, MAX_UNTRUSTED_MARKUP_SCAN_LENGTH)
    .replace(/<(script|style)\b[^<>]*>[\s\S]*?(?:<\/\1>|$)/gi, " ")
    .replace(/<[^<>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length === 0) return "";
  return collapsed.length > MAX_CONNECTOR_ERROR_LENGTH
    ? `${collapsed.slice(0, MAX_CONNECTOR_ERROR_LENGTH - 1).trimEnd()}…`
    : collapsed;
}
