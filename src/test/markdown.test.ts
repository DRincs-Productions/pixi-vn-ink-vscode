import * as assert from "assert";

import { findMarkdownTokenRanges } from "../markdown";

suite("Markdown token parsing", () => {
    test("finds italic and bold ranges without hiding the markers", () => {
        const ranges = findMarkdownTokenRanges("Hello, this is some *italic* text and this is some **bold** text.");

        assert.deepStrictEqual(ranges.italic, [{ start: 21, end: 27 }]);
        assert.deepStrictEqual(ranges.bold, [{ start: 53, end: 57 }]);
    });

    test("ignores escaped markdown markers", () => {
        const ranges = findMarkdownTokenRanges(String.raw`Escaped \*italic\* and \**bold\** markers.`);

        assert.deepStrictEqual(ranges.italic, []);
        assert.deepStrictEqual(ranges.bold, []);
    });

    test("finds visible newline escape sequences", () => {
        const ranges = findMarkdownTokenRanges(String.raw`Hello,\n\nworld`);

        assert.deepStrictEqual(ranges.newlines, [
            { start: 6, end: 8 },
            { start: 8, end: 10 },
        ]);
    });

    test("does not treat bold markers as italic markers", () => {
        const ranges = findMarkdownTokenRanges("This is **bold** only.");

        assert.deepStrictEqual(ranges.italic, []);
        assert.deepStrictEqual(ranges.bold, [{ start: 10, end: 14 }]);
    });
});
