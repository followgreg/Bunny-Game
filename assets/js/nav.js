// nav.js — shared header behaviour: logo link + All Games shortcut
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

  // Add "All Games" link to the header right side
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
  }

  // nav-root intentionally left empty — nav bar removed
})();
