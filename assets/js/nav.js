// nav.js — shared chrome: header logo link, All Games / DEV shortcuts, site footer
(function () {
  'use strict';

  // Wrap the header logo in a link to the lobby (every page)
  var h1 = document.querySelector('#header h1');
  if (h1 && !h1.querySelector('a')) {
    var logoImg = h1.querySelector('img');
    if (logoImg) {
      var logoLink = document.createElement('a');
      logoLink.href = 'index.html';
      logoLink.style.cssText = 'display:block;line-height:0;';
      h1.insertBefore(logoLink, logoImg);
      logoLink.appendChild(logoImg);
    }
  }

  // Add "All Games" and "DEV" links to the header right side
  var header = document.getElementById('header');
  if (header) {
    var controls = header.querySelector('.header-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'header-controls';
      header.appendChild(controls);
    }
    // Guard against double-injection
    if (!controls.querySelector('.nav-all-games')) {
      var allGamesLink = document.createElement('a');
      allGamesLink.href = 'index.html';
      allGamesLink.className = 'icon-btn nav-all-games';
      allGamesLink.textContent = 'All Games';
      controls.insertBefore(allGamesLink, controls.firstChild);
    }
    if (!controls.querySelector('.nav-dev')) {
      var devLink = document.createElement('a');
      devLink.href = 'dev.html';
      devLink.className = 'icon-btn nav-dev';
      devLink.textContent = 'DEV';
      // Sits immediately after All Games, before the page's own buttons
      var afterAllGames = controls.querySelector('.nav-all-games');
      controls.insertBefore(devLink, afterAllGames ? afterAllGames.nextSibling : controls.firstChild);
    }
  }

  // ── Shared site footer ──────────────────────────────────────────────────────
  // Pages that already ship a <footer id="footer"> have it normalised in place;
  // pages without one get it appended. Either way every page ends up with the
  // same About / Dev / Privacy Policy links.
  var FOOTER_HTML =
    '<span class="ft-copy">©2026 Never Stop Creating, LLC</span>' +
    '<span class="ft-dot">·</span>' +
    '<a href="about.html">About</a>' +
    '<span class="ft-dot">·</span>' +
    '<a href="dev.html">Dev</a>' +
    '<span class="ft-dot">·</span>' +
    '<a href="privacy.html">Privacy Policy</a>' +
    '<span class="ft-dot ft-mail-dot">·</span>' +
    '<a class="ft-mail" href="mailto:info@neverstopcreatingllc.com">info@neverstopcreatingllc.com</a>';

  function mountFooter() {
    var footer = document.getElementById('footer');
    if (!footer) {
      // Some pages (macigame) ship an unidentified <footer> — reuse it if present
      footer = document.querySelector('body > footer');
      if (footer) {
        footer.id = 'footer';
      } else {
        footer = document.createElement('footer');
        footer.id = 'footer';
        document.body.appendChild(footer);
      }
    }
    if (footer.dataset.navFooter === '1') return; // guard against double-injection
    footer.dataset.navFooter = '1';
    footer.innerHTML = FOOTER_HTML;
  }

  if (document.body) {
    mountFooter();
  } else {
    document.addEventListener('DOMContentLoaded', mountFooter);
  }

  // nav-root intentionally left empty — nav bar removed
})();
