/* `checklist_done = false` carries two facts and the pages could not tell them
 * apart.
 *
 * A trade typed into the journal with the boxes left unticked is a member
 * declining a question. A trade that arrived in a CSV has the same false and
 * means nobody was asked anything - the importer has no boxes. Most members
 * import most days, so on most journals the column reads false almost
 * everywhere, and every page that consulted it was reporting a discipline
 * problem where there was only a file.
 *
 * `checklistState` reads `imported_at` and the judgement columns to separate
 * them. This checks the separation, including the two cases that are easy to
 * get wrong: a column that came back null versus one that was never selected,
 * and notes, which CAN arrive from a file and therefore prove nothing.
 */
import fs from 'node:fs';

const src = fs.readFileSync('app.js', 'utf8');
const part = src.slice(src.indexOf('const JUDGEMENTS'),
                       src.indexOf('export function tradeValue'));
const { checklistState, wasWrittenUp } =
  new Function(part.replace(/export /g, '') +
               '; return { checklistState, wasWrittenUp };')();

let bad = 0;
const is = (what, row, want) => {
  const got = checklistState(row);
  console.log((got === want ? 'ok   ' : 'FAIL ') + what +
              (got === want ? '' : '  wanted ' + want + ', got ' + got));
  if (got !== want) bad++;
};

const STAMP = '2026-08-26T13:00:00Z';

// Typed by hand: imported_at is null, and null is evidence.
is('typed and ticked',            { checklist_done: true,  imported_at: null }, 'done');
is('typed and left unticked',     { checklist_done: false, imported_at: null }, 'skipped');

// Imported: nobody was asked, and that is not a failure.
is('imported, untouched',         { checklist_done: false, imported_at: STAMP }, 'not-asked');
is('imported then ticked',        { checklist_done: true,  imported_at: STAMP }, 'done');

/* Imported and then written up in the journal. Saving the form shows the
 * checklist and raises the incomplete-checklist confirmation, so this member
 * WAS asked and declined - the same state as a hand-typed trade. */
is('imported then written up',
   { checklist_done: false, imported_at: STAMP, model: 'silver bullet' }, 'skipped');
is('a single judgement column is enough',
   { checklist_done: false, imported_at: STAMP, agreed_with_bias: false }, 'skipped');

// Blank strings are not answers.
is('empty judgement columns are not written up',
   { checklist_done: false, imported_at: STAMP, model: '', bias: '   ' }, 'not-asked');

/* Notes can come out of a file - a journal exported from this site and read
 * back in carries its own - so notes alone prove nothing about who filled them
 * in. Same for session_kz, which the importer derives from the clock. */
is('notes alone are not evidence',
   { checklist_done: false, imported_at: STAMP, notes: 'from the export' }, 'not-asked');
is('a derived session is not evidence',
   { checklist_done: false, imported_at: STAMP, session_kz: 'silver bullet' }, 'not-asked');

/* admin.html drops `imported_at` from its select when the migration is
 * missing, so the field is undefined rather than null. Undefined is not
 * evidence of anything and must not be read as "typed" - that is how somebody
 * gets a red flag for a checklist they were never shown. */
is('column never selected, nothing else to go on', { checklist_done: false }, 'not-asked');
is('column never selected, but written up',
   { checklist_done: false, model: 'turtle soup' }, 'skipped');

is('no row at all', null, 'not-asked');

const t = (what, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
t('wasWrittenUp ignores notes', !wasWrittenUp({ notes: 'x' }));
t('wasWrittenUp accepts management', wasWrittenUp({ management: 'moved to breakeven' }));
t('wasWrittenUp accepts agreed_with_bias true', wasWrittenUp({ agreed_with_bias: true }));
t('wasWrittenUp on an empty row', !wasWrittenUp({}));

console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
