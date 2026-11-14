import fs from 'node:fs';
let template;
if (process.argv[2] === 'live') {
  template = `{% from 'huisbeleid.jinja' import slaper_alleen_thuis %}{{ dict(count=states('zone.home'), someone_home=states('zone.home') | float(-1) >= 1, nobody_home=is_state('zone.home','0'), sleeper_alone=slaper_alleen_thuis() | bool) | to_json }}`;
} else if (process.argv[2] === 'test') {
  const source = fs.readFileSync('/homeassistant/custom_templates/huisbeleid.jinja','utf8');
  let macro=source.match(/{% macro slaper_alleen_thuis\(\) -%}[\s\S]*?{%- endmacro %}/)?.[0];
  if (!macro) throw Error('Sleeper policy not found');
  const automation=fs.readFileSync('/homeassistant/automations.yaml','utf8').split('- id: nr_yaml_auto_laadmelding\n')[1]?.split('\n- id: ')[0];
  const reminder=automation?.match(/value_template: '({{ states\(''zone.home''\)[^\n]+})'/)?.[1]?.replaceAll("''", "'");
  if (!reminder) throw Error('Reminder condition not found');
  const fixtures=[
    ['empty','0',120,'on','off','off',false,false,true],
    ['one_awake','1',120,'off','off','off',false,true,false],
    ['one_sleeper_59s','1',59,'on','off','off',false,true,false],
    ['one_sleeper_60s','1',60,'on','off','off',true,true,false],
    ['one_sleeper_61s','1',61,'on','off','off',true,true,false],
    ['one_single_sleep_mode','1',120,'off','on','off',true,true,false],
    ['one_guest','1',120,'on','off','on',false,true,false],
    ['one_unknown_guest','1',120,'on','off','unknown',false,true,false],
    ['two_sleepers','2',120,'on','on','off',false,true,false],
    ['three_people','3',120,'on','off','off',false,true,false],
    ['ten_people','10',120,'on','off','off',false,true,false],
    ['unknown_count','unknown',120,'on','off','off',false,false,false],
    ['unavailable_count','unavailable',120,'on','off','off',false,false,false],
    ['invalid_count','invalid',120,'on','off','off',false,false,false],
    ['negative_count','-1',120,'on','off','off',false,false,false],
    ['recovery_timer','1',0,'on','off','off',false,true,false]
  ].map(([name,count,age,sleep,single,guest,sleeper,home,empty])=>({name,fixture:{'zone.home':count,'input_boolean.slaap_mode':sleep,'input_boolean.1_persoon_slaap_modes':single,'input_boolean.guest_mode':guest,changed:new Date((2000000000-age)*1000).toISOString()},sleeper,home,empty}));
  const mock=s=>s.replace(/is_state\('([^']+)',\s*'([^']+)'\)/g,"(fixture['$1'] == '$2')").replace(/states\('([^']+)'\)/g,"fixture['$1']").replaceAll('as_timestamp(now())','2000000000').replaceAll('states.zone.home.last_changed','fixture.changed');
  macro=mock(macro);
  const reminderExpr=mock(reminder).slice(2,-2);
  template=`{% set cases = ${JSON.stringify(fixtures)} %}{% set results = namespace(items=[]) %}{% for c in cases %}{% set fixture = c.fixture %}${macro}{% set sleeper = slaper_alleen_thuis() | bool %}{% set home = ${reminderExpr} %}{% set empty = fixture['zone.home'] == '0' %}{% set results.items = results.items + [dict(name=c.name, passed=(sleeper == c.sleeper and home == c.home and empty == c.empty))] %}{% endfor %}{{ results.items | to_json }}`;
} else { throw Error('Unsupported presence policy mode'); }
console.log(JSON.stringify({template}));
