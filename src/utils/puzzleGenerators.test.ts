import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSudoku, generateWordSearch, generateMaze, generateMandalaPath } from './puzzleGenerators.ts';

test('generateSudoku generates a valid 9x9 board with clues according to difficulty', () => {
  const sudoku = generateSudoku('easy', 42);
  assert.equal(sudoku.grid.length, 9);
  assert.equal(sudoku.grid[0].length, 9);
  assert.equal(sudoku.solution.length, 9);

  // Check that solution has no zeros
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      assert.ok(sudoku.solution[r][c] >= 1 && sudoku.solution[r][c] <= 9);
    }
  }

  // Check that puzzle grid has holes (zeros)
  let zeroCount = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (sudoku.grid[r][c] === 0) zeroCount++;
    }
  }
  assert.ok(zeroCount > 35, `Expected > 35 holes for easy sudoku, got ${zeroCount}`);
});

test('generateWordSearch places words and fills grid', () => {
  const words = ['KINDLE', 'NOTEBOOK', 'PLANNER', 'JOURNAL'];
  const ws = generateWordSearch(words, 12);

  assert.equal(ws.grid.length, 12);
  assert.equal(ws.grid[0].length, 12);
  assert.ok(ws.placedWords.length > 0);

  // Check every cell is a single uppercase letter
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 12; c++) {
      assert.match(ws.grid[r][c], /^[A-Z]$/);
    }
  }
});

test('generateMaze produces solvable maze from start to end', () => {
  const maze = generateMaze(10, 10);
  assert.equal(maze.start[0], 0);
  assert.equal(maze.start[1], 0);
  assert.equal(maze.end[0], 9);
  assert.equal(maze.end[1], 9);
  assert.ok(maze.solutionPath.length >= 10);
  assert.deepEqual(maze.solutionPath[0], [0, 0]);
  assert.deepEqual(maze.solutionPath[maze.solutionPath.length - 1], [9, 9]);
});

test('generateMandalaPath returns valid non-empty SVG path string', () => {
  const path = generateMandalaPath(8, 4);
  assert.ok(path.length > 50);
  assert.ok(path.startsWith('M '));
});
