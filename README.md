# *ink* Language - Visual Studio Code Extension

A Visual Studio Code extension for the ***ink*** scripting language, used in interactive narrative games (e.g. *80 Days*, *Heaven's Vault*).  
This extension provides **syntax highlighting**, support for **variables, constants, lists, logic, conditional choices**, **INCLUDE statements**, **tags**, **interactive narrative preview**, and built-in **error checking**, making it easier to write and maintain *ink* scripts.

---

## ✨ Features

- **Full syntax highlighting**:
  - Variable (`VAR`), constant (`CONST`) and list (`LIST`) declarations
  - Temporary variables (`temp`)
  - Knots, functions, stitches, and parameters
  - Logical expressions with operators (`+ - * / % not == != < > <= >=` etc.)
  - Math functions (`POW`, `RANDOM`, `INT`, `FLOOR`, `FLOAT`)
  - Strings, numbers, and booleans
  - Choices and conditional choices
  - Printing variables and conditional text inside `{ }`
  - Conditional blocks and Multiline blocks
  - Strings with interpolation
  - Gathers
  - Tunnels
  - INCLUDE statements
  - Tags starting with `#`

- **Interactive Ink Preview** (To open the preview press <img width="17" height="16" alt="image" src="https://github.com/user-attachments/assets/68bfb6c5-aa5c-4d9a-b30d-e68593db275c" />):
  - Opened via **editor title button** or command palette
  - Displays story dialogues in a **VSCode-themed webview**
  - Supports **choices**, **text input**, **Back** and **Restart**
  - Dialogues and choices optionally rendered with **Markdown**
  - Tags (`#`) are aligned to the right and styled differently
  - Preview **updates live** when the file is saved
  - Fully respects **dark/light theme** of VSCode

- **Integrated error checking**:
  - Real-time analysis powered by [inkjs](https://github.com/y-lohse/inkjs)
  - Syntax and logic errors reported directly in the editor
  - Support for warnings and errors
  - INCLUDE statement validation with file existence checks

- **Autocompletion**:
  - Suggestions for INCLUDE statements with folder navigation

- **Ctrl+Click support**:
  - Navigate to included files by Ctrl+Clicking on INCLUDE statements

---

## 📂 Supported structures

- `.ink` files
- Highlighting for:
  - **Knots and stitches with parameters**
  - **Functions** (`=== function myFunc(x) ===`)
  - **Function calls** (`myFunc()`)
  - **Conditional choices** (`* { condition } [text] -> knot`)
  - **Conditional text** (`{ condition: valueIfTrue | valueIfFalse }`)
  - **Multiline blocks** (`{ stopping: ... }`, `{ shuffle: ... }`, `{ cycle: ... }`, `{ once: ... }`, `{ shuffle once: ... }`, `{ shuffle stopping: ... }`)
  - **Printing variables** (`{ variableName }`)
  - **Logic and arithmetic operators**
  - **Variable, constant and list declarations**
  - **Tilde logic (`~`) inside blocks**
  - **Strings with interpolation**
  - **Gathers** (`- (label)`)
  - **INCLUDE statements** with real-time validation, Ctrl+Click, and suggestions
  - **Tags** starting with `#`
- **Preview support**:
  - Interactive dialogues with choices and input
  - Tags aligned to the right
  - Markdown rendering if enabled
  - Back and Restart functionality

---

## 🚀 Roadmap

Planned for future releases:

- Add hover pop-ups above knots, functions, and variables
- Enable CTRL+Click functionality for knots, functions, and variables
- Allow folding/collapsing of knots and functions
- Add a counter for knots and word count
- Add a flag to enable syntax highlighting for Markdown
- Add a flag to enable syntax highlighting for Pixi'VN

---

## 📦 Installation

1. Open **Extensions** in VS Code (`Ctrl+Shift+X`)
2. Search for `pixi-vn-ink-vscode`
3. Install and open a `.ink` file to activate the syntax

---

## 🤝 Contributing

Contributions are welcome!  
Please open an **issue** or **pull request** on [GitHub](https://github.com/DRincs-Productions/pixi-vn-ink-vscode).

---

## 📜 License

Released under the MIT License.
