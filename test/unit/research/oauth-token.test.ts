import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

import { loadOAuthToken, resolveAuthMode } from '@/lib/research/oauth-token';

const FAKE_DIR = path.join(process.cwd(), '.vitest-cache', 'fake-creds');
const FAKE_CREDS = path.join(FAKE_DIR, '.credentials.json');

beforeEach(() => {
  if (existsSync(FAKE_DIR)) rmSync(FAKE_DIR, { recursive: true, force: true });
  mkdirSync(FAKE_DIR, { recursive: true });
  process.env.CLAUDE_CREDS_PATH = FAKE_CREDS;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
});
afterEach(() => {
  delete process.env.CLAUDE_CREDS_PATH;
  if (existsSync(FAKE_DIR)) rmSync(FAKE_DIR, { recursive: true, force: true });
});

function writeCreds(o: any) {
  writeFileSync(FAKE_CREDS, JSON.stringify({ claudeAiOauth: o }), 'utf-8');
}

describe('loadOAuthToken', () => {
  it('returns null when env var unset and no credentials file', () => {
    expect(loadOAuthToken()).toBeNull();
  });

  it('returns env-var token when ANTHROPIC_AUTH_TOKEN is set', () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-bearer';
    const t = loadOAuthToken();
    expect(t?.accessToken).toBe('env-bearer');
    expect(t?.subscription).toBe('env');
  });

  it('reads access token from credentials file when present and unexpired', () => {
    writeCreds({ accessToken: 'oat_real', expiresAt: Date.now() + 60_000,
                 subscriptionType: 'max' });
    const t = loadOAuthToken();
    expect(t?.accessToken).toBe('oat_real');
    expect(t?.subscription).toBe('max');
  });

  it('returns null when credentials token is expired', () => {
    writeCreds({ accessToken: 'oat_old', expiresAt: Date.now() - 1, subscriptionType: 'max' });
    expect(loadOAuthToken()).toBeNull();
  });

  it('returns null when credentials file is malformed JSON', () => {
    writeFileSync(FAKE_CREDS, '{not json', 'utf-8');
    expect(loadOAuthToken()).toBeNull();
  });
});

describe('resolveAuthMode', () => {
  it('prefers ANTHROPIC_API_KEY when set', () => {
    process.env.ANTHROPIC_API_KEY = 'key-abc';
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-bearer';
    const m = resolveAuthMode();
    expect(m?.kind).toBe('api_key');
    expect(m && m.kind === 'api_key' && m.apiKey).toBe('key-abc');
  });

  it('falls back to ANTHROPIC_AUTH_TOKEN when API key unset', () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-bearer';
    const m = resolveAuthMode();
    expect(m?.kind).toBe('oauth');
    expect(m && m.kind === 'oauth' && m.token.accessToken).toBe('env-bearer');
  });

  it('returns null when nothing is set and no creds file', () => {
    expect(resolveAuthMode()).toBeNull();
  });
});
