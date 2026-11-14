import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdirSync, symlinkSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Fake HA server: records every requested command; never connects to HA.
const fixture = `
import {readFileSync, appendFileSync} from 'node:fs';
let config = JSON.parse(readFileSync(process.env.FIXTURE_CONFIG, 'utf8'));
globalThis.WebSocket = class extends EventTarget {
  constructor() { super(); queueMicrotask(() => this.reply({type:'auth_required'})); }
  reply(data) { this.dispatchEvent(new MessageEvent('message', {data:JSON.stringify(data)})); }
  send(data) {
    const m = JSON.parse(data);
    queueMicrotask(() => {
      if (m.type === 'auth') return this.reply({type:process.env.FIXTURE_AUTH_INVALID ? 'auth_invalid' : 'auth_ok'});
      appendFileSync(process.env.FIXTURE_LOG, m.type + '\\n');
      appendFileSync(process.env.FIXTURE_LOG + '.jsonl', JSON.stringify(m) + '\\n');
      if (process.env.FIXTURE_READ_ERROR) return this.reply({type:'result',id:m.id,success:false,error:{code:'config_not_found'}});
      if (m.type === 'lovelace/config/save') {
        if (process.env.FIXTURE_REJECT) return this.reply({type:'result',id:m.id,success:false,error:{code:'not_supported'}});
        if (!process.env.FIXTURE_MISMATCH) config = m.config;
        if (process.env.FIXTURE_CLOSE) return this.dispatchEvent(new Event('close'));
      }
      this.reply({type:'result',id:m.id,success:true,result:m.type === 'lovelace/config' ? config : null});
    });
  }
  close() {}
};
`;
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ha-dashboard-test-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const preload = join(dir, 'fake.mjs'), server = join(dir, 'server.json'), log = join(dir, 'requests');
  const baseline = join(dir, 'baseline.json'), desired = join(dir, 'desired.json');
  writeFileSync(preload, fixture);
  writeFileSync(server, JSON.stringify({views:[{title:'Before'}]}));
  writeFileSync(baseline, readFileSync(server));
  writeFileSync(desired, JSON.stringify({views:[{title:'After'}]}));
  const env = {...process.env, CODEX_HABITAT_HOME_ASSISTANT_CONTROL:'true', SUPERVISOR_TOKEN:'test-only', FIXTURE_CONFIG:server, FIXTURE_LOG:log};
  const run = (args, overrides = {}) => spawnSync(process.execPath, ['--import',preload, new URL('../../codex_habitat/codex-habitat-dashboard.mjs', import.meta.url).pathname,...args], {env:{...env,...overrides},encoding:'utf8',timeout:5000});
  const requests = () => existsSync(log) ? readFileSync(log,'utf8').trim().split('\n') : [];
  const payloads = () => existsSync(log + '.jsonl') ? readFileSync(log + '.jsonl','utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  const shell = (args, overrides = {}) => spawnSync('bash', [new URL('../../codex_habitat/codex-habitat-ha', import.meta.url).pathname,...args], {env:{...env,NODE_OPTIONS:`--import=${preload}`,...overrides},encoding:'utf8',timeout:5000});
  return {dir,server,baseline,desired,run,requests,payloads,shell};
}
test('disabled gate and invalid input never reach transport', t => {
  const s = setup(t);
  assert.notEqual(s.run(['dashboard-get','default',join(s.dir,'out.json')], {CODEX_HABITAT_HOME_ASSISTANT_CONTROL:'false'}).status, 0);
  assert.notEqual(s.run(['dashboard-get','../other',join(s.dir,'out.json')]).status, 0);
  writeFileSync(s.desired, '{"views":42}');
  assert.notEqual(s.run(['dashboard-save','default',s.desired,s.baseline]).status, 0);
  assert.deepEqual(s.requests(), []);
});
test('get refuses overwriting files and active storage paths', t => {
  const s = setup(t), output = join(s.dir,'out.json');
  assert.equal(s.run(['dashboard-get','default',output]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(output)), {views:[{title:'Before'}]});
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.notEqual(s.run(['dashboard-get','default',output]).status, 0);
  assert.notEqual(s.run(['dashboard-get','default','/homeassistant/.storage/test.json']).status, 0);
});
test('storage paths and symlink targets are rejected without saves', t => {
  const s = setup(t), storage = join(s.dir,'.storage'), alias = join(s.dir,'alias');
  mkdirSync(storage);
  writeFileSync(join(storage,'config.json'), readFileSync(s.baseline));
  symlinkSync(storage, alias);
  symlinkSync(join(storage,'config.json'), join(s.dir,'link.json'));
  for (const file of [join(storage,'config.json'),join(alias,'config.json'),join(s.dir,'link.json')]) {
    assert.notEqual(s.run(['dashboard-save','default',file,s.baseline]).status, 0);
    assert.notEqual(s.run(['dashboard-save','default',s.desired,file]).status, 0);
  }
  assert.notEqual(s.run(['dashboard-get','default',join(alias,'new.json')]).status, 0);
  assert.deepEqual(s.requests(), []);
});
test('shell dispatch supports default and named dashboards with no embedded IDs', t => {
  for (const dashboard of ['default','example-dashboard']) {
    const s = setup(t), output = join(s.dir,'out.json');
    const result = s.shell(['dashboard-get',dashboard,output]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(s.payloads(), [{id:1,type:'lovelace/config',url_path:dashboard === 'default' ? null : dashboard}]);
    const saved = s.shell(['dashboard-save',dashboard,s.desired,s.baseline]);
    assert.equal(saved.status, 0, saved.stderr);
    assert.ok(s.payloads().every(m => ['lovelace/config','lovelace/config/save'].includes(m.type)));
  }
});
test('invalid JSON, missing credentials and extra arguments fail before requests', t => {
  const s = setup(t), output = join(s.dir,'out.json');
  assert.notEqual(s.run(['dashboard-get','default',output], {SUPERVISOR_TOKEN:''}).status, 0);
  assert.notEqual(s.run(['dashboard-get','default',output,'extra']).status, 0);
  assert.notEqual(s.run(['dashboard-save','default',s.desired]).status, 0);
  writeFileSync(s.desired, '{private-fixture-invalid-json');
  const result = s.run(['dashboard-save','default',s.desired,s.baseline]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid JSON dashboard file/);
  assert.doesNotMatch(result.stderr, /private-fixture-invalid-json|test-only/);
  assert.deepEqual(s.requests(), []);
});
test('authentication and unavailable configurations fail without output or backup', t => {
  for (const flag of ['FIXTURE_AUTH_INVALID','FIXTURE_READ_ERROR']) {
    const s = setup(t), output = join(s.dir,'out.json');
    assert.notEqual(s.run(['dashboard-get','default',output], {[flag]:'true'}).status, 0);
    assert.equal(existsSync(output), false);
    assert.notEqual(s.run(['dashboard-save','default',s.desired,s.baseline], {[flag]:'true'}).status, 0);
    assert.ok(!s.requests().includes('lovelace/config/save'));
    assert.ok(!readdirSync(s.dir).some(name => name.includes('.before-')));
  }
});
test('stale baseline blocks save', t => {
  const s = setup(t);
  writeFileSync(s.server, JSON.stringify({views:[{title:'Changed elsewhere'}]}));
  assert.notEqual(s.run(['dashboard-save','default',s.desired,s.baseline]).status, 0);
  assert.deepEqual(s.requests(), ['lovelace/config']);
});
test('save backs up and verifies; unchanged config sends no save', t => {
  const s = setup(t);
  const result = s.run(['dashboard-save','default',s.desired,s.baseline]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verified, true);
  assert.equal(statSync(report.backup).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(report.backup)), {views:[{title:'Before'}]});
  assert.deepEqual(s.requests(), ['lovelace/config','lovelace/config/save','lovelace/config']);
  const noChange = s.run(['dashboard-save','default',s.baseline,s.baseline]);
  assert.equal(noChange.status, 0, noChange.stderr);
  assert.equal(JSON.parse(noChange.stdout).changed, false);
  assert.deepEqual(s.requests(), ['lovelace/config','lovelace/config/save','lovelace/config','lovelace/config']);
});
test('HA rejection and divergent readback fail and preserve backup', t => {
  for (const flag of ['FIXTURE_REJECT','FIXTURE_MISMATCH','FIXTURE_CLOSE']) {
    const s = setup(t);
    const result = s.run(['dashboard-save','default',s.desired,s.baseline], {[flag]:'true'});
    assert.notEqual(result.status, 0);
    assert.ok(readdirSync(s.dir).some(name => name.startsWith('desired.json.before-')));
    assert.ok(!result.stderr.includes('test-only'));
    assert.match(result.stderr, /Pre-save backup:/);
    assert.equal(s.requests().filter(type => type === 'lovelace/config/save').length, 1);
  }
});
