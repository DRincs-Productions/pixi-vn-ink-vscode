import { Game } from "@drincs/pixi-vn";
import { addBaseHashtagCommands } from "@drincs/pixi-vn-ink";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
Game.init();
// Registers pixi-vn-ink's built-in hashtag-command operations (request input, pause, continue,
// show/edit/remove, ...) — without this, tags like `# request input ...` fail their internal
// validation and silently do nothing, so the preview never actually pauses for player input.
addBaseHashtagCommands();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
