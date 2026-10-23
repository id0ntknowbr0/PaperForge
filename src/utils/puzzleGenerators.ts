/**
 * Pure Algorithmic Generators for KDP Low-Content Books:
 * - Sudoku (Easy, Medium, Hard) + Solutions
 * - Word Search Generator + Answer Keys
 * - Procedural Maze Generator (DFS Backtracker) + Solution
 * - Mandala / Geometric Coloring vectors
 */

export interface SudokuPuzzle {
  grid: number[][]; // 9x9 (0 represents empty)
  solution: number[][];
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Generate a complete valid 9x9 Sudoku board then punch holes according to difficulty
 */
export function generateSudoku(difficulty: 'easy' | 'medium' | 'hard' = 'medium', seed = 12345): SudokuPuzzle {
  // Simple LCG pseudo-random generator for reproducible generation
  let currentSeed = seed;
  const rnd = () => {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
    return currentSeed / 4294967296;
  };

  const solution: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  function isValid(grid: number[][], row: number, col: number, num: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (grid[row][i] === num || grid[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (grid[startRow + r][startCol + c] === num) return false;
      }
    }
    return true;
  }

  function fillGrid(grid: number[][]): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rnd() - 0.5);
          for (const num of numbers) {
            if (isValid(grid, r, c, num)) {
              grid[r][c] = num;
              if (fillGrid(grid)) return true;
              grid[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  fillGrid(solution);

  // Deep clone to create puzzle
  const grid: number[][] = solution.map(row => [...row]);

  // Remove numbers based on difficulty
  // Easy: ~38 clues (43 removed)
  // Medium: ~30 clues (51 removed)
  // Hard: ~24 clues (57 removed)
  const cluesToRemove = difficulty === 'easy' ? 42 : difficulty === 'medium' ? 50 : 56;
  let removed = 0;
  const attempts = 150;
  let tries = 0;

  while (removed < cluesToRemove && tries < attempts) {
    tries++;
    const r = Math.floor(rnd() * 9);
    const c = Math.floor(rnd() * 9);
    if (grid[r][c] !== 0) {
      grid[r][c] = 0;
      removed++;
    }
  }

  return { grid, solution, difficulty };
}

export interface WordSearchPuzzle {
  grid: string[][];
  words: string[];
  placedWords: { word: string; row: number; col: number; dir: [number, number] }[];
  size: number;
}

/**
 * Word Search Puzzle Generator
 */
export function generateWordSearch(wordList: string[], size = 12): WordSearchPuzzle {
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''));
  const cleanWords = wordList
    .map(w => w.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(w => w.length >= 3 && w.length <= size);

  // Directions: [dRow, dCol]
  const directions: [number, number][] = [
    [0, 1],   // Right
    [1, 0],   // Down
    [1, 1],   // Diagonal Down-Right
    [-1, 1],  // Diagonal Up-Right
    [0, -1],  // Left
    [1, -1],  // Diagonal Down-Left
  ];

  const placedWords: { word: string; row: number; col: number; dir: [number, number] }[] = [];

  for (const word of cleanWords) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 100) {
      attempts++;
      const dir = directions[Math.floor(Math.random() * directions.length)];
      const [dr, dc] = dir;

      // Calculate start bounds
      const minR = dr < 0 ? word.length - 1 : 0;
      const maxR = dr > 0 ? size - word.length : size - 1;
      const minC = dc < 0 ? word.length - 1 : 0;
      const maxC = dc > 0 ? size - word.length : size - 1;

      if (maxR < minR || maxC < minC) continue;

      const r = minR + Math.floor(Math.random() * (maxR - minR + 1));
      const c = minC + Math.floor(Math.random() * (maxC - minC + 1));

      // Check collision
      let canPlace = true;
      for (let i = 0; i < word.length; i++) {
        const nr = r + i * dr;
        const nc = c + i * dc;
        if (grid[nr][nc] !== '' && grid[nr][nc] !== word[i]) {
          canPlace = false;
          break;
        }
      }

      if (canPlace) {
        for (let i = 0; i < word.length; i++) {
          grid[r + i * dr][c + i * dc] = word[i];
        }
        placedWords.push({ word, row: r, col: c, dir });
        placed = true;
      }
    }
  }

  // Fill remaining blanks with random letters A-Z
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }

  return {
    grid,
    words: placedWords.map(p => p.word),
    placedWords,
    size,
  };
}

export interface MazeData {
  width: number;
  height: number;
  verticalWalls: boolean[][]; // [y][x] wall between (x, y) and (x+1, y)
  horizontalWalls: boolean[][]; // [y][x] wall between (x, y) and (x, y+1)
  start: [number, number];
  end: [number, number];
  solutionPath: [number, number][];
}

/**
 * Procedural Depth-First Search Maze Generator
 */
export function generateMaze(width = 15, height = 15): MazeData {
  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const verticalWalls: boolean[][] = Array.from({ length: height }, () => Array(width - 1).fill(true));
  const horizontalWalls: boolean[][] = Array.from({ length: height - 1 }, () => Array(width).fill(true));

  const stack: [number, number][] = [[0, 0]];
  visited[0][0] = true;

  const parents: Map<string, [number, number]> = new Map();

  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1];
    const neighbors: [number, number, 'N' | 'S' | 'E' | 'W'][] = [];

    // Check North
    if (y > 0 && !visited[y - 1][x]) neighbors.push([x, y - 1, 'N']);
    // Check South
    if (y < height - 1 && !visited[y + 1][x]) neighbors.push([x, y + 1, 'S']);
    // Check East
    if (x < width - 1 && !visited[y][x + 1]) neighbors.push([x + 1, y, 'E']);
    // Check West
    if (x > 0 && !visited[y][x - 1]) neighbors.push([x - 1, y, 'W']);

    if (neighbors.length > 0) {
      const [nx, ny, dir] = neighbors[Math.floor(Math.random() * neighbors.length)];
      if (dir === 'N') horizontalWalls[ny][nx] = false;
      if (dir === 'S') horizontalWalls[y][x] = false;
      if (dir === 'E') verticalWalls[y][x] = false;
      if (dir === 'W') verticalWalls[ny][nx] = false;

      visited[ny][nx] = true;
      parents.set(`${nx},${ny}`, [x, y]);
      stack.push([nx, ny]);
    } else {
      stack.pop();
    }
  }

  // Trace solution from end (width-1, height-1) back to start (0, 0)
  const solutionPath: [number, number][] = [[width - 1, height - 1]];
  let curr: [number, number] = [width - 1, height - 1];
  while (curr[0] !== 0 || curr[1] !== 0) {
    const parent = parents.get(`${curr[0]},${curr[1]}`);
    if (!parent) break;
    solutionPath.unshift(parent);
    curr = parent;
  }

  return {
    width,
    height,
    verticalWalls,
    horizontalWalls,
    start: [0, 0],
    end: [width - 1, height - 1],
    solutionPath,
  };
}

/**
 * Procedural Mandala / Geometric Path Generator
 */
export function generateMandalaPath(symmetry = 12, rings = 5): string {
  const cx = 300;
  const cy = 300;
  let svgPaths: string[] = [];

  for (let r = 1; r <= rings; r++) {
    const radius = r * 45;
    const innerRadius = (r - 0.5) * 45;
    const step = (Math.PI * 2) / symmetry;

    for (let s = 0; s < symmetry; s++) {
      const angle = s * step;
      const nextAngle = (s + 1) * step;
      const midAngle = (s + 0.5) * step;

      const p1x = cx + Math.cos(angle) * innerRadius;
      const p1y = cy + Math.sin(angle) * innerRadius;

      const cpx = cx + Math.cos(midAngle) * (radius + 20);
      const cpy = cy + Math.sin(midAngle) * (radius + 20);

      const p2x = cx + Math.cos(nextAngle) * innerRadius;
      const p2y = cy + Math.sin(nextAngle) * innerRadius;

      svgPaths.push(`M ${p1x.toFixed(1)} ${p1y.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`);
      
      // Geometric diamond or teardrop
      if (r % 2 === 0) {
        const d1x = cx + Math.cos(angle) * (radius - 10);
        const d1y = cy + Math.sin(angle) * (radius - 10);
        svgPaths.push(`M ${cx} ${cy} L ${d1x.toFixed(1)} ${d1y.toFixed(1)}`);
      }
    }
  }

  return svgPaths.join(' ');
}
