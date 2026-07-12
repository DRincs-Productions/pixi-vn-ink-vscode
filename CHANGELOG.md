# Change Log

All notable changes to the "pixi-vn-ink-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for guidelines.

## [0.5.10] - 2026-07-12

### Added

- "Run from here" CodeLens above every top-level knot (not stitches or functions, and not a knot whose header takes parameters) — opens the preview starting from that knot instead of the top of the file, via a `-> knot` divert prepended only for the preview and never written back to the source file.

## [0.5.9] - 2026-07-11

### Added

- Ctrl+Click (Go to Definition) on a knot/stitch reference — a divert (`-> knot`), thread (`<- knot`), tunnel call, divert target value, or a knot/stitch name inside `{ }` — jumps to where it's defined, searching every `.ink` file under `ink.rootFolder` (or the whole workspace if that setting is empty), not just the current file. If more than one knot/stitch shares the same name across files, all of them are offered instead of picking one arbitrarily.
- Autocompletion for knot/stitch names right after a divert (`->`) or thread (`<-`) arrow (including `->-> destination`), and for a specific knot's own stitches after typing `-> knot.`. When the accepted suggestion lives in a different file than the one being edited, an `INCLUDE` for that file is inserted automatically — this only happens for the `Inky` engine, since `pixi-vn` compiles each file independently and doesn't resolve `INCLUDE` at all.
- Ctrl+Click and autocompletion also cover labels — a labelled gather (`- (opts)`) or labelled choice (`* (shove) [...]`), addressable via `-> opts`, `{shove}`, `stitch.label`, or `knot.label`. Unlike knots/stitches, labels are only ever looked up in the current file, never across other project files.
- Ctrl+Click and autocompletion also cover `VAR`/`CONST`/`LIST` declarations, including a `LIST`'s individual items (e.g. `Adams` in `LIST DoctorsInSurgery = Adams, Bernard`), addressable bare or qualified as `DoctorsInSurgery.Adams` when two lists share an item name. Like labels, these are only ever looked up in the current file.
- Ctrl+Click and autocompletion also cover `~ temp` declarations (e.g. `~ temp chain = LIST_ALL(x)`). A `temp`'s value only exists within the knot/stitch it was declared in, so — unlike `VAR`/`CONST`/`LIST` — a same-named `temp` declared elsewhere is never offered.
- Syntax highlighting and a hover popup for the `ref` keyword in a knot/stitch/function's parameter list (e.g. `=== function move_to_supporter(ref item_state, new_supporter) ===`), explaining that it passes the parameter by reference so the callee can alter the caller's actual variable. Parameters themselves (`ref` or not) are now also covered by Ctrl+Click and autocompletion, scoped to the knot/stitch that declares them — same as a `~ temp`.

### Fixed

- A knot/label/variable reference inside a `{ }` block whose opening brace sits alone on its own line (e.g. a `{` followed on the next line by `bedroomLightState ? seen:`) is now correctly recognized as being inside `{ }` for Ctrl+Click and hover purposes — previously only the current line's own braces were counted, so anything after the first line of such a block silently stopped being clickable.
- Ctrl+Click on a knot/stitch/label/variable/INCLUDE reference now only underlines the exact word (e.g. just `compare_prints` and `top` in `<- compare_prints(-> top)`) instead of the whole line — ink's `language-configuration.json` intentionally sets a very permissive `wordPattern` for double-click word selection, but that same pattern was also being used as the Ctrl+hover underline range.

## [0.5.8] - 2026-07-11

### Added

- Localization of hover documentation and UI messages into German, Spanish, French, Italian, Japanese, Korean, Russian, and Chinese (Simplified), alongside the existing English strings.

## [0.5.7] - 2026-07-09

### Added

- Hover documentation for ink's built-in "game query" functions: `CHOICE_COUNT()`, `TURNS()`, `TURNS_SINCE()`, `SEED_RANDOM()`, `RANDOM()`, `INT()`, `FLOOR()`, `FLOAT()`, `POW()`, `LIST_VALUE()`, `LIST_COUNT()`, `LIST_MIN()`, `LIST_MAX()`, `LIST_RANDOM()`, `LIST_ALL()`, `LIST_RANGE()`, and `LIST_INVERT()`. Hovering over a call to one of these functions (e.g. `~ SEED_RANDOM(235)` or `{RANDOM(1, 6)}`) shows a short description and an example, taken from the [official ink documentation](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md).
- New example `examples/game_queries_and_functions.ink` showing all of the above functions in use.
- When the `pixi-vn` engine is selected, calls to `CHOICE_COUNT()`, `TURNS()`, `TURNS_SINCE()`, `SEED_RANDOM()`, `LIST_RANDOM()`, `LIST_COUNT()`, `LIST_INVERT()`, `LIST_ALL()`, `LIST_RANGE()`, `LIST_MIN()`, `LIST_MAX()`, and `LIST_VALUE()` are now underlined with a yellow warning (like any other diagnostic), explaining that the function isn't implemented by `pixi-vn` yet, with a link to request it. Switching the `ink.engine` setting updates the warnings immediately on all open files. The hover popup for these functions is unaffected by the engine setting.
- Hover documentation for the `VAR`, `CONST`, and `LIST` declaration keywords (only when hovering the keyword itself, at the start of the declaration line).
- Hover documentation for the logic `~` (e.g. `~ x = 1`), distinct from the existing shuffle `~` type-specifier popup shown inside `{ }` alternatives.
- Hover documentation for the choice brackets `[` `]` (e.g. `* Hello [back!] right back to you!`), explaining how they split an option's text into choice-only, output-only, and shared parts. Only shown inside choice lines (`*`/`+`).
- New examples: `examples/sticky_and_fallback_choices.ink`, `examples/alternatives.ink`, `examples/basic_lists.ink`, `examples/multivalued_lists.ink`, `examples/nicer_list_printing.ink`, `examples/full_list.ink`, `examples/tower_of_hanoi.ink`, `examples/advanced_list_operations.ink`, and `examples/multi_list_lists.ink`, covering topics from the official ink documentation not previously represented in the `examples/` folder.
- Hover documentation for the `-` that introduces a branch of a `{ }` conditional or switch block (e.g. `{ - x > 0:`, or `- else:` inside a multi-clause block), distinct from the weave Gather popup.
- Hover documentation for the thread `<-` (e.g. `<- conversation`), explaining how it weaves in another knot/stitch's content and choices without leaving the current flow, unlike a divert. Hovering the knot/stitch name right after `<-` (including the stitch half of a dotted `<- knot.stitch`) now also shows its knot-comment popup, matching how `->` already behaves.
- Hover documentation for the word-form type keywords of a multiline alternatives block — `stopping`, `cycle`, `once`, `shuffle`, `shuffle once`, and `shuffle stopping` (e.g. `{ shuffle once: - The sun was hot. - It was a hot day. }`) — the written-out equivalents of the `~`/`&`/`!` shorthand symbols. Only shown when the word is the type keyword right after the block's opening `{`, not when it coincidentally appears elsewhere as narrative text.

### Changed

- Expanded the `-> END`, `-> DONE`, `->` (divert), `<>` (glue), `*` (choice), `+` (sticky choice), and `-` (gather) hover popups with fuller explanations and runnable examples, matching the level of detail already used for the other hover popups.
- The `->` hover popup now depends on how the arrow is actually used, instead of always showing the plain "Divert" explanation: a tunnel call (`-> knot ->`), the return point of that same call, tunnel-onward (`-> knot -> next`), a tunnel return (`->->`), a tunnel return to a different destination (`->-> destination`, e.g. `->-> youre_dead`), and a divert target used as a value (a function/knot argument, e.g. `FunctionA(-> deskstate)`, or the right-hand side of `VAR x = -> knot`) each get their own explanation and example.

### Fixed

- The `-` that introduces a branch of a `{ }` conditional or switch block (e.g. `- else:`, `- 0: zero`) no longer shows the unrelated "Gather" hover popup, and no longer shows nothing at all when written right after the opening brace (e.g. `{ - x > 0:`).
- Markdown-style italic/bold decoration (`ink.markup: "Markdown"`) no longer misfires on snake*case identifiers containing an underscore (e.g. two `visit_paris` on the same line no longer italicizes everything in between); a single `*` is only treated as emphasis when it isn't sandwiched between two word characters, matching CommonMark's rule for intraword underscores.
- Choice brackets `[` `]` are now coloured even when the choice has a label before them (e.g. `*\t(rock) [Throw rock at guard] -> throw`) — previously the label caused the rest of the line, including the brackets, to be left uncoloured. The label itself is now also coloured with the same scope as a regular choice bullet instead of a gather.
- An escaped divert/thread arrow (`\->`, `\<-`) is no longer coloured or treated as a real divert/thread — it's literal text, so it no longer shows the Divert/END/DONE hover popup or the knot-comment popup for the word after it.
- Code folding no longer reveals a divert that's only the action of one specific choice (e.g. `-> fight_guard` nested under `*\t(get_out) [Shove him aside]`) as if it were the whole knot's exit point — it's now only kept visible when it sits at the same indentation as its own paragraph, matching a statement every path through the knot could actually reach.
- Folding a knot/stitch with no such exit divert now collapses its _entire_ body instead of only its first paragraph — previously, any paragraphs after the first stayed fully expanded even when collapsed. A trailing `/** ... */` comment that documents the _next_ knot is still left visible rather than folded away with the previous one.
- Folding a `function` no longer reveals a trailing `-> DONE` or `-> END` as if it were the function's exit point — those don't describe how a function actually returns (that's what `~ return` is for), so they're now folded away with the rest of the body, all the way to the next knot/stitch/function. A function diverting to a knot/stitch still gets that divert revealed, same as a knot would.
- Hovering the stitch half of a dotted divert target (e.g. `in_first_class` in `-> the_orient_express.in_first_class`) now shows its knot-comment popup — previously only hovering the knot half (`the_orient_express`) worked.
- A divert or thread written inside conditional text (e.g. `{ x: <- seen_light }` or `{ x: -> knot }`) is now coloured and gets its hover popup like anywhere else — previously it was left as plain, unrecognized text because that context's grammar rule didn't include the divert/thread patterns at all.
- A multiline `{ stopping: ... }` / `{ cycle: ... }` / `{ once: ... }` / `{ shuffle: ... }` block whose closing `}` is indented on its own line (the common style) no longer leaves the block "stuck open" — previously the closing brace was swallowed as plain text instead of ending the block, miscolouring every line after it (e.g. splitting a following `-> knot` divert into a stray `-` and `>`) until something else happened to reset the parser. A nested type-keyword block (e.g. a `{cycle: ...}` inside one bullet of a `{stopping: ...}`) is now also recognized as its own block, so its closing `}` doesn't get mistaken for its parent's.

## [0.5.6] - 2026-07-07

### Added

- **pixi-vn engine only**: matched `[` and `]` pairs in normal narrative text are now coloured using the same keyword colour as choice brackets. Only properly paired brackets are highlighted (innermost pairs resolved first); escaped brackets (`\[`, `\]`) and unmatched brackets are left uncoloured. Coloring is applied instantly when the `ink.engine` setting is switched to or from `pixi-vn`.
- Code folding for knots, stitches, and functions (any header starting with one or more `=`). Folding a header collapses its body down to a single line; if the body ends with a top-level divert (e.g. `-> DONE`, `-> END`, `-> some_knot`), that divert stays visible after the header even when collapsed, similar to seeing a function's return statement while its body is folded.

### Fixed

- Square bracket syntax highlighting now only applies inside choices (lines starting with `*` or `+`)
- An unclosed `[` on a choice line is still highlighted to indicate an error
- Escaped brackets `\[` and `\]` are no longer highlighted

### Changed

- Update pixi-vn-ink

## [0.5.5] - 2025-11-05

### Changed

- Update pixi-vn-ink

## [0.5.4] - 2025-10-15

### Changed

- Webview improvements
- Update pixi-vn-ink

### Fixed

- Fix syntax highlighting for tags

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
    - Triggered automatically after typing `INCLUDE` or with Ctrl+Space.
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
