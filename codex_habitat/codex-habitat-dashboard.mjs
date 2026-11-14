// Native Lovelace config transport. No arbitrary API commands or storage writes.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const fail = message => { throw new Error(message); };
let ws, timeout, backup;
try {
  if (process.env.CODEX_HABITAT_HOME_ASSISTANT_CONTROL !== 'true') fail('Home Assistant control actions are disabled.');
  if (!process.env.SUPERVISOR_TOKEN) fail('Home Assistant API access is unavailable.');
  const [action, dashboard, filename, baseline, ...extra] = process.argv.slice(2);
  if (!['dashboard-get', 'dashboard-save'].includes(action)) fail('Unsupported dashboard action.');
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(dashboard || '')) fail('Specify default or a dashboard URL path.');
  if (!filename || extra.length || (action === 'dashboard-get' ? baseline !== undefined : !baseline)) fail('Invalid dashboard arguments; see --help.');
  // Never allow this helper to read/write active .storage files, including symlinks.
  function safePath(filename, existing = false) {
    const path = resolve(filename);
    const canonical = existing ? realpathSync(path) : resolve(realpathSync(resolve(path, '..')), path.split(sep).at(-1));
    if (canonical.split(sep).includes('.storage') || path.split(sep).includes('.storage')) fail('Use a working file outside .storage.');
    return canonical;
  }
  function validate(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config) || !Array.isArray(config.views)
        || config.views.some(view => !view || typeof view !== 'object' || Array.isArray(view))) fail('Expected a Lovelace config object with a views array.');
    return config;
  }
  const file = safePath(filename, action === 'dashboard-save');
  const desired = action === 'dashboard-save' ? validate(JSON.parse(readFileSync(file, 'utf8'))) : null;
  const expected = action === 'dashboard-save' ? validate(JSON.parse(readFileSync(safePath(baseline, true), 'utf8'))) : null;
  const url_path = dashboard === 'default' ? null : dashboard;
  let sequence = 0, readyResolve, readyReject, authenticated = false;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const rejectAll = message => {
    authenticated = false;
    const error = new Error(message);
    readyReject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  ws = new WebSocket('ws://supervisor/core/websocket');
  timeout = setTimeout(() => { rejectAll('Dashboard request timed out; read the live dashboard before retrying a save.'); ws.close(); }, 25000);
  ws.addEventListener('error', () => rejectAll('Home Assistant WebSocket connection failed.'));
  ws.addEventListener('close', () => rejectAll('Home Assistant WebSocket closed; verify dashboard before retrying a save.'));
  ws.addEventListener('message', ({data}) => {
    let message;
    try { message = JSON.parse(data); } catch { rejectAll('Invalid Home Assistant response.'); return; }
    if (message.type === 'auth_required') ws.send(JSON.stringify({type:'auth', access_token:process.env.SUPERVISOR_TOKEN}));
    else if (message.type === 'auth_ok') { authenticated = true; readyResolve(); }
    else if (message.type === 'auth_invalid') rejectAll('Home Assistant authentication rejected.');
    else if (message.type === 'result') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.success) request.resolve(message.result);
      else request.reject(new Error(`Home Assistant rejected dashboard request (${message.error?.code || 'unknown'}).`));
    }
  });
  function request(type, fields = {}) {
    if (!authenticated || !['lovelace/config', 'lovelace/config/save'].includes(type)) fail('Unsupported dashboard request.');
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      ws.send(JSON.stringify({id, type, url_path, ...fields}));
    });
  }
  await ready;
  const current = validate(await request('lovelace/config'));
  if (action === 'dashboard-get') {
    writeFileSync(file, JSON.stringify(current, null, 2) + '\n', {flag:'wx', mode:0o600});
    console.log(JSON.stringify({dashboard, file, views:current.views.length}));
  } else {
    if (!isDeepStrictEqual(current, expected)) fail('Dashboard changed since baseline; fetch it again and reapply your edit. No save sent.');
    if (isDeepStrictEqual(current, desired)) {
      console.log(JSON.stringify({dashboard, changed:false, verified:true}));
    } else {
      const backupPath = safePath(`${file}.before-${Date.now()}.json`);
      writeFileSync(backupPath, JSON.stringify(current, null, 2) + '\n', {flag:'wx', mode:0o600});
      backup = backupPath;
      await request('lovelace/config/save', {config:desired});
      const actual = await request('lovelace/config');
      if (!isDeepStrictEqual(actual, desired)) fail(`Dashboard readback differs after save; inspect live configuration. Backup: ${backup}`);
      console.log(JSON.stringify({dashboard, changed:true, verified:true, backup, browser_refresh:true}));
    }
  }
} catch (error) {
  // Do not echo server payloads, credentials or dashboard contents on errors.
  console.error(error instanceof SyntaxError ? 'Invalid JSON dashboard file.' : error.message);
  if (backup) console.error(`Pre-save backup: ${backup}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  ws?.close();
}
