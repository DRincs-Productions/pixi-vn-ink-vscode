export interface MarkdownRange {
    start: number;
    end: number;
}

export interface MarkdownTokenRanges {
    italic: MarkdownRange[];
    bold: MarkdownRange[];
    newlines: MarkdownRange[];
}

function isEscaped(text: string, index: number): boolean {
    let backslashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
        backslashes++;
    }
    return backslashes % 2 === 1;
}

function hasVisibleContent(text: string) {
    return /\S/.test(text);
}

export function findMarkdownTokenRanges(text: string): MarkdownTokenRanges {
    const italic: MarkdownRange[] = [];
    const bold: MarkdownRange[] = [];
    const newlines: MarkdownRange[] = [];

    for (let i = 0; i < text.length - 1; i++) {
        if (text[i] === "\\" && text[i + 1] === "n" && !isEscaped(text, i)) {
            newlines.push({ start: i, end: i + 2 });
            i++;
        }
    }

    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "*" || isEscaped(text, i)) continue;

        if (text[i + 1] === "*") {
            for (let j = i + 2; j < text.length - 1; j++) {
                if (text[j] === "*" && text[j + 1] === "*" && !isEscaped(text, j)) {
                    if (hasVisibleContent(text.slice(i + 2, j))) {
                        bold.push({ start: i + 2, end: j });
                        i = j + 1;
                    }
                    break;
                }
            }
            continue;
        }

        for (let j = i + 1; j < text.length; j++) {
            const nextChar = j + 1 < text.length ? text[j + 1] : "";
            if (text[j] === "*" && !isEscaped(text, j) && text[j - 1] !== "*" && nextChar !== "*") {
                if (hasVisibleContent(text.slice(i + 1, j))) {
                    italic.push({ start: i + 1, end: j });
                    i = j;
                }
                break;
            }
        }
    }

    return { italic, bold, newlines };
}
