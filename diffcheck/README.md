# Solidity Source Code Diff Tool

A TypeScript utility to compare Solidity source code from Etherscan verification responses.

## Overview

This tool takes two JSON files containing Etherscan contract verification results and provides a detailed comparison of the source code differences. It extracts individual `.sol` files from the verification data and presents a colorized diff output.

## Features

- 📊 **Comprehensive Analysis**: Categorizes files as added, removed, modified, or unchanged
- 🎨 **Colorized Output**: Easy-to-read terminal output with colors and emojis
- 📝 **Focused Diffs**: Shows only changed lines (additions/deletions) with minimal context
- 🧠 **Smart Diff Algorithm**: Uses Longest Common Subsequence (LCS) to ignore line number shifts
- 🎯 **Context Lines**: Shows 2 lines above and below changes for better understanding
- ⚪ **Whitespace Intelligence**: Treats files as unchanged if only whitespace differs
- 📋 **Summary Report**: Overview of all changes at a glance
- 🔍 **Smart Parsing**: Handles double-encoded JSON from Etherscan responses

## Prerequisites

- Node.js (v14 or higher)
- TypeScript and ts-node (installed automatically via npm)

## Installation

1. Navigate to the diffcheck directory:
   ```bash
   cd diffcheck
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Ensure you have `source1.json` and `source2.json` in the diffcheck directory
2. Run the comparison:
   ```bash
   npm run diff
   ```
   or
   ```bash
   npm start
   ```

## Input Format

The script expects JSON files in the Etherscan API response format:

```json
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "SourceCode": "{{\"language\":\"Solidity\",\"sources\":{\"ContractName.sol\":{\"content\":\"...\"}}}"
    }
  ]
}
```

## Output

The tool provides:

1. **Summary Statistics**: Count of added, removed, modified, and unchanged files
2. **Added Files**: List of files present only in source2
3. **Removed Files**: List of files present only in source1  
4. **Modified Files**: Detailed line-by-line diffs for changed files
5. **Unchanged Files**: List of files with identical content

### Example Output

```
📊 SOURCE CODE COMPARISON REPORT
=====================================

📋 SUMMARY:
✅ Added files: 2
❌ Removed files: 0
📝 Modified files: 3
⚪ Unchanged files: 15

📁 ADDED FILES:
+ contracts/NewFeature.sol
+ interfaces/INewInterface.sol

📝 MODIFIED FILES:

1. contracts/ExistingContract.sol
────────────────────────────────────
📊 Lines in source1: 150
📊 Lines in source2: 155

  43: import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
+ 44: import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
  45: import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
  ...
  65: using FullMath for uint256;
+ 66: using SafeERC20 for IERC20;
  67: 
  ...
```

## File Structure

```
diffcheck/
├── source1.json          # First source to compare
├── source2.json          # Second source to compare  
├── diff-sources.ts       # Main comparison script
├── package.json          # Dependencies and scripts
└── README.md             # This file
```

## Development

To modify or extend the script:

1. Edit `diff-sources.ts`
2. Build TypeScript:
   ```bash
   npm run build
   ```
3. Run directly with ts-node:
   ```bash
   npm run diff
   ```

## Customization

You can customize the diff behavior by modifying these parameters in the script:

- **Smart Diff Algorithm**: The script uses LCS to detect real changes vs line shifts
- **Context Lines**: Modify `contextLines` variable to show more/fewer lines around changes (default: 2)
- **Normalization**: Modify `normalizeContent()` to adjust whitespace handling
- **Color Scheme**: Customize colors by modifying the `colors` object
- **Focused Output**: Only shows changed lines with minimal context for clarity

## Troubleshooting

**Error: Invalid response format**
- Ensure your JSON files follow the expected Etherscan API format
- Check that the `SourceCode` field contains valid JSON

**Error: Cannot read file**
- Verify that `source1.json` and `source2.json` exist in the diffcheck directory
- Check file permissions

## License

MIT 


https://app.gmx.io/#/complete_account_transfer/0x2f88a09ed4174750a464576FE49E586F90A34820/0x1719039D794f9B8c4B2d3d7C3A54323418F7C463
https://api.etherscan.io/v2/api?chainid=42161&module=contract&action=getsourcecode&address=0xa121D6e494ce7505863AfBd5Ed865681476B4164&apikey=A53EESNMC3YNFSDZUD5EB82J6HCATJ5NAW