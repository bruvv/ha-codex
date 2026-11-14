import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'habitat-helper-'));
const root = resolve('codex_habitat');
const env = {...process.env, CODEX_HABITAT_HOME_ASSISTANT_CONTROL:'true', SUPERVISOR_TOKEN:'fixture-token'};
let checks = 0;
function check(result, status = 0, pattern) {
  assert.equal(result.status, status, result.stderr + result.stdout);
  if (pattern) assert.match(result.stdout + result.stderr, pattern);
  checks++;
}
function shell(args, overrides = {}) {
  return spawnSync('bash', [join(root, 'codex-habitat-ha'), ...args], {
    encoding:'utf8', env:{...env, PATH:`${dir}:${process.env.PATH}`, ...overrides}, timeout:5000,
  });
}
// The fixture refuses every unexpected transport call; no network or device action occurs.
writeFileSync(join(dir, 'curl'), `#!/usr/bin/env bash
case "$*" in
  */states/*.fixture)
    entity="\${!#}"
    printf '{"entity_id":"%s","state":"on","attributes":{"brightness":42,"secret":"hidden"}}' "\${entity##*/}" ;;

  */services/homeassistant/reload_custom_templates) printf '[]' ;;
  *) exit 99 ;;
esac
`, {mode:0o755});
const mock = `
let saved = 'auto';
const entryId = '01234567890123456789012345';
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('http://supervisor/core/api/config/config_entries/options/flow')) throw Error('Unexpected URL');
  if (options.method === 'DELETE') return {ok:true};
  const body = JSON.parse(options.body);
  if (body.mode) { saved = body.mode; socket.emit({type:'event', event:{adapter:'hci0', requested_mode:saved, current_mode:'active'}}); return {ok:true,json:async()=>({type:'create_entry'})}; }
  return {ok:true,json:async()=>({type:'form',step_id:'init',flow_id:'fixture',data_schema:[process.env.FIXTURE_LEGACY ? {name:'mode',default:saved} : {name:'mode',default:'auto',suggested_value:saved}]})};
};
let socket;
globalThis.WebSocket = class {
  handlers = {};
  constructor() { socket=this; queueMicrotask(()=>this.emit({type:'auth_required'})); }
  addEventListener(type, fn) { this.handlers[type]=fn; }
  emit(message) { this.handlers.message?.({data:JSON.stringify(message)}); }
  send(raw) {
    const msg = JSON.parse(raw);
    queueMicrotask(()=>{
      if (msg.type === 'auth') { this.emit({type:'auth_ok'}); return; }
      if (process.env.FIXTURE_REJECT === 'true') { this.emit({type:'result',id:msg.id,success:false,error:{code:'fixture_rejection'}}); return; }
      let result;
      switch(msg.type) {
        case 'config/area_registry/list': result=[{area_id:'lounge',name:'Lounge'}]; break;
        case 'config/entity_registry/list': result=[{entity_id:'media_player.fixture',device_id:'device',area_id:process.env.FIXTURE_CONFLICT ? 'other' : null}]; break;
        case 'config/device_registry/list': result=[{id:'device',name:'Fixture',area_id:saved}]; break;
        case 'config/device_registry/update': saved=msg.area_id; result={}; break;
        case 'config_entries/get_single': result={config_entry:{domain:'bluetooth',state:'loaded',disabled_by:null}}; break;
        case 'bluetooth/subscribe_scanner_state': result=null; break;
        default: throw Error('Unexpected request: '+msg.type);
      }
      this.emit({type:'result',id:msg.id,success:true,result});
      if (msg.type === 'bluetooth/subscribe_scanner_state') this.emit({type:'event',event:{adapter:'hci0',requested_mode:saved,current_mode:'active'}});
    });
  }
  close() {}
};
`;
function script(name, args, overrides = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `${mock}\nprocess.argv = ['node', 'fixture', ...${JSON.stringify(args)}]; await import(${JSON.stringify(pathToFileURL(join(root, name)).href)});`], {
    encoding:'utf8', env:{...env,...overrides}, timeout:5000,
  });
}
try {
  check(shell(['--help']), 0, /custom-templates/);
  check(shell(['state','light.fixture']), 0, /"brightness": 42/);
  assert.doesNotMatch(shell(['state','light.fixture']).stdout, /secret/);
  check(shell(['state','light.fixture'], {CODEX_HABITAT_HOME_ASSISTANT_CONTROL:'false'}), 77);
  check(shell(['state']), 64);
  check(shell(['state','sensor.private']), 64);
  check(shell(['state','light.fixture/../../config']), 64);
  check(shell(['state',...Array(21).fill('light.fixture')]), 64);
  check(shell(['state','light.fixture'], {SUPERVISOR_TOKEN:''}), 78);
  check(shell(['reload','custom-templates']), 0, /reload_custom_templates/);
  check(shell(['restart'], {CODEX_HABITAT_ALLOW_HOME_ASSISTANT_RESTART:'false'}), 77);
  for (const domain of ['light','media_player','remote','switch','automation']) {
    check(shell(['state',`${domain}.fixture`]));
  }
  check(script('codex-habitat-registry.mjs', ['areas']), 0, /Lounge/);
  check(script('codex-habitat-registry.mjs', ['media-devices']), 0, /media_player.fixture/);
  check(script('codex-habitat-registry.mjs', ['device-info','media_player.fixture']), 0, /Fixture/);
  check(script('codex-habitat-registry.mjs', ['device-area','media_player.fixture','lounge']), 0, /"verified": true/);
  check(script('codex-habitat-registry.mjs', ['device-area','media_player.fixture','missing']), 1, /does not exist/);
  check(script('codex-habitat-registry.mjs', ['device-area','media_player.fixture','lounge'], {FIXTURE_CONFLICT:'true'}), 1, /conflict/);
  check(script('codex-habitat-registry.mjs', ['areas','extra']), 1, /Unexpected/);
  check(script('codex-habitat-registry.mjs', ['areas'], {FIXTURE_REJECT:'true'}), 1, /fixture_rejection/);
  const id = '01234567890123456789012345';
  check(script('codex-habitat-bluetooth.mjs', ['bluetooth-info',id]), 0, /"saved_mode": "auto"/);
  check(script('codex-habitat-bluetooth.mjs', ['bluetooth-mode',id,'passive']), 0, /"saved_mode": "passive"/);
  check(script('codex-habitat-bluetooth.mjs', ['bluetooth-mode',id,'active'], {FIXTURE_LEGACY:'true'}), 0, /"saved_mode": "active"/);
  check(script('codex-habitat-bluetooth.mjs', ['bluetooth-mode',id,'invalid']), 1, /Specify auto/);
  check(script('codex-habitat-bluetooth.mjs', ['bluetooth-info','../invalid']), 1, /config entry ID/);
  check(script('codex-habitat-bluetooth.mjs', ['bluetooth-info',id], {FIXTURE_REJECT:'true'}), 1, /fixture_rejection/);
  for (const file of ['codex-habitat-bluetooth.mjs','codex-habitat-registry.mjs']) {
    assert.ok(readFileSync(join(root,'Dockerfile'),'utf8').includes(file));
  }
  // Runtime helpers must accept entity IDs as input, never embed household IDs.
  for (const file of ['codex-habitat-ha', ...readdirSync(root).filter(name => name.endsWith('.mjs'))]) {
    assert.doesNotMatch(readFileSync(join(root,file),'utf8'), /\b(?:light|media_player|remote|switch|automation|input_boolean|sensor|binary_sensor|person|device_tracker|zone)\.[a-z0-9_]+/, file);
  }
  console.log(`${checks} helper checks passed (mock transports; no live Home Assistant actions).`);
} finally { rmSync(dir, {recursive:true,force:true}); }
