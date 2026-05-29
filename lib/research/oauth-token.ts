import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Authenticates against the Anthropic API using the user's Claude Code OAuth
 * Bearer token sourced from ~/.claude/.credentials.json — the same token
 * Claude Code itself uses for Max-subscription inference. The user explicitly
 * authorized this auth path in lieu of issuing a separate ANTHROPIC_API_KEY.
 *
 * Token expiry is checked on each read; if expired we return null and the
 * caller surfaces a clear error pointing the user back to `claude /login`.
 */

function credsPath(): string {
  return process.env.CLAUDE_CREDS_PATH
    ?? path.join(homedir(), '.claude', '.credentials.json');
}

export type OAuthToken = {
  accessToken: string;
  expiresAt: number;
  subscription: string;
};

export function loadOAuthToken(): OAuthToken | null {
  const envToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (envToken) {
    return { accessToken: envToken, expiresAt: Date.now() + 60_000, subscription: 'env' };
  }
  const p = credsPath();
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    const o = raw.claudeAiOauth;
    if (!o?.accessToken || !o?.expiresAt) return null;
    if (Date.now() >= Number(o.expiresAt)) return null;
    return {
      accessToken: String(o.accessToken),
      expiresAt: Number(o.expiresAt),
      subscription: String(o.subscriptionType ?? 'unknown'),
    };
  } catch {
    return null;
  }
}

export type AuthMode = { kind: 'api_key'; apiKey: string } | { kind: 'oauth'; token: OAuthToken };

export function resolveAuthMode(): AuthMode | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { kind: 'api_key', apiKey: process.env.ANTHROPIC_API_KEY };
  }
  const t = loadOAuthToken();
  if (t) return { kind: 'oauth', token: t };
  return null;
}
