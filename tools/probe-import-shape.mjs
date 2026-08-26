/* The importer must not overwrite what only a person could have typed.
 *
 * `upsert` writes every key in the payload, on the way in AND on the way over
 * the top, so a column named with a null beside it is set to null on a
 * re-import - and re-importing is the normal case, because broker exports are
 * date ranges and date ranges overlap.
 *
 * Two things are checked here, and neither can be seen by reading a diff:
 *
 *   1. the row `mapRow` builds names only what the file actually said, and
 *      never names `checklist_done` at all;
 *   2. the grouping in `runImport` sends batches whose objects all share a key
 *      set, because PostgREST refuses a ragged batch outright:
 *          PGRST102  All object keys must match
 *      Omitting a key per row is what makes the payload ragged, so the fix for
 *      (1) is what creates the need for (2).
 */
import fs from 'node:fs';

const src = fs.readFileSync('import.html', 'utf8');
let bad = 0;
const check = (what, ok, detail) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail ? '  ' + detail : ''));
  if (!ok) bad++;
};

/* ---- 1. the row literal ---- */
const lit = src.slice(src.indexOf('const trade = {'), src.indexOf('imported_at:'));

check('checklist_done is not sent', !/checklist_done/.test(lit));
check('stop is not sent unconditionally', !/^\s*stop,\s*$/m.test(lit));
check('target is not sent unconditionally', !/target:\s*numeric/.test(lit));
check('notes is not sent unconditionally', !/^\s*notes:/m.test(lit));

for (const col of ['stop', 'target', 'notes', 'chart_url']) {
  check(col + ' is added only when the file has it',
    src.includes("['" + col + "',"));
}
check('the conditional guards on null', /if \(value !== null\) trade\[key\] = value;/.test(src));

/* The column definition is what makes omitting checklist_done correct: a
 * DEFAULT fires on INSERT and never on ON CONFLICT DO UPDATE. If somebody ever
 * drops the default, omitting the key starts writing null into a NOT NULL
 * column and every import fails. */
const schema = fs.readFileSync('supabase/trades.sql', 'utf8');
check('checklist_done still defaults to false on insert',
  /checklist_done\s+boolean not null default false/.test(schema));

/* ---- 2. the grouping ---- */
const block = src.slice(src.indexOf('const shapes = new Map();'),
                        src.indexOf('for (const batch of shapes.values())'));
const group = new Function('payload', block + '\n return shapes;');

const rows = [
  { external_id: 'a', symbol: 'NQ' },
  { external_id: 'b', symbol: 'NQ', notes: 'held it too long' },
  { external_id: 'c', symbol: 'NQ', notes: 'ok', stop: 21000 },
  { external_id: 'd', symbol: 'NQ' }
];
const shapes = group(rows);

check('ragged rows split into shapes', shapes.size === 3, 'got ' + shapes.size);
check('every batch has one key set',
  [...shapes.values()].every((batch) => {
    const first = Object.keys(batch[0]).sort().join(',');
    return batch.every((r) => Object.keys(r).sort().join(',') === first);
  }));
check('no row is lost', [...shapes.values()].reduce((a, b) => a + b.length, 0) === rows.length);
check('identical rows share a batch',
  [...shapes.values()].some((batch) => batch.length === 2));

/* A uniform payload - the ordinary broker export - must still be one request. */
const uniform = group([{ external_id: 'a' }, { external_id: 'b' }, { external_id: 'c' }]);
check('a uniform file is still a single batch', uniform.size === 1);

console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
