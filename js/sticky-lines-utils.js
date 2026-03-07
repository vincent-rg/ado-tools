/**
 * Sticky Lines Utilities
 *
 * Pure functions for building scope-context trees used by the sticky-lines
 * bar in the file diff view. Extracted from ado-pr-threads.html for testability.
 *
 * Exposed as StickyLinesUtils global (or module.exports in Node).
 */

const StickyLinesUtils = (() => {
    function getLanguage(filePath) {
        const ext = (filePath.split('.').pop() || '').toLowerCase();
        if (['py', 'pyw'].includes(ext)) return 'python';
        if (['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'cs', 'java',
             'js', 'jsx', 'ts', 'tsx', 'go', 'rs', 'kt', 'kts', 'swift',
             'm', 'mm', 'php', 'rb', 'scala', 'groovy'].includes(ext)) return 'brace';
        return null;
    }

    function isStructuralLine(line) {
        const t = line.trimStart();
        if (!t.includes('{')) return false;
        if (/^(if|else|for|while|do\b|switch|try|catch|finally|with|using)\b/.test(t)) return false;
        if (/\b(class|struct|interface|enum|union|namespace|record|module|impl|trait|object)\b/.test(t)) return true;
        if (/\b(function|fn|func)\s+\w/.test(t)) return true;
        if (/\(.*\).*\{/.test(t) && /^[A-Za-z_~]/.test(t)) return true;
        return false;
    }

    // Detects the scope-opening signature for a line that contains '{'.
    // Handles multi-line signatures where the return type, name, params, and
    // opening brace may each be on different lines.
    // Also handles control-flow blocks (if/else/for/while/switch/try/catch/finally)
    // and C++ constructor initializer lists.
    // Returns { startIdx (0-based), content } or null if not a structural scope.
    function findExtendedSignature(lines, i) {
        const trimmed = lines[i].trim();
        if (!trimmed.includes('{')) return null;

        const CONTROL_FLOW_RE = /^(if|else\s+if|else|for|while|do\b|switch|try|catch|finally)\b/;

        // Walk back from the current line to find the closing ) of a param list.
        // Tracks paren balance across ALL lines (including initializer-list entries
        // starting with ':' or ',') so multi-line initializer items (e.g.
        // ": CBase(\n  {bar(x)})" don't confuse the search.
        // Lines starting with single ':' or ',' are counted for balance but never
        // marked as paramEndIdx candidates.  Scans right-to-left within each line
        // and keeps updating paramEndIdx — the last update (earliest in source)
        // is the real function-param closing ')'.
        let paramEndIdx = -1;
        let parenDepth = 0;
        for (let j = i; j >= Math.max(0, i - 20); j--) {
            const t = lines[j].trim();
            if (!t) continue;
            if (j < i && (/[;{}]$/.test(t) || t === '};')) break;
            const checkStr = j === i ? t.replace(/\s*\{.*$/, '').trim() : t;
            const isSkipLine = /^:(?!:)/.test(checkStr) || /^,/.test(checkStr);
            for (let k = checkStr.length - 1; k >= 0; k--) {
                const ch = checkStr[k];
                if (ch === ')') {
                    if (!isSkipLine && parenDepth === 0) paramEndIdx = j;
                    parenDepth++;
                } else if (ch === '(') {
                    if (parenDepth > 0) parenDepth--;
                }
            }
        }

        if (paramEndIdx === -1) {
            // No param list — handle keywords without parens (else, try, finally, do)
            // or class/struct/namespace/etc.
            const lineTrimStart = lines[i].trimStart();
            // Strip a leading '}' to handle '} else {' and similar.
            const kwStart = lineTrimStart.replace(/^}\s*/, '');
            if (CONTROL_FLOW_RE.test(kwStart)) {
                return { startIdx: i, content: kwStart.replace(/\s*\{.*$/, '').trim() || kwStart };
            }
            // Walk back 1–2 lines for an else/try/do that is on a separate line from '{'.
            for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                const t = lines[j].trim();
                if (!t) continue;
                if (/[;{}]$/.test(t)) break;
                if (CONTROL_FLOW_RE.test(t)) {
                    return { startIdx: j, content: t.replace(/\s*\{.*$/, '').trim() };
                }
                break;
            }
            // Fall back to class/struct/etc. detection
            if (isStructuralLine(lines[i])) {
                return { startIdx: i, content: trimmed.replace(/\s*\{.*$/, '').trim() || trimmed };
            }
            return null;
        }

        // Walk back from paramEndIdx to find the opening (.
        let paramStartIdx = paramEndIdx;
        for (let j = paramEndIdx; j >= Math.max(0, paramEndIdx - 6); j--) {
            const t = lines[j].trim();
            if (t.endsWith(';') || t === '}' || t === '};') break;
            if (t.includes('(')) { paramStartIdx = j; break; }
        }

        const funcTrimmed = lines[paramStartIdx].trimStart();
        // Strip a leading '}' to handle '} else if', '} catch', etc.
        const kwTrimmed = funcTrimmed.replace(/^}\s*/, '');

        // Handle control-flow keywords (with or without leading '}').
        if (CONTROL_FLOW_RE.test(kwTrimmed)) {
            const parts = [];
            for (let k = paramStartIdx; k <= paramEndIdx; k++) {
                let t = lines[k].trim().replace(/^}\s*/, ''); // strip leading }
                if (k === paramEndIdx) t = t.replace(/\s*\{.*$/, '').trim();
                if (t) parts.push(t);
            }
            if (!parts.length) return null;
            return { startIdx: paramStartIdx, content: parts.join(' ') };
        }

        // Non-control-flow: must look like a declaration.
        if (/^(return|with|#)/.test(funcTrimmed)) return null;
        if (!/^[A-Za-z_~*]/.test(funcTrimmed)) return null;

        // Check if the line before the function name is a return type / modifier prefix.
        let signatureStart = paramStartIdx;
        if (paramStartIdx > 0) {
            const prev = lines[paramStartIdx - 1].trim();
            if (prev && prev.length < 80 &&
                !/[;{}]$/.test(prev) &&
                !/^(if|else|for|while|do\b|switch|try|catch|finally|return|#|\/\/)/.test(prev)) {
                signatureStart = paramStartIdx - 1;
            }
        }

        // Build the display content: join lines from signatureStart to paramEndIdx,
        // stripping any trailing '{' from the last included line.
        const parts = [];
        for (let k = signatureStart; k <= paramEndIdx; k++) {
            let t = lines[k].trim();
            if (k === paramEndIdx) t = t.replace(/\s*\{.*$/, '').trim();
            if (t) parts.push(t);
        }

        if (!parts.length) return null;
        return { startIdx: signatureStart, content: parts.join(' ') };
    }

    // Returns { tree: Map<lineNum, ancestor[]>, blockEndLines: Map<sigLineNum, closeLineNum> }
    // Uses explicit push/pop (one per '{'/'}') so that '} else {' and '} else if {'
    // correctly close the previous scope and open a new one at the same depth.
    function buildBraceTree(lines) {
        const tree = new Map();
        const blockEndLines = new Map(); // sigLineNum -> closing-brace lineNum
        // Stack entries: { lineNum, content } for named scopes, or null for anonymous '{'
        const stack = [];
        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i];
            let opens = 0, closes = 0;
            for (const ch of line) {
                if (ch === '{') opens++;
                else if (ch === '}') closes++;
            }
            // Pop one stack entry per closing brace.
            for (let c = 0; c < closes; c++) {
                if (stack.length > 0) {
                    const popped = stack.pop();
                    if (popped !== null) blockEndLines.set(popped.lineNum, lineNum);
                }
            }
            // Record ancestry after closes, before opens (so the current line's opening
            // brace is NOT yet on the stack — matching how the old algorithm worked).
            tree.set(lineNum, stack.filter(e => e !== null).map(s => ({ lineNum: s.lineNum, content: s.content })));
            // Push one stack entry per opening brace.
            if (opens > 0) {
                const sig = findExtendedSignature(lines, i);
                // First '{' gets the signature (or null if none); additional '{' are anonymous.
                stack.push(sig ? { lineNum: sig.startIdx + 1, content: sig.content } : null);
                for (let o = 1; o < opens; o++) stack.push(null);
            }
        }
        for (const s of stack) {
            if (s !== null) blockEndLines.set(s.lineNum, lines.length);
        }
        return { tree, blockEndLines };
    }

    // Returns { tree: Map<lineNum, ancestor[]>, blockEndLines: Map<lineNum, endLineNum> }
    function buildPythonTree(lines) {
        const tree = new Map();
        const blockEndLines = new Map();
        const stack = []; // {lineNum, content, indent}
        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed) {
                tree.set(lineNum, stack.map(s => ({ lineNum: s.lineNum, content: s.content })));
                continue;
            }
            const indent = line.length - line.trimStart().length;
            while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                const popped = stack.pop();
                blockEndLines.set(popped.lineNum, lineNum - 1 || lineNum);
            }
            tree.set(lineNum, stack.map(s => ({ lineNum: s.lineNum, content: s.content })));
            if (/^(def|class|async\s+def)\s+\w/.test(trimmed)) {
                stack.push({ lineNum, content: trimmed, indent });
            }
        }
        for (const s of stack) blockEndLines.set(s.lineNum, lines.length);
        return { tree, blockEndLines };
    }

    // Returns { tree, blockEndLines } or null for unsupported languages.
    function buildTree(content, filePath) {
        const lang = getLanguage(filePath);
        if (!lang) return null;
        const lines = content.split('\n');
        return lang === 'python' ? buildPythonTree(lines) : buildBraceTree(lines);
    }

    // Returns [{openLine, closeLine, content}] sorted outermost-first (by openLine),
    // or null for unsupported languages.
    // minBlockLines: scopes shorter than this (closeLine - openLine + 1 < minBlockLines) are excluded.
    function buildScopeList(content, filePath, minBlockLines = 0) {
        const result = buildTree(content, filePath);
        if (!result) return null;
        const { tree, blockEndLines } = result;
        const seen = new Set();
        const scopes = [];
        for (const ancestors of tree.values()) {
            for (const a of ancestors) {
                if (!seen.has(a.lineNum)) {
                    seen.add(a.lineNum);
                    const closeLine = blockEndLines.get(a.lineNum);
                    if (closeLine != null) {
                        if (closeLine - a.lineNum + 1 >= minBlockLines) {
                            scopes.push({ openLine: a.lineNum, closeLine, content: a.content });
                        }
                    }
                }
            }
        }
        scopes.sort((a, b) => a.openLine - b.openLine);
        return scopes;
    }

    // Pure implementation of the sticky-bar visibility algorithm.
    // scopes: [{openLine, closeLine, content}] sorted outermost-first.
    // scrollTop: current scroll position (pixels).
    // H: height of one code row (pixels) — used as the bar-slot height per shown scope.
    // getLineTop: (lineNum) => pixelOffset | null — maps line number to top-of-row pixel offset.
    // Returns the subset of scopes that should be shown in the sticky bar, in order.
    function computeVisible(scopes, scrollTop, H, getLineTop) {
        const shown = [];
        let barHeight = 0;
        for (const scope of scopes) {
            const openTop = getLineTop(scope.openLine);
            const closeTop = getLineTop(scope.closeLine);
            if (openTop == null || closeTop == null) continue;
            if (openTop <= scrollTop + barHeight && closeTop > scrollTop + barHeight + H) {
                shown.push(scope);
                barHeight += H;
            }
        }
        return shown;
    }

    return { getLanguage, isStructuralLine, findExtendedSignature, buildBraceTree, buildPythonTree, buildTree, buildScopeList, computeVisible };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StickyLinesUtils;
}
