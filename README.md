# *ink* Language - Visual Studio Code Extension

A Visual Studio Code extension for the ***ink*** scripting language, used in interactive narrative games (e.g. *80 Days*, *Heaven's Vault*).  
This extension provides **syntax highlighting**, support for **variables, constants, lists, logic, conditional choices**, **INCLUDE statements**, **tags**, **interactive narrative preview**, and built-in **error checking**, making it easier to write and maintain *ink* scripts.

![image](https://github.com/user-attachments/assets/cc17384a-7f2f-4e86-b99a-efbf823269d9)

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

- **Interactive Story Preview**:
  - Opened via <img width="17" height="16" alt="image" src="https://github.com/user-attachments/assets/68bfb6c5-aa5c-4d9a-b30d-e68593db275c" /> **button**
  - Opened the main file via <img width="21" height="20" alt="image" src="https://github.com/user-attachments/assets/1e4c6f9c-2a82-4723-85e0-0b1008f4e710" /> **button** (Is visible only if `ink.mainFile` is set)
  - Displays story dialogues in a **VSCode-themed webview**
  - Supports **choices**, **text input** (for pixi-vn engine), **Back** and **Restart**
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

## ⚙️ Settings

This extension provides the following configurable settings in VS Code (go to `File > Preferences > Settings` and search for `ink`):

### Main file

- **Setting name**: `ink.mainFile`
- **Description**: Specify the main **ink** file of the project. This is used as the entry point for diagnostics and execution.
- **Options**: Path to the main `.ink` file, relative to the workspace root. Leave empty to use the currently opened file.
- **Effect**: Sets the main file for diagnostics and execution.

### Root folder

- **Setting name**: `ink.rootFolder`
- **Description**: Specify the root folder for resolving `INCLUDE` paths. If set, all `INCLUDE` paths will be resolved relative to this folder.
- **Options**: Path to the root folder, relative to the workspace root. Leave empty to use the workspace root.
- **Effect**: Changes how `INCLUDE` paths are resolved and affects autocompletion and Ctrl+Click functionality.

### Engine

- **Setting name**: `ink.engine`
- **Description**: Select the engine used for developing the **ink** project.
- **Options**:
  - `Inky` (default)
  - [`pixi-vn`](https://github.com/DRincs-Productions/pixi-vn)
- **Effect**: Determines which diagnostic and script features are enabled based on the selected engine.

### Markup

- **Setting name**: `ink.markup`
- **Description**: Select the markup format for the project.
- **Options**:
  - `Markdown`
  - `null` (default)
- **Effect**: Enables syntax support and highlighting for the selected markup.

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
