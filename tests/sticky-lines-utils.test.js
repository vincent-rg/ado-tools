import { describe, it, expect } from 'vitest';
import StickyLinesUtils from '../js/sticky-lines-utils.js';

const { buildTree, buildBraceTree, buildPythonTree, findExtendedSignature } = StickyLinesUtils;

// Helper: get ancestors at a line (empty array if none)
function anc(result, lineNum) {
    return result.tree.get(lineNum) ?? [];
}

// Helper: content strings of ancestors at a line
function ancContents(result, lineNum) {
    return anc(result, lineNum).map(a => a.content);
}

// ─── findExtendedSignature ──────────────────────────────────────────────────

describe('findExtendedSignature', () => {
    function sig(code) {
        const lines = code.split('\n');
        // find the first line with '{'
        const i = lines.findIndex(l => l.includes('{'));
        if (i === -1) return null;
        return findExtendedSignature(lines, i);
    }

    // --- Functions ---

    it('detects a simple JS function', () => {
        const result = sig('function foo(x, y) {');
        expect(result).not.toBeNull();
        expect(result.content).toContain('foo');
    });

    it('detects a C++ method', () => {
        const result = sig('void MyClass::doWork(int x) {');
        expect(result).not.toBeNull();
        expect(result.content).toContain('doWork');
    });

    it('detects a C++ constructor (simple)', () => {
        const result = sig('MyClass::MyClass(int x) {');
        expect(result).not.toBeNull();
        expect(result.content).toContain('MyClass');
    });

    it('detects a C++ constructor with initializer list (brace on same line)', () => {
        const lines = [
            'MyClass::MyClass(int x)',
            '    : member_(x) {',
        ];
        const i = lines.findIndex(l => l.includes('{'));
        const result = findExtendedSignature(lines, i);
        expect(result).not.toBeNull();
        expect(result.content).toContain('MyClass');
        expect(result.content).not.toContain('member_');
    });

    it('detects a C++ constructor with initializer list (brace on own line)', () => {
        const lines = [
            'MyClass::MyClass(int x, int y)',
            '    : m1_(x)',
            '    , m2_(y)',
            '{',
        ];
        const i = lines.findIndex(l => l.trim() === '{');
        const result = findExtendedSignature(lines, i);
        expect(result).not.toBeNull();
        expect(result.content).toContain('MyClass');
        expect(result.content).not.toContain('m1_');
        expect(result.content).not.toContain('m2_');
    });

    it('detects a C++ constructor with multi-line brace-initializer in init-list', () => {
        const lines = [
            'CFoo::CFoo()',
            '    : CBase(',
            '      someValue1,',
            '      {bar(ns1::ns2::someValue2),',
            '       bar(ns1::ns2::someValue3),',
            '       bar(ns1::ns2::someValue4)})',
            '    , someValue5(true)',
            '{',
        ];
        const i = 7;
        const result = findExtendedSignature(lines, i);
        expect(result).not.toBeNull();
        expect(result.content).toContain('CFoo');
        expect(result.content).not.toContain('bar');
        expect(result.content).not.toContain('someValue');
    });

    it('detects a multi-line function signature', () => {
        const lines = [
            'void longFunction(',
            '    int a,',
            '    int b',
            ') {',
        ];
        const i = 3;
        const result = findExtendedSignature(lines, i);
        expect(result).not.toBeNull();
        expect(result.content).toContain('longFunction');
    });

    // --- Classes / structs ---

    it('detects a class declaration', () => {
        const result = sig('class Foo {');
        expect(result).not.toBeNull();
        expect(result.content).toContain('class Foo');
    });

    it('detects a struct', () => {
        const result = sig('struct Point {');
        expect(result).not.toBeNull();
        expect(result.content).toContain('struct Point');
    });

    it('detects a namespace', () => {
        const result = sig('namespace utils {');
        expect(result).not.toBeNull();
        expect(result.content).toContain('namespace utils');
    });

    // --- Control flow ---

    it('detects if block', () => {
        const result = sig('if (x > 0) {');
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^if/);
        expect(result.content).toContain('x > 0');
    });

    it('detects else if block', () => {
        const lines = ['} else if (x < 0) {'];
        const result = findExtendedSignature(lines, 0);
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^else if/);
    });

    it('detects else block', () => {
        const result = sig('else {');
        expect(result).not.toBeNull();
        expect(result.content).toBe('else');
    });

    it('detects else following closing brace: "} else {"', () => {
        const lines = ['} else {'];
        const result = findExtendedSignature(lines, 0);
        expect(result).not.toBeNull();
        expect(result.content).toBe('else');
    });

    it('detects for loop', () => {
        const result = sig('for (int i = 0; i < n; i++) {');
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^for/);
    });

    it('detects while loop', () => {
        const result = sig('while (running) {');
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^while/);
    });

    it('detects switch statement', () => {
        const result = sig('switch (mode) {');
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^switch/);
    });

    it('detects try block', () => {
        const result = sig('try {');
        expect(result).not.toBeNull();
        expect(result.content).toBe('try');
    });

    it('detects catch block', () => {
        const result = sig('catch (const std::exception& e) {');
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^catch/);
    });

    it('detects multi-line if condition', () => {
        const lines = [
            'if (veryLongConditionA &&',
            '    veryLongConditionB) {',
        ];
        const i = 1; // line with '{'
        const result = findExtendedSignature(lines, i);
        expect(result).not.toBeNull();
        expect(result.content).toMatch(/^if/);
    });

    // --- Should NOT detect ---

    it('returns null for a plain assignment with braces', () => {
        const lines = ['const obj = { a: 1 };'];
        // This line has '{' but no recognizable structural pattern
        // (ends with ';' so not a block opener in practice, but the function
        // only cares about the line having '{')
        // The paramEndIdx check: no ')', falls to isStructuralLine → false
        const result = findExtendedSignature(lines, 0);
        // Could be null (expected) since it ends with ';' not a block pattern
        // This is mostly a sanity check that we don't crash
        expect(result).toBeNull();
    });
});

// ─── buildBraceTree ──────────────────────────────────────────────────────────

describe('buildBraceTree', () => {
    it('returns empty ancestors for top-level lines', () => {
        const src = 'int x = 1;\nint y = 2;\n';
        const lines = src.split('\n');
        const { tree } = buildBraceTree(lines);
        expect(tree.get(1)).toEqual([]);
    });

    it('detects function scope', () => {
        const src = [
            'void foo() {',  // 1
            '    int x;',    // 2
            '}',             // 3
        ].join('\n');
        const lines = src.split('\n');
        const { tree, blockEndLines } = buildBraceTree(lines);
        const a = tree.get(2);
        expect(a).toHaveLength(1);
        expect(a[0].content).toContain('foo');
        expect(blockEndLines.get(1)).toBe(3); // block for line 1 closes at line 3
    });

    it('detects nested if inside function', () => {
        const src = [
            'void bar() {',       // 1
            '    if (x > 0) {',   // 2
            '        doWork();',  // 3
            '    }',              // 4
            '}',                  // 5
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildBraceTree(lines);
        const a = tree.get(3);
        expect(a).toHaveLength(2);
        expect(a[0].content).toContain('bar');
        expect(a[1].content).toMatch(/^if/);
    });

    it('detects switch inside function', () => {
        const src = [
            'void process() {',    // 1
            '    switch (mode) {', // 2
            '        case 1:',     // 3
            '            break;',  // 4
            '    }',               // 5
            '}',                   // 6
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildBraceTree(lines);
        const a = tree.get(3);
        expect(a.map(x => x.content)).toEqual(
            expect.arrayContaining([expect.stringMatching(/process/), expect.stringMatching(/^switch/)])
        );
    });

    it('detects C++ constructor with initializer list', () => {
        const src = [
            'MyClass::MyClass(int x)',  // 1
            '    : member_(x)',         // 2
            '{',                        // 3
            '    init();',              // 4
            '}',                        // 5
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildBraceTree(lines);
        const a = tree.get(4);
        expect(a).toHaveLength(1);
        expect(a[0].content).toContain('MyClass');
        expect(a[0].content).not.toContain('member_');
    });

    it('detects C++ constructor with brace-initializer in init-list', () => {
        const src = [
            'CFoo::CFoo()',
            '    : CBase(',
            '      someValue1,',
            '      {bar(ns1::ns2::someValue2),',
            '       bar(ns1::ns2::someValue3),',
            '       bar(ns1::ns2::someValue4)})',
            '    , someValue5(true)',
            '{',
            '    doWork();',
            '}',
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildBraceTree(lines);
        const a = tree.get(9); // inside the function body
        expect(a).toHaveLength(1);
        expect(a[0].content).toContain('CFoo');
        expect(a[0].content).not.toContain('bar');
    });

    it('tracks blockEndLines for multiple blocks', () => {
        const src = [
            'void a() {',     // 1
            '    int x;',     // 2
            '}',              // 3
            'void b() {',     // 4
            '    int y;',     // 5
            '}',              // 6
        ].join('\n');
        const lines = src.split('\n');
        const { blockEndLines } = buildBraceTree(lines);
        expect(blockEndLines.get(1)).toBe(3);
        expect(blockEndLines.get(4)).toBe(6);
    });

    it('handles if/else chain correctly', () => {
        const src = [
            'void f() {',         // 1
            '    if (a) {',       // 2
            '        x();',       // 3
            '    } else if (b) {',// 4
            '        y();',       // 5
            '    } else {',       // 6
            '        z();',       // 7
            '    }',              // 8
            '}',                  // 9
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildBraceTree(lines);
        // Inside 'else' branch (line 7): ancestors = [f, else]
        const a7 = tree.get(7);
        const contents7 = a7.map(x => x.content);
        expect(contents7.some(c => /^f/.test(c) || c.includes('f()'))).toBe(true);
        expect(contents7.some(c => /^else/.test(c))).toBe(true);
    });
});

// ─── buildPythonTree ─────────────────────────────────────────────────────────

describe('buildPythonTree', () => {
    it('detects a top-level function', () => {
        const src = [
            'def foo(x):',    // 1
            '    return x',   // 2
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildPythonTree(lines);
        expect(tree.get(2)).toHaveLength(1);
        expect(tree.get(2)[0].content).toContain('foo');
    });

    it('detects a class with method', () => {
        const src = [
            'class MyClass:',      // 1
            '    def method(self):',// 2
            '        pass',         // 3
        ].join('\n');
        const lines = src.split('\n');
        const { tree } = buildPythonTree(lines);
        const a = tree.get(3);
        expect(a).toHaveLength(2);
        expect(a[0].content).toContain('MyClass');
        expect(a[1].content).toContain('method');
    });

    it('tracks blockEndLines', () => {
        const src = [
            'def foo():',   // 1
            '    x = 1',    // 2
            'def bar():',   // 3
            '    y = 2',    // 4
        ].join('\n');
        const lines = src.split('\n');
        const { blockEndLines } = buildPythonTree(lines);
        expect(blockEndLines.get(1)).toBe(2); // foo ends at line 2 (line before bar)
    });
});

// ─── buildTree integration ───────────────────────────────────────────────────

describe('buildTree', () => {
    it('returns null for unsupported extension', () => {
        expect(buildTree('some content', 'file.txt')).toBeNull();
        expect(buildTree('some content', 'file.xml')).toBeNull();
    });

    it('uses brace tree for .js', () => {
        const src = 'function hi() {\n    return 1;\n}\n';
        const result = buildTree(src, 'file.js');
        expect(result).not.toBeNull();
        expect(result.tree).toBeDefined();
        expect(result.blockEndLines).toBeDefined();
        expect(ancContents(result, 2)).toContain('function hi()');
    });

    it('uses brace tree for .cpp', () => {
        const src = 'void run() {\n    doThing();\n}\n';
        const result = buildTree(src, 'main.cpp');
        expect(result).not.toBeNull();
        expect(ancContents(result, 2)).toContain('void run()');
    });

    it('uses python tree for .py', () => {
        const src = 'def compute(x):\n    return x * 2\n';
        const result = buildTree(src, 'util.py');
        expect(result).not.toBeNull();
        expect(ancContents(result, 2)[0]).toContain('compute');
    });

    it('brace tree: shows if/for/while in ancestry', () => {
        const src = [
            'void process() {',      // 1
            '    for (auto& x : v) {', // 2
            '        if (x > 0) {',  // 3
            '            use(x);',   // 4
            '        }',             // 5
            '    }',                 // 6
            '}',                     // 7
        ].join('\n');
        const result = buildTree(src, 'test.cpp');
        const a = ancContents(result, 4);
        expect(a.some(c => c.includes('process'))).toBe(true);
        expect(a.some(c => /^for/.test(c))).toBe(true);
        expect(a.some(c => /^if/.test(c))).toBe(true);
    });
});

// ─── MIN_BLOCK_LINES filter (blockEndLines) ──────────────────────────────────
// filterAncestors uses (endLine - sigLine + 1) >= MIN_BLOCK_LINES (currently 8).
// Allman-style braces add an extra line to the span vs K&R style, so the threshold
// needs to be large enough to filter small Allman blocks too.
//   K&R  2-body: sig=1 end=4 → span=4  (filtered at MIN=8)
//   K&R  6-body: sig=1 end=8 → span=8  (shown    at MIN=8)
//   Allman 2-body: sig=1 end=5 → span=5 (filtered at MIN=8)
//   Allman 5-body: sig=1 end=8 → span=8 (shown    at MIN=8)

describe('blockEndLines spans', () => {
    it('small block (< 8 source lines) has correct endLine', () => {
        const src = [
            'void f() {',    // 1
            '    if (x) {',  // 2
            '        y();',  // 3
            '    }',         // 4
            '}',             // 5
        ].join('\n');
        const lines = src.split('\n');
        const { blockEndLines } = buildBraceTree(lines);
        // The 'if' block: sigLine = 2, endLine = 4 → span = 4-2+1 = 3 → filtered (< 8)
        expect(blockEndLines.get(2)).toBe(4);
        // The 'f' block: sigLine = 1, endLine = 5 → span = 5-1+1 = 5 → filtered (< 8)
        expect(blockEndLines.get(1)).toBe(5);
    });

    it('correctly identifies large vs small blocks', () => {
        const src = [
            'void big() {',         // 1
            '    if (cond) {',      // 2
            '        a();',         // 3
            '    }',                // 4  (if block: lines 2-4, span=3 → filtered)
            '    for (;;) {',       // 5
            '        b();',         // 6
            '        c();',         // 7
            '        d();',         // 8
            '        e();',         // 9
            '    }',                // 10 (for block: lines 5-10, span=6 → filtered at MIN=8)
            '}',                    // 11
        ].join('\n');
        const lines = src.split('\n');
        const { blockEndLines } = buildBraceTree(lines);
        const ifSpan  = blockEndLines.get(2) - 2 + 1;  // 4 - 2 + 1 = 3
        const forSpan = blockEndLines.get(5) - 5 + 1;  // 10 - 5 + 1 = 6
        expect(ifSpan).toBe(3);
        expect(forSpan).toBe(6);
    });
});
