/* ---------------------------------------------------------------------------
   Theme bootstrap.

   Loaded as a classic (non-module) script in <head>, deliberately. A module is
   deferred, which means it runs after first paint — the page would render in
   the system theme and then flip. This blocks for well under a millisecond and
   gets it right the first time.

   Three states, not two:
     null      follow the operating system, and keep following it
     "light"   pinned light
     "dark"    pinned dark

   Only the pinned states write data-theme. When nothing is pinned the attribute
   is absent and the prefers-color-scheme rules in style.css decide, which is
   what makes "follow the system" keep working after the system changes.
   --------------------------------------------------------------------------- */

(function () {
  var KEY = 'tk_theme';

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (err) {
      return null;              // private mode, or storage disabled
    }
  }

  function apply(theme) {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  apply(stored());

  /** What is actually on screen right now, whatever the reason. */
  function active() {
    var pinned = stored();
    if (pinned) return pinned;
    return window.matchMedia &&
           window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  /**
   * Flip to the opposite of what is currently showing, and pin it.
   *
   * Toggling always pins. Returning to "follow the system" is deliberately not
   * on the button: a third state that looks identical to one of the other two
   * is a control nobody can read. Clearing tk_theme in devtools restores it.
   */
  function toggle() {
    var next = active() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (err) { /* private mode */ }
    apply(next);
    return next;
  }

  // Wire every toggle button on the page once the markup exists.
  function wire() {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var now = toggle();
        var all = document.querySelectorAll('[data-theme-toggle]');
        for (var j = 0; j < all.length; j++) {
          all[j].setAttribute(
            'aria-label',
            now === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          );
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.TKTheme = { active: active, toggle: toggle };
})();
