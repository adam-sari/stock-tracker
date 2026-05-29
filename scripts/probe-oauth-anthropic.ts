/**
 * Probe whether api.anthropic.com/v1/messages accepts the user's Claude Code
 * OAuth Bearer access token directly. Doesn't print the token; only the request
 * shape and the API response status + body.
 *
 * The user has explicitly authorized reading their credentials.json for this
 * session to wire Max-subscription auth into the Research feature.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const credsPath = path.join(homedir(), '.claude', '.credentials.json');
const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
const token = creds.claudeAiOauth.accessToken as string;
const expiresAt = creds.claudeAiOauth.expiresAt as number;
const subscription = creds.claudeAiOauth.subscriptionType as string;

console.log(`subscription=${subscription} token_len=${token.length} expires_in_min=${Math.round((expiresAt - Date.now())/60000)}`);

async function main() {
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 32,
    messages: [{ role: 'user', content: 'Reply with the literal word: pong' }],
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`status=${res.status}`);
  console.log(`body=${text.slice(0, 1000)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
