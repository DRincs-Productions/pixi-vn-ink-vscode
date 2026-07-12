import * as assert from "assert";

import { findMarkdownTokenRanges } from "../markdown";

suite("Markdown token parsing", () => {
    test("finds italic and bold ranges without hiding the markers", () => {
        const ranges = findMarkdownTokenRanges("Hello, this is some *italic* text and this is some **bold** text.");

        assert.deepStrictEqual(ranges.italic, [{ start: 21, end: 27 }]);
        assert.deepStrictEqual(ranges.bold, [{ start: 53, end: 57 }]);
    });

    test("recognizes escaped asterisk markers the same as bare ones", () => {
        // Escaping `*` in ink has no effect on the output (it isn't a special character
        // there), so `\*italic\*` and `\**bold\**` are just as much emphasis as `*italic*`.
        const ranges = findMarkdownTokenRanges(String.raw`Escaped \*italic\* and \**bold\** markers.`);

        assert.deepStrictEqual(ranges.italic, [{ start: 10, end: 16 }]);
        assert.deepStrictEqual(ranges.bold, [{ start: 26, end: 30 }]);
    });

    test("finds visible newline escape sequences", () => {
        // In ink, `\n` alone collapses to a bare `n` (the backslash is consumed by the
        // escape). Only `\\n` — an escaped backslash followed by `n` — survives as the
        // literal two-character `\n` marker the pixi-vn markdown renderer looks for. The
        // range covers the whole `\\n` (both backslashes and the `n`), not just the last
        // backslash.
        const ranges = findMarkdownTokenRanges(String.raw`Hello,\\n\\nworld`);

        assert.deepStrictEqual(ranges.newlines, [
            { start: 6, end: 9 },
            { start: 9, end: 12 },
        ]);
    });

    test("does not treat a lone backslash-n as a visible newline marker", () => {
        // A single backslash before `n` is just an (unnecessary) escape of a non-special
        // character — ink strips it, leaving bare `n` with no visible marker at all.
        const ranges = findMarkdownTokenRanges(String.raw`Hello,\n\nworld`);

        assert.deepStrictEqual(ranges.newlines, []);
    });

    test("treats escaped asterisks the same as bare ones", () => {
        // `*` has no special meaning in ink, so `\*` and `*` both output a literal `*` —
        // they should be interchangeable as emphasis markers.
        const ranges = findMarkdownTokenRanges(String.raw`Hello \*italic\* text`);

        assert.deepStrictEqual(ranges.italic, [{ start: 8, end: 14 }]);
    });

    test("treats a run mixing escaped and bare asterisks as one bold delimiter", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\**This is bold text.**`);

        assert.deepStrictEqual(ranges.bold, [{ start: 3, end: 21 }]);
    });

    test("treats a fully-escaped asterisk run as a bold delimiter", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\*\*bold\*\*`);

        assert.deepStrictEqual(ranges.bold, [{ start: 4, end: 8 }]);
    });

    test("still ignores escaped underscores", () => {
        // Unlike `*`, escaping is left alone for `_` — this wasn't asked for and `_` has
        // its own snake_case guard that assumes literal, unescaped characters.
        const ranges = findMarkdownTokenRanges(String.raw`Hello \_italic\_ text`);

        assert.deepStrictEqual(ranges.italic, []);
    });

    test("finds an escaped heading marker at the start of a line", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\# Markdown Test`);

        assert.deepStrictEqual(ranges.headers, [{ start: 0, end: 2 }]);
    });

    test("finds multi-level escaped heading markers", () => {
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\#\# Bold Text`).headers, [{ start: 0, end: 4 }]);
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\#\#\# H3 Test`).headers, [{ start: 0, end: 6 }]);
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\#\#\#\# H4 Test`).headers, [
            { start: 0, end: 8 },
        ]);
    });

    test("does not treat an unescaped tag hash as a heading marker", () => {
        // `\\#` is an escaped backslash (literal `\`) followed by a real, unescaped `#` —
        // in ink that starts a tag, not a literal heading marker.
        const ranges = findMarkdownTokenRanges(String.raw`\\# Title`);

        assert.deepStrictEqual(ranges.headers, []);
    });

    test("does not treat an escaped hash without trailing whitespace as a heading marker", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\#Title`);

        assert.deepStrictEqual(ranges.headers, []);
    });

    test("ignores heading markers outside of line start", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\# Title`, false);

        assert.deepStrictEqual(ranges.headers, []);
    });

    test("finds an escaped list-bullet marker at the start of a line", () => {
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\- Item 1`).listMarkers, [{ start: 0, end: 2 }]);
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\* Item 2`).listMarkers, [{ start: 0, end: 2 }]);
    });

    test("finds an escaped list-bullet marker before a task-list checkbox", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\- [x] Item 3`);

        assert.deepStrictEqual(ranges.listMarkers, [{ start: 0, end: 2 }]);
    });

    test("ignores list markers outside of line start", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\- Item 1`, false);

        assert.deepStrictEqual(ranges.listMarkers, []);
    });

    test("does not treat an escaped bullet without trailing whitespace as a list marker", () => {
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\-Item`).listMarkers, []);
        // `\*\*\*` is a horizontal rule, not a list item: the second character isn't whitespace.
        assert.deepStrictEqual(findMarkdownTokenRanges(String.raw`\*\*\*`).listMarkers, []);
    });

    test("returns the delimiter spans alongside the emphasized content", () => {
        const ranges = findMarkdownTokenRanges(String.raw`\**This is bold text.**`);

        assert.deepStrictEqual(ranges.bold, [{ start: 3, end: 21 }]);
        assert.deepStrictEqual(ranges.emphasisMarkers, [
            { start: 0, end: 3 },
            { start: 21, end: 23 },
        ]);
    });

    test("returns delimiter spans for underscore emphasis too", () => {
        const ranges = findMarkdownTokenRanges("_italic_ and __bold__");

        assert.deepStrictEqual(ranges.emphasisMarkers, [
            { start: 0, end: 1 },
            { start: 7, end: 8 },
            { start: 13, end: 15 },
            { start: 19, end: 21 },
        ]);
    });

    test("does not treat bold markers as italic markers", () => {
        const ranges = findMarkdownTokenRanges("This is **bold** only.");

        assert.deepStrictEqual(ranges.italic, []);
        assert.deepStrictEqual(ranges.bold, [{ start: 10, end: 14 }]);
    });

    test("finds combined bold and italic ranges for triple markers", () => {
        const ranges = findMarkdownTokenRanges("***test***");

        assert.deepStrictEqual(ranges.italic, [{ start: 3, end: 7 }]);
        assert.deepStrictEqual(ranges.bold, [{ start: 3, end: 7 }]);
    });

    test("finds underscore-delimited italic and bold ranges", () => {
        const ranges = findMarkdownTokenRanges("_italic_ and __bold__");

        assert.deepStrictEqual(ranges.italic, [{ start: 1, end: 7 }]);
        assert.deepStrictEqual(ranges.bold, [{ start: 15, end: 19 }]);
    });

    test("does not treat snake_case identifiers as underscore emphasis", () => {
        // Regression test: two ink identifiers with underscores on the same line
        // (e.g. `visit_paris`) must not be mistaken for an _..._ italic span.
        const ranges = findMarkdownTokenRanges("{ not visit_paris } \t[Go to Paris] -> visit_paris");

        assert.deepStrictEqual(ranges.italic, []);
        assert.deepStrictEqual(ranges.bold, []);
    });

    test("still recognizes real underscore emphasis alongside intraword underscores", () => {
        const ranges = findMarkdownTokenRanges("some_var and another_var and _real italic_ text");

        assert.deepStrictEqual(ranges.italic, [{ start: 30, end: 41 }]);
    });

    test("finds bold range when opening markers are triple and closing markers are double", () => {
        const ranges = findMarkdownTokenRanges("***nd**");

        assert.deepStrictEqual(ranges.bold, [{ start: 3, end: 5 }]);
    });

    test("finds bold range when opening markers are double and closing markers are triple", () => {
        const ranges = findMarkdownTokenRanges("**nd***");

        assert.deepStrictEqual(ranges.bold, [{ start: 2, end: 4 }]);
    });

    test("finds italic range when opening markers are triple and closing markers are single", () => {
        const ranges = findMarkdownTokenRanges("***nd*");

        assert.deepStrictEqual(ranges.italic, [{ start: 3, end: 5 }]);
        assert.deepStrictEqual(ranges.bold, []);
    });

    test("finds italic range when opening markers are single and closing markers are triple", () => {
        const ranges = findMarkdownTokenRanges("*nd***");

        assert.deepStrictEqual(ranges.italic, [{ start: 1, end: 3 }]);
        assert.deepStrictEqual(ranges.bold, []);
    });
});
