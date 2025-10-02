# Change Log

All notable changes to the "pixi-vn-ink-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for guidelines.

## [0.5.3] - 2025-10-02

### Fixed

- Fix syntax highlighting
- Fixed error checking in pixi-vn-ink

## [0.5.2] - 2025-09-24

### Changed

- Enhance ink syntax highlighting for tags and add multiline support

## [0.5.1] - 2025-09-23

### Added

- Input text support in the webview for interactive user responses.
- Loading indicator displayed in the preview while waiting for story initialization.
- Fetch characters automatically for `pixi-vn` engine from `http://localhost:[PORT]/pixi-vn/characters` after compilation.
- Character chips displayed **next to** dialogue text instead of above it.

### Changed

- `pixi-vn` engine now supports live fetching of characters and displays them in the preview.
- Dialogue layout updated to align character chip beside the text.

### Fixed

- When a file is modified, the preview is also updated.

## [0.5.0] - 2025-09-18

### Changed

- If the pixi-vn engine is used, the ink file will be compiled with pixi-vn-ink and not with inkjs

### Fixed

- Some syntax highlighting has been fixed

## [0.4.4] - 2025-09-15

### Added

- Auto-scroll down the webview dialog list
- Animations in the webview

## [0.4.3] - 2025-09-11

### Fixed

- Fix main file path resolution in runProject command and improve error handling

## [0.4.2] - 2025-09-09

### Added

- New command **Run Ink Project** (`ink.runProject`) with a button in the editor title bar  
  - Only visible when the `ink.mainFile` setting is configured  
  - Uses the ▶ icon and runs the project starting from the main file

### Changed

- Webview title now shows the current filename followed by `(Preview)` instead of the generic "Ink Preview"
- Add markup fetching in the openWebview function and send the markup to the webview

### Fixed

- Various fixes to the preview

## [0.4.1] - 2025-09-09

### Changed

- Improved README

## [0.4.0] - 2025-09-09

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
