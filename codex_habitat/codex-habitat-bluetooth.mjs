// Native options flow for a local Bluetooth adapter only. No arbitrary API access.
const [action, entryId, mode, ...extra] = process.argv.slice(2);
const fail = (message) => { throw new Error(message); };
if (process.env.CODEX_HABITAT_HOME_ASSISTANT_CONTROL !== 'true') fail('Home Assistant control actions are disabled.');
if (!process.env.SUPERVISOR_TOKEN) fail('Home Assistant API access is unavailable.');
if (!['bluetooth-info', 'bluetooth-mode'].includes(action) || !/^[a-zA-Z0-9_-]{20,64}$/.test(entryId || '') || extra.length) fail('Specify a local Bluetooth config entry ID.');
if (action === 'bluetooth-mode' ? !['auto', 'active', 'passive'].includes(mode) : mode !== undefined) fail('Specify auto, active or passive only for bluetooth-mode.');
let seq = 0;
const pending = new Map();
let readyResolve, readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
const ws = new WebSocket('ws://supervisor/core/websocket');
let scanner;
let flowId;
const abort = new AbortController();
const rejectAll = (message) => {
  const error = new Error(message);
  readyReject(error);
  for (const p of pending.values()) p.reject(error);
  pending.clear();
};
const timeout = setTimeout(() => {
  abort.abort();
  rejectAll('Bluetooth request timed out; read bluetooth-info before retrying a change.');
  ws.close();
}, 45000);
ws.addEventListener('error', () => rejectAll('Home Assistant WebSocket connection failed.'));
ws.addEventListener('close', () => rejectAll('Home Assistant WebSocket closed.'));
ws.addEventListener('message', ({data}) => {
  let message;
  try { message = JSON.parse(data); } catch { rejectAll('Invalid Home Assistant response.'); return; }
  if (message.type === 'auth_required') ws.send(JSON.stringify({type:'auth', access_token:process.env.SUPERVISOR_TOKEN}));
  else if (message.type === 'auth_ok') readyResolve();
  else if (message.type === 'auth_invalid') rejectAll('Home Assistant authentication rejected.');
  else if (message.type === 'event' && message.event?.adapter) scanner = message.event;
  else if (message.type === 'result') {
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    if (message.success) p.resolve(message.result);
    else p.reject(new Error(`Home Assistant rejected Bluetooth request (${message.error?.code || 'unknown'}).`));
  }
});
function request(type, fields = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, type, ...fields}));
  });
}
async function flow(method, suffix = '', body) {
  const response = await fetch(`http://supervisor/core/api/config/config_entries/options/flow${suffix}`, {
    method, signal:abort.signal,
    headers:{Authorization:`Bearer ${process.env.SUPERVISOR_TOKEN}`, 'Content-Type':'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  if (!response.ok) fail(`Home Assistant options flow failed (HTTP ${response.status}).`);
  return method === 'DELETE' ? null : response.json();
}
async function readMode() {
  const form = await flow('POST', '', {handler:entryId});
  if (form.type !== 'form' || form.step_id !== 'init' || !/^[a-zA-Z0-9_-]+$/.test(form.flow_id || '')) fail('Unsupported Bluetooth options flow.');
  flowId = form.flow_id;
  const field = form.data_schema?.find(item => item.name === 'mode');
  const savedMode = field?.suggested_value ?? field?.default;
  if (!['auto', 'active', 'passive'].includes(savedMode)) fail('Unsupported Bluetooth mode schema.');
  return savedMode;
}
try {
  await ready;
  const {config_entry:entry} = await request('config_entries/get_single', {entry_id:entryId});
  if (entry?.domain !== 'bluetooth' || entry.disabled_by || entry.state !== 'loaded') fail('Specify an enabled, loaded Bluetooth adapter.');
  await request('bluetooth/subscribe_scanner_state', {config_entry_id:entryId});
  for (let i=0; !scanner && i<20; i++) await new Promise(resolve => setTimeout(resolve, 50));
  if (!/^hci[0-9]+$/.test(scanner?.adapter || '')) fail('Only local hci Bluetooth adapters are supported.');
  const before = await readMode();
  let saved = before;
  if (action === 'bluetooth-mode' && before !== mode) {
    const result = await flow('POST', `/${flowId}`, {mode});
    if (result.type !== 'create_entry') fail('Bluetooth mode was not accepted.');
    flowId = undefined;
    saved = await readMode();
    if (saved !== mode) fail('Saved Bluetooth mode verification failed.');
  }
  if (action === 'bluetooth-mode') {
    for (let i=0; scanner?.requested_mode !== mode && i<200; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (scanner?.requested_mode !== mode) fail('Mode saved but runtime verification failed; read bluetooth-info before retrying.');
  }
  console.log(JSON.stringify({entry_id:entryId, adapter:scanner.adapter, previous_mode:before,
    saved_mode:saved, requested_mode:scanner.requested_mode, current_mode:scanner.current_mode,
    verified:action === 'bluetooth-mode'}, null, 2));
} catch (error) {
  console.error(error.name === 'AbortError' ? 'Bluetooth request timed out; verify state before retrying.' : error.message);
  process.exitCode = 1;
} finally {
  if (flowId && !abort.signal.aborted) {
    try { await flow('DELETE', `/${flowId}`); } catch { console.error('Could not clean up Bluetooth options flow.'); process.exitCode = 1; }
  }
  clearTimeout(timeout);
  ws.close();
}
