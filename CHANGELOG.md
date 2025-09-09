# Change Log

All notable changes to the "pixi-vn-ink-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for guidelines.

## [0.3.2] - 2025-09-09

### Added

- **Interactive Ink Preview**:
  - Opened from editor title button or command palette
  - Displays dialogues, choices, tags, and text input
  - Markdown rendering optional for dialogues and choices
  - Tags (`#`) aligned to right with different color
  - **Back** button to return to previous choice point
  - **Restart** button to reset the story
  - Fully respects VSCode dark/light themes
  - Live update on file save
- Webview uses VSCode colors for buttons, inputs, backgrounds, and borders
- `NarrationView.tsx` implemented as dedicated component for story rendering
- Input text support for interactive user responses
- Highlighting of tags and choices in Markdown when markup enabled

### Fixed

- Correct handling of choices and tags in the webview
- Webview updates properly after story recompilation
- Back button now returns to last choice, not just last dialogue
- Button hover and pointer style fixed for webview buttons

## [0.3.1] - 2025-09-07

### Added

- **INCLUDE statements improvements**:
  - Real-time checking if included files exist and are `.ink`.
  - Support for `rootFolder` setting: all `INCLUDE` paths are resolved relative to the root folder if defined.
  - Ctrl+Click support: clicking an `INCLUDE` path opens the target file.
  - Autocomplete suggestions while typing `INCLUDE` paths:
    - Triggered automatically after typing `INCLUDE ` or with Ctrl+Space.
    - Navigates into folders recursively.
    - Supports files and folders with spaces in names.
    - Suggestions respect `rootFolder` and subfolders.
- Added `loadInkFileContent`, `loadInkFiles` and `loadInkFolder` functions supporting `rootFolder`.

### Fixed

- INCLUDE paths with spaces are now treated as a single clickable element for Ctrl+Click.
- Correct suggestion range and filtering for folders and files inside INCLUDE paths.
- Fixed issues where selecting a folder did not display the contents for further navigation.

## [0.3.0] - 2025-09-03

### Added

- Syntax highlighting for **LIST declarations**:
  - `LIST MyList = A, B, C`
  - `LIST` keyword highlighted as `storage.type.ink`
  - List variable names highlighted as `variable.other.list.ink`
- Syntax highlighting for **labelled gathers and choices**:
  - `- (label)` for gathers
  - `* (label)` / `+ (label)` for choices
  - Labels inside parentheses are highlighted as `entity.name.function`
- Support for **thread operator `<-`** with dedicated syntax highlighting.
- New scope for thread function calls: `entity.name.function.thread.ink`.
- Syntax highlighting for **INCLUDE statements**:
  - `INCLUDE` keyword highlighted as `keyword.control.include.ink`
  - Imported file paths highlighted as `string.unquoted.filename.ink`
- Syntax highlighting for **tags**:
  - Lines starting with `#` or inline after text
  - Entire tag (`#` + content) highlighted with same color `keyword.other.tag.ink`

### Fixed

- **Knot declarations** (`=== knotName ===`) and  
  **Function declarations** (`=== function myFunc() ===`)  
  are now correctly highlighted even if preceded by spaces or tabs.

## [0.2.3] - 2025-09-02

### Added

- New configuration settings:
  - `ink.engine` to select the engine (`Inky` or `pixi-vn`).
  - `ink.markup` to enable optional markup highlighting (`Markdown` or `null`).
- Diagnostics now adapt to the selected engine.

## [0.2.2] - 2025-09-02

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
