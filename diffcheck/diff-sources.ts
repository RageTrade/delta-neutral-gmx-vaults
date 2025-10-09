import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
} as const;

interface SourceFile {
  content: string;
}

interface ContractSources {
  language: string;
  sources: Record<string, SourceFile>;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: Array<{
    SourceCode: string;
  }>;
}

function colorize(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function parseSourceCode(sourceCodeStr: string): ContractSources {
  // Remove the outer braces and parse the JSON
  const cleanedStr = sourceCodeStr.startsWith('{{') ? sourceCodeStr.slice(1, -1) : sourceCodeStr;
  return JSON.parse(cleanedStr);
}

function readAndParseFile(filePath: string): ContractSources {
  const data = fs.readFileSync(filePath, 'utf8');
  const response: EtherscanResponse = JSON.parse(data);
  
  if (response.status !== "1" || !response.result || response.result.length === 0) {
    throw new Error(`Invalid response format in ${filePath}`);
  }
  
  return parseSourceCode(response.result[0].SourceCode);
}

function generateLineDiff(content1: string, content2: string): string[] {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  const diff: string[] = [];
  
  const maxLines = Math.max(lines1.length, lines2.length);
  
  // Simple line-by-line comparison
  let i = 0, j = 0;
  
  while (i < lines1.length || j < lines2.length) {
    const line1 = i < lines1.length ? lines1[i] : undefined;
    const line2 = j < lines2.length ? lines2[j] : undefined;
    
    if (line1 === undefined) {
      // Added line
      diff.push(colorize('green', `+ ${j + 1}: ${line2}`));
      j++;
    } else if (line2 === undefined) {
      // Removed line
      diff.push(colorize('red', `- ${i + 1}: ${line1}`));
      i++;
    } else if (line1 === line2) {
      // Unchanged line (show context for a few lines around changes)
      diff.push(colorize('white', `  ${i + 1}: ${line1}`));
      i++;
      j++;
    } else {
      // Modified line
      diff.push(colorize('red', `- ${i + 1}: ${line1}`));
      diff.push(colorize('green', `+ ${j + 1}: ${line2}`));
      i++;
      j++;
    }
  }
  
  return diff;
}

function normalizeContent(content: string): string {
  // Remove trailing whitespace from each line and normalize line endings
  return content.split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Normalize multiple empty lines to double newline
    .trim();
}

function generateSmartDiff(content1: string, content2: string): string[] {
  // First check if the normalized content is the same
  const normalized1 = normalizeContent(content1);
  const normalized2 = normalizeContent(content2);
  
  if (normalized1 === normalized2) {
    return [colorize('cyan', '📝 Files are functionally identical (only whitespace/formatting differences)')];
  }
  
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  
  // Use a more sophisticated LCS-like algorithm to find actual changes
  const lcs = findLongestCommonSubsequence(lines1, lines2);
  
  // First pass: identify all change regions
  const changeRegions: Array<{start1: number, end1: number, start2: number, end2: number}> = [];
  let i = 0, j = 0, lcsIndex = 0;
  
  while (i < lines1.length || j < lines2.length) {
    if (lcsIndex >= lcs.length) {
      // Remaining lines are all changes
      if (i < lines1.length || j < lines2.length) {
        changeRegions.push({
          start1: i,
          end1: lines1.length - 1,
          start2: j,
          end2: lines2.length - 1
        });
      }
      break;
    }
    
    const [lcsI, lcsJ] = lcs[lcsIndex];
    
    // If there are changes before the next common line
    if (i < lcsI || j < lcsJ) {
      changeRegions.push({
        start1: i,
        end1: lcsI - 1,
        start2: j,
        end2: lcsJ - 1
      });
    }
    
    // Move to the common line
    i = lcsI + 1;
    j = lcsJ + 1;
    lcsIndex++;
  }
  
  if (changeRegions.length === 0) {
    return [colorize('cyan', '📝 Files have identical content')];
  }
  
  // Second pass: generate diff with context
  const diff: string[] = [];
  const contextLines = 2; // Show 2 lines above and below changes
  
  for (let regionIndex = 0; regionIndex < changeRegions.length; regionIndex++) {
    const region = changeRegions[regionIndex];
    
    // Add separator between regions (except for the first one)
    if (regionIndex > 0) {
      diff.push(colorize('cyan', '  ...'));
    }
    
    // Calculate context bounds
    const contextStart1 = Math.max(0, region.start1 - contextLines);
    const contextEnd1 = Math.min(lines1.length - 1, region.end1 + contextLines);
    const contextStart2 = Math.max(0, region.start2 - contextLines);
    const contextEnd2 = Math.min(lines2.length - 1, region.end2 + contextLines);
    
    // Show context before changes
    for (let k = contextStart1; k < region.start1; k++) {
      if (k < lines1.length) {
        diff.push(colorize('white', `  ${k + 1}: ${lines1[k]}`));
      }
    }
    
    // Show deletions
    for (let k = region.start1; k <= region.end1; k++) {
      if (k < lines1.length) {
        diff.push(colorize('red', `- ${k + 1}: ${lines1[k]}`));
      }
    }
    
    // Show additions  
    for (let k = region.start2; k <= region.end2; k++) {
      if (k < lines2.length) {
        diff.push(colorize('green', `+ ${k + 1}: ${lines2[k]}`));
      }
    }
    
    // Show context after changes
    for (let k = Math.max(region.end1 + 1, region.start1); k <= contextEnd1; k++) {
      if (k < lines1.length) {
        diff.push(colorize('white', `  ${k + 1}: ${lines1[k]}`));
      }
    }
  }
  
  return diff;
}

function findLongestCommonSubsequence(lines1: string[], lines2: string[]): [number, number][] {
  const m = lines1.length;
  const n = lines2.length;
  
  // Create DP table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (lines1[i - 1] === lines2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find the LCS
  const lcs: [number, number][] = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (lines1[i - 1] === lines2[j - 1]) {
      lcs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

function compareFiles(sources1: ContractSources, sources2: ContractSources) {
  const allFiles = new Set([
    ...Object.keys(sources1.sources),
    ...Object.keys(sources2.sources)
  ]);
  
  const results = {
    added: [] as string[],
    removed: [] as string[],
    modified: [] as string[],
    unchanged: [] as string[]
  };
  
  console.log(colorize('bright', '📊 SOURCE CODE COMPARISON REPORT'));
  console.log(colorize('bright', '=====================================\n'));
  
  for (const fileName of Array.from(allFiles).sort()) {
    const file1 = sources1.sources[fileName];
    const file2 = sources2.sources[fileName];
    
    if (!file1) {
      results.added.push(fileName);
    } else if (!file2) {
      results.removed.push(fileName);
    } else if (file1.content === file2.content) {
      results.unchanged.push(fileName);
    } else {
      // Check if files are functionally identical (ignoring whitespace)
      const normalized1 = normalizeContent(file1.content);
      const normalized2 = normalizeContent(file2.content);
      
      if (normalized1 === normalized2) {
        results.unchanged.push(fileName);
      } else {
        results.modified.push(fileName);
      }
    }
  }
  
  // Print summary
  console.log(colorize('bright', '📋 SUMMARY:'));
  console.log(colorize('green', `✅ Added files: ${results.added.length}`));
  console.log(colorize('red', `❌ Removed files: ${results.removed.length}`));
  console.log(colorize('yellow', `📝 Modified files: ${results.modified.length}`));
  console.log(colorize('white', `⚪ Unchanged files: ${results.unchanged.length}`));
  console.log('');
  
  // Show added files
  if (results.added.length > 0) {
    console.log(colorize('bright', colorize('green', '📁 ADDED FILES:')));
    results.added.forEach(file => {
      console.log(colorize('green', `+ ${file}`));
    });
    console.log('');
  }
  
  // Show removed files
  if (results.removed.length > 0) {
    console.log(colorize('bright', colorize('red', '🗑️  REMOVED FILES:')));
    results.removed.forEach(file => {
      console.log(colorize('red', `- ${file}`));
    });
    console.log('');
  }
  
  // Show modified files with diffs
  if (results.modified.length > 0) {
    console.log(colorize('bright', colorize('yellow', '📝 MODIFIED FILES:')));
    console.log('');
    
    results.modified.forEach((fileName, index) => {
      console.log(colorize('bright', `${index + 1}. ${fileName}`));
      console.log(colorize('bright', '─'.repeat(fileName.length + 4)));
      
      const content1 = sources1.sources[fileName].content;
      const content2 = sources2.sources[fileName].content;
      
      console.log(colorize('cyan', `📊 Lines in source1: ${content1.split('\n').length}`));
      console.log(colorize('cyan', `📊 Lines in source2: ${content2.split('\n').length}`));
      console.log('');
      
      const diff = generateSmartDiff(content1, content2);
      
      // Show complete diff (no truncation)
      diff.forEach((line: string) => console.log(line));
      
      console.log('');
      console.log(colorize('magenta', '═'.repeat(80)));
      console.log('');
    });
  }
  
  // Show unchanged files (just list)
  if (results.unchanged.length > 0) {
    console.log(colorize('bright', colorize('white', '⚪ UNCHANGED FILES:')));
    results.unchanged.forEach(file => {
      console.log(colorize('white', `= ${file}`));
    });
    console.log('');
  }
  
  return results;
}

function main() {
  try {
    const source1Path = path.join(__dirname, 'source1.json');
    const source2Path = path.join(__dirname, 'source2.json');
    
    console.log(colorize('bright', colorize('blue', '🔍 Reading source files...')));
    console.log(`📁 Source 1: ${source1Path}`);
    console.log(`📁 Source 2: ${source2Path}`);
    console.log('');
    
    const sources1 = readAndParseFile(source1Path);
    const sources2 = readAndParseFile(source2Path);
    
    console.log(colorize('cyan', `📋 Source 1 contains ${Object.keys(sources1.sources).length} files`));
    console.log(colorize('cyan', `📋 Source 2 contains ${Object.keys(sources2.sources).length} files`));
    console.log('');
    
    const results = compareFiles(sources1, sources2);
    
    console.log(colorize('bright', colorize('green', '✅ Comparison completed!')));
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(colorize('red', '❌ Error:'), message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 