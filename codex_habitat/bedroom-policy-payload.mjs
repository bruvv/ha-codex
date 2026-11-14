import fs from 'node:fs';
const mode = process.argv[2];
let template;
if (mode === 'live') {
  template = `{% from 'slaapkamerbeleid.jinja' import tv_vrij_voor_slaapmuziek, tv_blokkeert_muziek %}{{ dict(blocks_music=tv_blokkeert_muziek() | bool, allows_sleep_music=tv_vrij_voor_slaapmuziek() | bool, sleep=states('input_boolean.slaap_mode'), yaml=states('input_boolean.yaml_automations_actief'), muted=state_attr('media_player.bedroom_speaker_cast','is_volume_muted'), volume=state_attr('media_player.bedroom_speaker_cast','volume_level')) | to_json }}`;
} else if (mode === 'test') {
  const names = ['input_boolean.slaap_mode','media_player.tv_in_slaapkamer_3','media_player.woonkamer_slaapkamer_apple_tv','media_player.bedroom_bedroom_chromecast','media_player.bedroom_bedroom_tv_chromecast','remote.bedroom_bedroom_tv_chromecast'];
  // Explicit expected outcomes, independent of the implementation's state sets.
  const cases = [
    ['all_off', ['off','off','off','off','off','off'],false,true],
    ['plex_idle_android_on', ['off','on','off','idle','on','on'],true,false],
    ['android_on_cast_off', ['off','off','off','off','on','off'],true,false],
    ['remote_on_only', ['off','off','off','idle','off','on'],true,false],
    ['cast_playing', ['off','off','off','playing','off','off'],true,false],
    ['cast_paused', ['off','off','off','paused','off','off'],true,false],
    ['cast_buffering', ['off','off','off','buffering','off','off'],true,false],
    ['cast_idle_android_off', ['off','off','off','idle','off','off'],false,true],
    ['apple_playing', ['off','off','playing','off','off','off'],true,false],
    ['philips_playing', ['off','playing','off','off','off','off'],true,false],
    ['philips_on_ordinary_unchanged', ['off','on','off','off','off','off'],false,false],
    ['philips_on_sleep', ['on','on','off','off','off','off'],true,false],
    ['sleep_all_off', ['on','off','off','off','off','off'],false,true],
    ['sleep_cast_unknown', ['on','off','off','unknown','off','off'],true,false],
    ['sleep_android_unavailable', ['on','off','off','off','unavailable','off'],true,false],
    ['sleep_remote_unknown', ['on','off','off','off','off','unknown'],true,false],
    ['sleep_philips_fallback_preserved', ['on','unavailable','off','off','off','off'],false,true]
  ].map(([name, values, blocks, sleep]) => ({name,fixture:Object.fromEntries(names.map((n,i)=>[n,values[i]])),blocks,sleep}));
  let source=fs.readFileSync('/homeassistant/custom_templates/slaapkamerbeleid.jinja','utf8');
  source=source.replace(/is_state\('([^']+)', '([^']+)'\)/g,"(fixture['$1'] == '$2')").replace(/states\('([^']+)'\)/g,"fixture['$1']");
  template=`{% set cases = ${JSON.stringify(cases)} %}{% set results = namespace(items=[]) %}{% for c in cases %}{% set fixture = c.fixture %}${source}\n{% set actual_blocks = tv_blokkeert_muziek() | bool %}{% set actual_sleep = tv_vrij_voor_slaapmuziek() | bool %}{% set results.items = results.items + [dict(name=c.name,passed=(actual_blocks == c.blocks and actual_sleep == c.sleep),blocks=actual_blocks,sleep=actual_sleep)] %}{% endfor %}{{ results.items | to_json }}`;
} else {throw new Error('Unsupported policy mode');}
console.log(JSON.stringify({template}));
