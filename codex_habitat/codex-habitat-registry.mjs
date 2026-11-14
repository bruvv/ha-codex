// Narrow registry transport for codex-habitat-ha. No arbitrary WebSocket commands.
const [action, entity, area, ...extra] = process.argv.slice(2);
const fail = (message) => { throw new Error(message); };
if (process.env.CODEX_HABITAT_HOME_ASSISTANT_CONTROL !== 'true') fail('Home Assistant control actions are disabled.');
if (!process.env.SUPERVISOR_TOKEN) fail('Home Assistant API access is unavailable.');
if (!['areas', 'media-devices', 'device-info', 'device-area'].includes(action)) fail('Unsupported registry action.');
if (extra.length || (['areas', 'media-devices'].includes(action) ? entity !== undefined : action === 'device-info' && area !== undefined)) fail('Unexpected registry arguments.');
if (!['areas', 'media-devices'].includes(action) && !/^(media_player|remote)\.[a-z0-9_]+$/.test(entity || '')) fail('Specify a media_player or remote entity.');
if (action === 'device-area' && !/^[a-z0-9_-]+$/.test(area || '')) fail('Specify an existing area ID.');
let sequence = 0;
const pending = new Map();
const ws = new WebSocket('ws://supervisor/core/websocket');
let authenticated = false;
let readyResolve, readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
const rejectAll = (message) => {
  const error = new Error(message);
  readyReject(error);
  for (const p of pending.values()) p.reject(error);
  pending.clear();
};
const timeout = setTimeout(() => { rejectAll('Home Assistant WebSocket timed out; verify state before retrying a change.'); ws.close(); }, 25000);
ws.addEventListener('error', () => rejectAll('Home Assistant WebSocket connection failed.'));
ws.addEventListener('close', () => rejectAll('Home Assistant WebSocket closed.'));
ws.addEventListener('message', ({data}) => {
  let message;
  try { message = JSON.parse(data); } catch { rejectAll('Invalid Home Assistant response.'); return; }
  if (message.type === 'auth_required') ws.send(JSON.stringify({type:'auth', access_token:process.env.SUPERVISOR_TOKEN}));
  else if (message.type === 'auth_ok') { authenticated = true; readyResolve(); }
  else if (message.type === 'auth_invalid') rejectAll('Home Assistant authentication rejected.');
  else if (message.type === 'result') {
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    if (message.success) p.resolve(message.result);
    else p.reject(new Error(`Home Assistant rejected registry request (${message.error?.code || 'unknown'}).`));
  }
});
function request(type, fields = {}) {
  if (!authenticated) fail('Not authenticated.');
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, type, ...fields}));
  });
}
try {
  await ready;
  const areas = await request('config/area_registry/list');
  if (action === 'areas') console.log(JSON.stringify(areas.map(({area_id,name}) => ({area_id,name})), null, 2));
  else {
    const entities = await request('config/entity_registry/list');
    if (action === 'media-devices') {
      const devices = await request('config/device_registry/list');
      console.log(JSON.stringify(entities.filter(e => /^(media_player|remote)\./.test(e.entity_id)).map(e => {const d=devices.find(d=>d.id===e.device_id);return {entity_id:e.entity_id,device_name:d?.name_by_user || d?.name,area_id:e.area_id || d?.area_id};}), null, 2));
    } else {
    const entry = entities.find(e => e.entity_id === entity);
    if (!entry?.device_id) fail('Entity has no registered device.');
    let devices = await request('config/device_registry/list');
    const device = devices.find(d => d.id === entry.device_id);
    if (!device) fail('Registered device not found.');
    const members = entities.filter(e => e.device_id === device.id);
    const before = device.area_id;
    if (action === 'device-area') {
      if (!areas.some(a => a.area_id === area)) fail('Area ID does not exist.');
      if (members.some(e => e.area_id && e.area_id !== area)) fail('Entity area overrides conflict; no change made.');
      if (before !== area) await request('config/device_registry/update', {device_id:device.id, area_id:area});
      devices = await request('config/device_registry/list');
      if (devices.find(d => d.id === device.id)?.area_id !== area) fail('Device area verification failed.');
    }
    const current = devices.find(d => d.id === device.id);
    console.log(JSON.stringify({device_id:device.id, name:device.name_by_user || device.name, previous_area_id:before,
      area_id:current.area_id, area_name:areas.find(a => a.area_id === current.area_id)?.name,
      entities:members.map(e => ({entity_id:e.entity_id,area_id:e.area_id || current.area_id})),
      verified:action === 'device-area'}, null, 2));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { clearTimeout(timeout); ws.close(); }
