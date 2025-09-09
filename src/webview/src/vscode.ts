// Il tipo fornito da VSCode
interface VSCodeAPI {
    postMessage: (msg: object) => void;
    getState: () => object;
    setState: (newState: object) => void;
}

// VSCode inietta questa funzione globalmente
declare function acquireVsCodeApi(): VSCodeAPI;

export const vscode = acquireVsCodeApi();
