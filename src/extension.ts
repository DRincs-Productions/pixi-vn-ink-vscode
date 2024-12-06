'use strict';
/* Ink for VS Code Extension Main File */

import { DocumentFilter, ExtensionContext, ProgressLocation, languages, window } from "vscode";
import { DivertCompletionProvider } from "./completion";
import { InkDefinitionProvider } from "./definitions";
import * as NodeMap from "./nodemap";
import { WordAndNodeCounter, WordNodeCounterController } from "./wordcount";

const INK: DocumentFilter = { language: 'ink' };

export function activate(ctx: ExtensionContext) {

    // Create a new word counter.
    const wordCounter = new WordAndNodeCounter();
    const wcController = new WordNodeCounterController(wordCounter);
    const nodeMapController = new NodeMap.NodeController();

    // Start generating a node map.
    window.withProgress({ location: ProgressLocation.Window, title: "Mapping knots and stitches..." }, NodeMap.generateMaps);

    // Add to a list of disposables which are disposed when this extension is
    // deactivated again.
    ctx.subscriptions.push(wcController);
    ctx.subscriptions.push(wordCounter);
    ctx.subscriptions.push(nodeMapController);

    // Enable the completion provider.
    ctx.subscriptions.push(languages.registerCompletionItemProvider(INK, new DivertCompletionProvider(), '>', '-', ' '));

    // Enable the definition provider.
    ctx.subscriptions.push(languages.registerDefinitionProvider(INK, new InkDefinitionProvider()));
}