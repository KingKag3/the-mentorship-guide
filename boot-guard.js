/* A MEMBERS PAGE MUST NEVER SIT THERE BLANK.
 *
 * Every page in the members area is authored hidden: `#body` carries `hidden`,
 * and the module script unhides it once `requireRole` has answered. That is the
 * right default - it stops a member's trades painting for an instant before the
 * auth check has finished - but it has one failure mode, and it is the worst
 * kind: if the module never runs, the page is a masthead, a heading and a
 * footer, with nothing in between and nothing said. It looks like a page that
 * legitimately has no content.
 *
 * WHAT ACTUALLY DOES THIS, and why it will happen again.
 *
 * There is no build step here, which is deliberate, and it means the browser
 * caches each file on its own. GitHub Pages serves `max-age=600`, so for ten
 * minutes after a deploy a browser can hold yesterday's `app.js` while fetching
 * today's `calendar.html`. If that page's imports gained a name that the cached
 * `app.js` does not export - which is what most of a day's work looks like -
 * the module graph fails to instantiate, NOTHING in the module runs, and the
 * page is blank until the cache lets go. It is not a bug in the code that was
 * written; both files are correct, and correct separately.
 *
 * It self-heals within ten minutes, which is exactly why it is so expensive:
 * by the time anybody looks, it is working.
 *
 * So this file is a classic script - no imports, nothing that can fail the same
 * way - and it says what happened rather than leaving a blank page to be
 * interpreted. It never reloads on its own: a reload loop on a page somebody
 * cannot read is worse than the blank page.
 */
(function () {
  'use strict';

  // Long enough that a slow session check, a cold Supabase connection, or a
  // redirect to the sign-in page all finish first. Anything still blank at
  // this point is not being slow, it is stuck.
  var DEADLINE_MS = 9000;

  // Same shape the module uses, so a stuck page does not look foreign.
  var MESSAGE =
    '<div class="callout risk"><span class="callout-label">This page did not finish loading</span>' +
    '<p id="boot-guard-why">Something stopped the page before it could show anything. ' +
    'The usual cause is a file left over from a recent update, which clears itself ' +
    'within a few minutes.</p>' +
    '<p><button type="button" class="btn-primary" id="boot-guard-retry">Try again</button> ' +
    '&nbsp; <a href="members.html">Members area</a></p></div>';

  var failed = null;
  var shown = false;

  /* A module that fails to instantiate reports here. The message is kept and
   * shown to the member as-is: "does not provide an export named" is not
   * friendly, but it is the truth, and it is what gets pasted into a bug
   * report that would otherwise read "it was just blank". */
  window.addEventListener('error', function (e) {
    var text = (e && e.message) || '';
    if (/module|import|MIME|Failed to fetch|dynamically imported/i.test(text)) failed = text;
  });

  function stillBlank() {
    /* ANYTHING THE PAGE HAS ALREADY SAID WINS.
     *
     * `requireRole` puts "Checking your session..." here before its first
     * await, and replaces it with a real explanation - not connected, awaiting
     * approval, could not check your session - in every case it can name. A
     * page that is slow, or that has already said what is wrong, is not a blank
     * page, and covering its own message with a vaguer one would be a step
     * backwards. */
    var mount = document.getElementById('auth-root');
    if (mount && mount.innerHTML.trim()) return false;

    var body = document.getElementById('body');
    if (body && body.hidden) return true;

    /* Pages with no `#body` wrapper (members, admin, a lesson) render into
     * `#auth-root` or into `main` directly, so the only honest test left is
     * whether a module failure was actually seen. Guessing from an empty
     * element there would fire on pages that are simply quiet. */
    return !body && !!failed;
  }

  function show() {
    if (shown || !stillBlank()) return;
    shown = true;

    var mount = document.getElementById('auth-root');
    if (!mount) {
      var main = document.querySelector('main');
      if (!main) return;
      mount = document.createElement('div');
      main.insertBefore(mount, main.firstChild);
    }

    // `stillBlank` has already established there is nothing here to wipe.
    mount.innerHTML = MESSAGE;

    if (failed) {
      var why = document.getElementById('boot-guard-why');
      if (why) {
        why.insertAdjacentHTML('afterend',
          '<p class="stat-note">The browser reported: <code></code></p>');
        why.nextElementSibling.querySelector('code').textContent = failed;
      }
    }

    var retry = document.getElementById('boot-guard-retry');
    if (retry) {
      retry.addEventListener('click', function () {
        // A plain reload can be answered from the same cache that caused this,
        // so the URL is changed. The page reads nothing from its query string.
        var url = location.pathname + '?retry=' + Date.now() +
          (location.hash || '');
        location.replace(url);
      });
    }
  }

  // Started at parse time rather than on load, because a module that fails to
  // instantiate can stop `load` from being a useful signal.
  setTimeout(show, DEADLINE_MS);
})();
