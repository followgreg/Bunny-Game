#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const SNEK_PATH  = path.join(__dirname, 'assets/data/snek-levels.json');
const OUTPUT     = path.join(__dirname, 'assets/data/fuse-levels.json');
const TIMEOUT_MS = 2000;

function key(r, c) { return r + ',' + c; }

function pickSpark(cells, startR, startC, storedEnd) {
  var n       = cells.length;
  var cellSet = {};
  cells.forEach(function (c) { cellSet[key(c[0], c[1])] = true; });

  var counts   = {};
  var seKey    = key(storedEnd[0], storedEnd[1]);
  counts[seKey] = 1;

  var deadline  = Date.now() + TIMEOUT_MS;
  var aborted   = false;
  var callCount = 0;

  function dfs(r, c, visited) {
    // Check deadline every 1024 recursive calls (cheap but responsive)
    if ((++callCount & 0x3FF) === 0 && Date.now() > deadline) {
      aborted = true;
    }
    if (aborted) return false;

    if (visited.size === n) {
      var k = key(r, c);
      counts[k] = (counts[k] || 0) + 1;
      return true;
    }

    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    // Fisher-Yates shuffle
    for (var i = dirs.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = tmp;
    }

    for (var di = 0; di < dirs.length; di++) {
      var nr = r + dirs[di][0];
      var nc = c + dirs[di][1];
      var nk = key(nr, nc);
      if (cellSet[nk] && !visited.has(nk)) {
        visited.add(nk);
        if (dfs(nr, nc, visited)) { visited.delete(nk); return true; }
        visited.delete(nk);
        if (aborted) return false;
      }
    }
    return false;
  }

  while (!aborted) {
    var visited = new Set([key(startR, startC)]);
    dfs(startR, startC, visited);
  }

  // Find rarest end cell (lowest count), excluding start
  var startKey = key(startR, startC);
  var best = null;
  var bestCount = Infinity;

  Object.keys(counts).forEach(function (k) {
    if (k === startKey) return;
    if (counts[k] < bestCount) {
      bestCount = counts[k];
      best = k;
    }
  });

  if (!best) return storedEnd;

  var parts = best.split(',');
  return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
}

// Load snek levels
var snekLevels = JSON.parse(fs.readFileSync(SNEK_PATH, 'utf8'));

// Top 25 by cell count descending, then re-sort ascending for progression
var sorted = snekLevels.slice().sort(function (a, b) {
  return b.cells.length - a.cells.length;
});
var top25 = sorted.slice(0, 25);
top25.sort(function (a, b) { return a.cells.length - b.cells.length; });

console.log('Processing ' + top25.length + ' levels...');

var fuseLevels = top25.map(function (data, idx) {
  var levelNum  = idx + 1;
  var cells     = data.cells;
  var startR    = data.start[0];
  var startC    = data.start[1];
  var storedEnd = data.solution[data.solution.length - 1];

  process.stdout.write('Level ' + levelNum + ' (' + cells.length + ' cells)... ');

  var spark = pickSpark(cells, startR, startC, storedEnd);

  console.log('spark = [' + spark[0] + ',' + spark[1] + ']');

  return {
    level:  levelNum,
    cells:  cells,
    start:  [startR, startC],
    spark:  spark
  };
});

fs.writeFileSync(OUTPUT, JSON.stringify(fuseLevels, null, 2));
console.log('\nWrote ' + fuseLevels.length + ' levels to ' + OUTPUT);
