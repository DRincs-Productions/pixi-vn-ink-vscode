# Change Log

All notable changes to the "pixi-vn-ink-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for guidelines.

## [0.2.0] - 2024-12-10

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

## [0.1.0] - 2025-08-01

- Initial release
