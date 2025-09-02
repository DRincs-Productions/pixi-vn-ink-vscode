# *ink* - VS Code Extension

A Visual Studio Code extension for the ***ink*** scripting language, used in interactive narrative games (e.g. *80 Days*, *Heaven's Vault*).  
This extension provides **syntax highlighting**, support for **variables, logic, conditional choices**, and built-in **error checking**, making it easier to write and maintain *ink* scripts.

---

## ✨ Features

- **Full syntax highlighting**:
  - Variable (`VAR`) and constant (`CONST`) declarations
  - Temporary variables (`temp`)
  - Knots, stitches, and parameters
  - Logical expressions with operators (`+ - * / % not == != < > <= >=`)
  - Math functions (`POW`, `RANDOM`, `INT`, `FLOOR`, `FLOAT`)
  - Strings, numbers, and booleans
  - Choices and conditional choices
  - Printing variables and conditional text inside `{ }`
  - Conditional blocks and Multiline blocks

- **Integrated error checking**:
  - Real-time analysis powered by [inkjs](https://github.com/y-lohse/inkjs)
  - Syntax and logic errors reported directly in the editor
  - Support for warnings and errors

---

## 📂 Supported structures

- `.ink` files
- Highlighting for:
  - **Knots and stitches with parameters**
  - **Conditional choices** (`* { condition } [text] -> knot`)
  - **Conditional text** (`{ condition: valueIfTrue | valueIfFalse }`)
  - **Multiline blocks** (`{ stopping: ... }`, `{ shuffle: ... }`, `{ cycle: ... }`, `{ once: ... }`, `{ shuffle once: ... }`, `{ shuffle stopping: ... }`)
  - **Printing variables** (`{ variableName }`)
  - **Logic and arithmetic operators**
  - **Variable and constant declarations**
  - **Tilde logic (`~`) inside blocks**

---

## 🚀 Roadmap

Planned for future releases:

- Complete the syntax highlighting for all Ink constructs
- Add hover pop-ups above knots, functions, and variables
- Enable CTRL+Click functionality for knots, functions, and variables
- Allow folding/collapsing of knots and functions
- Add the ability to import Ink files
- Add a preview panel similar to Inky
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
