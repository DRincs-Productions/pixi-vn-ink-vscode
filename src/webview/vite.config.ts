import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, "../../dist/webview"),
        emptyOutDir: true,
    },
});
