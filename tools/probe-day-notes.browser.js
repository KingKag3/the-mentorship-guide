/* The day-note editor, exercised for real, in a browser.
 *
 * It cannot run under node: app.js imports the Supabase client from a CDN, and
 * the editor is DOM. So this is pasted into the console instead.
 *
 *   1. python -m http.server 8848   (or the "site" launch config)
 *   2. open http://localhost:8848/design.html - public, no sign-in needed
 *   3. paste this whole file into the console
 *
 * It imports the real app.js and swaps `supabase.from` for a recorder, so
 * nothing reaches the database and every write can be inspected. The swap is
 * safe because the client is one shared object: the editor reads the same
 * `supabase` this replaces a method on.
 *
 * What it proves is the part that is easy to get subtly wrong and invisible
 * when it is: the save sends the member's id and the day the upsert's conflict
 * target needs; an emptied box deletes, after asking, and only then; a failed
 * save keeps the text and names the migration; a stored note is escaped rather
 * than rendered; and a day key never slides a day through UTC.
 *
 * Verified 10 September 2026: 23 of 23. The calendar and journal wiring were
 * checked the same way - their real modules, run against stubbed data - and are
 * recorded in HANDOVER.md rather than kept here, because the harness for those
 * rewrites the page and is not something to paste casually.
 */
(async () => {
  const m = await import('/app.js?probe=' + Date.now());
  const calls = [];
  let failNext = null;

  m.supabase.from = (table) => {
    const rec = { table, op: null, payload: null, opts: null, filters: {} };
    calls.push(rec);
    const done = () => {
      const error = failNext; failNext = null;
      return Promise.resolve({ error });
    };
    return {
      upsert(payload, opts) { rec.op = 'upsert'; rec.payload = payload; rec.opts = opts; return done(); },
      delete() {
        rec.op = 'delete';
        const chain = { eq(k, v) { rec.filters[k] = v; return chain; },
                        then(res, rej) { return done().then(res, rej); } };
        return chain;
      }
    };
  };

  const confirms = [];
  let answer = true;
  window.confirm = (msg) => { confirms.push(msg); return answer; };

  // Microtasks, not timers: a hidden tab throttles setTimeout to a second or
  // more, and a probe that waits on timers there looks exactly like a hang.
  const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

  const out = [];
  let bad = 0;
  const check = (what, ok, detail) => {
    out.push((ok ? 'ok   ' : 'FAIL ') + what + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
    if (!ok) bad++;
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  const told = [];
  m.dayNoteEditor(host, { userId: 'u1', day: '2026-09-10', body: '',
                          onSaved: (d, b) => told.push([d, b]) });

  const ta = host.querySelector('textarea');
  const save = host.querySelector('[data-note-save]');
  const del = host.querySelector('[data-note-delete]');
  const status = host.querySelector('[data-note-status]');

  check('save disabled with nothing typed', save.disabled);
  check('delete hidden with no note', del.hidden);
  check('label reads the local day', /10/.test(host.querySelector('label').textContent),
        host.querySelector('label').textContent);

  ta.value = '  Sat out, CPI  ';
  ta.dispatchEvent(new Event('input'));
  check('save enabled once typed', !save.disabled);
  check('page knows there is a draft', m.dayNotesDirty());

  save.click(); await flush();
  const up = calls.at(-1);
  check('upserts to day_notes', up.table === 'day_notes' && up.op === 'upsert');
  check('trimmed, with user and day', up.payload.body === 'Sat out, CPI' &&
        up.payload.user_id === 'u1' && up.payload.day === '2026-09-10', up.payload);
  check('conflict target is user_id,day', up.opts.onConflict === 'user_id,day');
  check('says Saved.', status.textContent === 'Saved.', status.textContent);
  check('caller told the new text', told.at(-1)[1] === 'Sat out, CPI');
  check('no longer a draft', !m.dayNotesDirty());
  check('delete now offered', !del.hidden);

  ta.value = '';
  ta.dispatchEvent(new Event('input'));
  answer = false;
  const before = calls.length;
  save.click(); await flush();
  check('emptied and declined: nothing sent', calls.length === before);
  check('and it asked', /Delete your note/.test(confirms.at(-1) || ''));

  answer = true;
  save.click(); await flush();
  const gone = calls.at(-1);
  check('emptied and confirmed: deletes by user and day', gone.op === 'delete' &&
        gone.filters.user_id === 'u1' && gone.filters.day === '2026-09-10', gone.filters);
  check('caller told null', told.at(-1)[1] === null);
  check('delete hidden again', del.hidden);

  ta.value = 'retry me';
  ta.dispatchEvent(new Event('input'));
  failNext = { code: 'PGRST205',
               message: 'Could not find the table public.day_notes in the schema cache' };
  save.click(); await flush();
  check('missing table names the migration', /day-notes\.sql/.test(status.textContent),
        status.textContent);
  check('text kept after a failure', ta.value === 'retry me');
  check('still a draft after a failure', m.dayNotesDirty());
  check('save usable again', !save.disabled);

  const host2 = document.createElement('div');
  document.body.appendChild(host2);
  m.dayNoteEditor(host2, { userId: 'u1', day: '2026-09-09',
                           body: '</textarea><img src=x onerror=alert(1)>' });
  check('a stored note is text, never markup', !host2.querySelector('img') &&
        host2.querySelector('textarea').value.includes('<img'));

  check('a day key never slides through UTC',
        m.dayKeyLabel('2026-03-08', { day: 'numeric' }) === '8',
        m.dayKeyLabel('2026-03-08', { day: 'numeric' }));

  host.remove();
  host2.remove();
  console.log(out.join('\n') + '\n\n' + (bad ? bad + ' failed' : 'all passed'));
})();
