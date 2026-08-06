/* ---------------------------------------------------------------------------
   The "on this page" rail.

   Built from the page's own <h2> elements rather than hand-written, because a
   table of contents maintained by hand goes stale the first time somebody adds
   a section and forgets — and then it is worse than not having one.

   Classic deferred script: it needs the DOM but nothing from app.js, and the
   concept pages deliberately carry almost no JavaScript.
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  // Below this a rail is just noise sitting next to the text.
  var MIN_SECTIONS = 3;

  function slug(text, taken) {
    var base = text.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'section';
    var id = base;
    var n = 2;
    while (taken[id]) { id = base + '-' + n; n++; }
    taken[id] = true;
    return id;
  }

  function build() {
    var rail = document.querySelector('.page-nav');
    if (!rail) return;

    var main = document.querySelector('.layout > main');
    if (!main) return;

    var headings = Array.prototype.slice.call(main.querySelectorAll(':scope > h2'));
    if (headings.length < MIN_SECTIONS) {
      rail.remove();
      // Nothing to navigate: give the column back to the article.
      var layout = document.querySelector('.layout');
      if (layout) layout.style.gridTemplateColumns = 'minmax(0, 1fr)';
      return;
    }

    var taken = {};
    Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (el) {
      taken[el.id] = true;
    });

    var list = document.createElement('ol');
    var links = [];

    headings.forEach(function (h) {
      if (!h.id) h.id = slug(h.textContent, taken);

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      // The number comes from a CSS counter; this span carries the words.
      var label = document.createElement('span');
      label.textContent = h.textContent.trim();
      a.appendChild(label);
      li.appendChild(a);
      list.appendChild(li);
      links.push({ a: a, h: h });
    });

    var title = document.createElement('h2');
    title.textContent = 'On this page';

    var top = document.createElement('a');
    top.className = 'nav-top';
    top.href = '#';
    top.textContent = '↑ Back to top';
    top.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    });

    rail.appendChild(title);
    rail.appendChild(list);
    rail.appendChild(top);

    spy(links);
  }

  /**
   * Highlight the section currently being read.
   *
   * Uses scroll position rather than IntersectionObserver entry order: with
   * headings of wildly different section lengths, "the last heading whose top
   * has passed the reading line" is what a reader means by where they are, and
   * observer callbacks do not answer that question directly.
   */
  function spy(links) {
    if (!links.length) return;

    var ticking = false;

    function update() {
      ticking = false;
      var line = window.scrollY + 140;   // just under the sticky masthead
      var active = 0;

      for (var i = 0; i < links.length; i++) {
        if (links[i].h.getBoundingClientRect().top + window.scrollY <= line) active = i;
        else break;
      }

      // At the very bottom the last section is the one being read, even if its
      // heading never crossed the line on a short final section.
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
        active = links.length - 1;
      }

      for (var j = 0; j < links.length; j++) {
        links[j].a.classList.toggle('is-current', j === active);
      }
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });

    window.addEventListener('resize', update, { passive: true });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
