# Change Log

All notable changes to the "pixi-vn-ink-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for guidelines.

## [Unreleased]

### Added

- Full syntax highlighting for:
  - **Functions**:
    - Definition with `=== function functionName(parameters) ===`
    - Calls like `functionName()` are highlighted
  - **Conditional blocks**:
    - Multi-line blocks starting with `{` and ending with `}`
    - Highlighting for first-line conditions
    - Branches with `-` including `else`
    - Support for tilde logic, knots, glue, choices, and comments
  - **Multiline blocks**:
    - `{ stopping: ... }`, `{ shuffle: ... }`, `{ cycle: ... }`, `{ once: ... }`, `{ shuffle once: ... }`, `{ shuffle stopping: ... }`
    - Lines starting with `-` as normal text
    - Support for tilde logic, knots, glue, choices, and comments

## [0.2.1] - 2025-09-01

### Changed

- Improved error messages for Ink scripts
- Removed the separate icon theme for Ink files
- Fixed the extension icon display

## [0.2.0] - 2025-09-01

### Added

- Full syntax highlighting for:
  - Variable (`VAR`) and constant (`CONST`) declarations
  - Temporary variables (`temp`)
  - Knots and stitches with parameters
  - Conditional choices (`* { condition } [text] -> knot`)
  - Conditional text (`{ condition: valueIfTrue | valueIfFalse }`)
  - Printing variables (`{ variableName }`)
- Support for logic and arithmetic operators (`+ - * / % mod not == != < > <= >= ?`)
- Recognition of math functions (`POW`, `RANDOM`, `INT`, `FLOOR`, `FLOAT`)
- Highlighting for strings, numbers, and booleans
- Added operator `~` with logic parsing
- Integrated error checking with **inkjs**:
  - Errors and warnings are reported through VS Code diagnostics
- Custom file icon for `.ink` files

### Changed

- Improved syntax highlighting rules
- Merged `variableDeclarations` and `constantDeclarations` into a single system

## [0.1.0] - 2024-12-10

- Initial release
