/* dev.js — developer resource page: syntax highlighting + copy buttons.
   No dependencies, in keeping with the rest of the site. */
(function () {
  'use strict';

  // ── Minimal JS tokenizer ───────────────────────────────────────────────────
  // One left-to-right pass. Comments and strings are matched first so their
  // contents are never re-tokenized (a URL inside a string stays a string).
  var KEYWORDS = 'function|var|let|const|return|if|else|for|while|do|new|this|null|' +
                 'undefined|true|false|typeof|instanceof|in|of|break|continue|try|' +
                 'catch|finally|throw|class|extends|switch|case|default|delete|void|' +
                 'async|await|yield|export|import|from';

  var BUILTINS = 'Math|Set|Map|Array|Object|JSON|Number|String|Boolean|Date|Promise|' +
                 'RegExp|Error|Uint8Array|Int8Array|AbortController|localStorage|' +
                 'document|window|console|fetch|requestAnimationFrame|setTimeout|' +
                 'clearTimeout|navigator';

  var TOKEN_RE = new RegExp(
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)' +               // 1 comment
    '|(\'(?:\\\\.|[^\'\\\\])*\'' +                           // 2 string '…'
      '|"(?:\\\\.|[^"\\\\])*"' +                             //   string "…"
      '|`(?:\\\\.|[^`\\\\])*`)' +                            //   template `…`
    '|\\b(' + KEYWORDS + ')\\b' +                            // 3 keyword
    '|\\b(' + BUILTINS + ')\\b' +                            // 4 builtin
    '|\\b(0x[0-9a-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?)\\b' +      // 5 number
    '|([A-Za-z_$][\\w$]*)(?=\\s*\\()',                       // 6 call / declaration name
    'g'
  );

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(src) {
    var out = '';
    var last = 0;
    var m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src)) !== null) {
      out += esc(src.slice(last, m.index));
      var cls = m[1] ? 'tok-comment'
              : m[2] ? 'tok-string'
              : m[3] ? 'tok-keyword'
              : m[4] ? 'tok-builtin'
              : m[5] ? 'tok-number'
              :        'tok-fnname';
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    out += esc(src.slice(last));
    return out;
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:absolute;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }

  function wireCopyButton(box, source) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');

    var resetTimer = null;
    btn.addEventListener('click', function () {
      copyText(source).then(function () {
        btn.textContent = 'Copied ✓';
        btn.classList.add('copied');
      }, function () {
        btn.textContent = 'Press ⌘C';
      });
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    });

    box.appendChild(btn);
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  function init() {
    var boxes = document.querySelectorAll('.code-box');
    for (var i = 0; i < boxes.length; i++) {
      var box  = boxes[i];
      var code = box.querySelector('code');
      if (!code) continue;
      var src = code.textContent.replace(/^\n+|\s+$/g, '');
      code.innerHTML = highlight(src);
      wireCopyButton(box, src);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
