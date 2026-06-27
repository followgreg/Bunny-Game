(function () {
  'use strict';

  // ── Word list ──────────────────────────────────────────────────────────────
  var WORDS = [
    'ADVENTURE', 'AFTERNOON', 'ALONGSIDE', 'APARTMENT', 'ATTENTION',
    'AVAILABLE', 'BEAUTIFUL', 'BEGINNING', 'BREAKFAST', 'BRILLIANT',
    'BUTTERFLY', 'CAREFULLY', 'CELEBRATE', 'CHALLENGE', 'CHARACTER',
    'CHOCOLATE', 'CLASSROOM', 'COMMUNITY', 'COMPANION', 'CONFIDENT',
    'COUNTRIES', 'DANGEROUS', 'DAUGHTERS', 'DEDICATED', 'DETERMINE',
    'DIFFERENT', 'DIRECTION', 'DISCOVERY', 'EMOTIONAL', 'ENCOURAGE',
    'ESTABLISH', 'EVERYBODY', 'EXCELLENT', 'EXTREMELY', 'FANTASTIC',
    'FINANCIAL', 'FIREWORKS', 'FOLLOWING', 'GEOGRAPHY', 'HALLOWEEN',
    'HANDSHAKE', 'HAPPENING', 'HOPEFULLY', 'HOUSEHOLD', 'HURRICANE',
    'IDENTICAL', 'IMAGINARY', 'IMMEDIATE', 'IMPORTANT', 'INCLUDING',
    'INSPIRING', 'INTRODUCE', 'INVENTION', 'INVISIBLE', 'KNOWLEDGE',
    'LANDSCAPE', 'LIGHTNING', 'LISTENING', 'MARKETING', 'MEANWHILE',
    'MEMORABLE', 'MOUNTAINS', 'NATURALLY', 'NECESSARY', 'NEWSPAPER',
    'NIGHTMARE', 'OBVIOUSLY', 'OPERATION', 'ORCHESTRA', 'OTHERWISE',
    'OVERNIGHT', 'PERFECTLY', 'PERMANENT', 'PINEAPPLE', 'POTENTIAL',
    'PRESIDENT', 'QUESTIONS', 'RASPBERRY', 'RELIGIOUS', 'SEPTEMBER',
    'SITUATION', 'SOMETHING', 'SOMETIMES', 'SOMEWHERE', 'STAIRCASE',
    'STARLIGHT', 'STRUCTURE', 'SUPERHERO', 'TELEPHONE', 'TERRITORY',
    'THEREFORE', 'THOUSANDS', 'TRADITION', 'TRAVELING', 'TREATMENT',
    'UNCERTAIN', 'VEGETABLE', 'VOLUNTEER', 'WATERFALL', 'YESTERDAY',
  ];

  // ── Grid constants ─────────────────────────────────────────────────────────
  //
  //   Cell indices:    Row/col:
  //   0  1  2          (0,0)(0,1)(0,2)
  //   3  4  5          (1,0)(1,1)(1,2)
  //   6  7  8          (2,0)(2,1)(2,2)
  //
  // 8-directional adjacency (orthogonal + diagonal).
  var ADJACENCY = [
    [1, 3, 4],                    // 0  top-left
    [0, 2, 3, 4, 5],              // 1  top-center
    [1, 4, 5],                    // 2  top-right
    [0, 1, 4, 6, 7],              // 3  mid-left
    [0, 1, 2, 3, 5, 6, 7, 8],    // 4  center (all 8 neighbors)
    [1, 2, 4, 7, 8],              // 5  mid-right
    [3, 4, 7],                    // 6  bottom-left
    [3, 4, 5, 6, 8],              // 7  bottom-center
    [4, 5, 7],                    // 8  bottom-right
  ];

  // ── Utilities ──────────────────────────────────────────────────────────────
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j   = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function randomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }

  // ── Hamiltonian path (randomized backtracking) ─────────────────────────────
  //
  // Returns an array of 9 cell indices — a path visiting every cell exactly
  // once where each consecutive pair is 8-directionally adjacent.
  //
  // Strategy: pick a random start cell, then greedily extend with shuffled
  // neighbor order. Backtrack on dead ends. The 3×3 grid is small enough that
  // this resolves in microseconds for any starting cell.
  function randomHamiltonianPath() {
    var path    = [];
    var visited = new Array(9).fill(false);

    function backtrack(cell) {
      path.push(cell);
      visited[cell] = true;
      if (path.length === 9) return true;

      var ns = shuffle(ADJACENCY[cell].slice());
      for (var i = 0; i < ns.length; i++) {
        if (!visited[ns[i]] && backtrack(ns[i])) return true;
      }

      path.pop();
      visited[cell] = false;
      return false;
    }

    // Randomize the starting cell for maximum layout variety
    var starts = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (var s = 0; s < starts.length; s++) {
      path    = [];
      visited = new Array(9).fill(false);
      if (backtrack(starts[s])) return path;
    }

    // Should never reach here on a fully-connected 3×3 8-directional grid
    return [0, 1, 2, 3, 4, 5, 6, 7, 8];
  }

  // ── Grid builder ──────────────────────────────────────────────────────────
  //
  // Given a 9-letter word, places its letters into a randomized Hamiltonian
  // path through the grid.
  //
  // Returns:
  //   grid — array[9], grid[cellIndex] = letter at that cell
  //   path — array[9], path[i] = cell index holding word[i]
  //           (i.e. the correct solving order of cell indices)
  function buildGrid(word) {
    var path = randomHamiltonianPath();
    var grid = new Array(9).fill('');
    for (var i = 0; i < 9; i++) {
      grid[path[i]] = word[i];
    }
    return { word: word, grid: grid, path: path };
  }

  // ── New game ───────────────────────────────────────────────────────────────
  function newGame() {
    return buildGrid(randomWord());
  }

  // ── Dev verification ───────────────────────────────────────────────────────
  // Usage in console: _niner.verify('ADVENTURE', 6)
  function verify(word, runs) {
    runs = runs || 8;
    console.group('[Niner] buildGrid("' + word + '") × ' + runs);
    for (var r = 0; r < runs; r++) {
      var g = buildGrid(word);

      // Reconstruct word from path and check adjacency
      var rebuilt = '';
      var ok      = true;
      for (var i = 0; i < 9; i++) {
        rebuilt += g.grid[g.path[i]];
        if (i < 8 && ADJACENCY[g.path[i]].indexOf(g.path[i + 1]) === -1) ok = false;
      }
      if (rebuilt !== word) ok = false;

      var row = [
        g.grid[0], g.grid[1], g.grid[2], '|',
        g.grid[3], g.grid[4], g.grid[5], '|',
        g.grid[6], g.grid[7], g.grid[8],
      ].join(' ');
      console.log((ok ? '✓' : '✗') + '  ' + row + '  path:[' + g.path.join(',') + ']');
    }
    console.groupEnd();
  }

  // Expose to other parts and dev console
  window._niner = {
    ADJACENCY : ADJACENCY,
    buildGrid : buildGrid,
    newGame   : newGame,
    verify    : verify,
  };

})();
