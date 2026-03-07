import { describe, it, expect } from 'vitest';
import StickyLinesUtils from '../js/sticky-lines-utils.js';

const { buildScopeList, computeVisible } = StickyLinesUtils;

// ---------------------------------------------------------------------------
// buildScopeList
// ---------------------------------------------------------------------------

describe('buildScopeList', () => {
    it('returns null for unsupported file types', () => {
        const result = buildScopeList('some content', 'file.txt');
        expect(result).toBeNull();
    });

    it('returns flat sorted scope list for a simple JS function', () => {
        const content = [
            'function foo() {',  // line 1
            '  return 1;',       // line 2
            '}',                 // line 3
        ].join('\n');
        const scopes = buildScopeList(content, 'foo.js');
        expect(scopes).not.toBeNull();
        expect(scopes.length).toBe(1);
        expect(scopes[0].openLine).toBe(1);
        expect(scopes[0].closeLine).toBe(3);
        expect(scopes[0].content).toContain('foo');
    });

    it('returns both outer and inner scopes for nested functions, sorted outermost-first', () => {
        const content = [
            'function outer() {', // 1
            '  function inner() {', // 2
            '    return 1;',      // 3
            '  }',                // 4
            '}',                  // 5
        ].join('\n');
        const scopes = buildScopeList(content, 'file.js');
        expect(scopes).not.toBeNull();
        expect(scopes.length).toBe(2);
        expect(scopes[0].openLine).toBe(1); // outer first
        expect(scopes[1].openLine).toBe(2); // inner second
    });

    it('filters out scopes shorter than minBlockLines', () => {
        const content = [
            'function big() {',  // 1
            '  if (x) {',        // 2 — 3 lines total: [2..4], filtered if minBlockLines > 3
            '    return 1;',     // 3
            '  }',               // 4
            '  return 2;',       // 5
            '  return 3;',       // 6
            '  return 4;',       // 7
            '  return 5;',       // 8
            '  return 6;',       // 9
            '}',                 // 10
        ].join('\n');
        const all = buildScopeList(content, 'file.js', 0);
        const filtered = buildScopeList(content, 'file.js', 8);
        // big() spans 10 lines → passes. if-block spans 3 lines → removed.
        const bigPresent = filtered.some(s => s.content.includes('big'));
        const ifPresent = filtered.some(s => s.openLine === 2);
        expect(bigPresent).toBe(true);
        expect(ifPresent).toBe(false);
        // With minBlockLines=0 the if block is present
        expect(all.some(s => s.openLine === 2)).toBe(true);
    });

    it('returns empty list for a function with no body lines between braces', () => {
        // A 2-line function has no lines where it appears as an ancestor in the tree,
        // so buildScopeList correctly returns an empty list for it.
        const content = [
            'function f() {', // 1
            '}',              // 2
        ].join('\n');
        const scopes = buildScopeList(content, 'file.js', 0);
        expect(scopes).not.toBeNull();
        expect(scopes.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// computeVisible
// ---------------------------------------------------------------------------

describe('computeVisible', () => {
    // Uniform layout: each line occupies H pixels starting at (lineNum-1)*H.
    const H = 20;
    const getLineTop = n => (n - 1) * H;

    const makeScope = (openLine, closeLine, content = 'fn') => ({ openLine, closeLine, content });

    it('returns empty when scrollTop is before the scope opens', () => {
        // scope: lines 5–15. At scrollTop=0, top(5)=80 > 0 → not shown.
        const scopes = [makeScope(5, 15)];
        expect(computeVisible(scopes, 0, H, getLineTop)).toEqual([]);
    });

    it('shows scope when viewport is inside it', () => {
        // scope: lines 1–20 (top=0, closeTop=380). scrollTop=100, barHeight=0.
        // openTop(1)=0 <= 100 ✓  closeTop(20)=380 > 100+20=120 ✓
        const scopes = [makeScope(1, 20)];
        const shown = computeVisible(scopes, 100, H, getLineTop);
        expect(shown.length).toBe(1);
        expect(shown[0].openLine).toBe(1);
    });

    it('hides scope when viewport has scrolled past it', () => {
        // scope: lines 1–5 (closeTop=80). At scrollTop=100, barHeight=0:
        // closeTop(5)=80 <= 100+0+20=120 → condition fails (need > 120).
        const scopes = [makeScope(1, 5)];
        // scrollTop large enough that closeTop <= scrollTop+H
        expect(computeVisible(scopes, 80, H, getLineTop)).toEqual([]);
    });

    it('adjacent open+close lines are never shown (math rules it out)', () => {
        // openLine=3, closeLine=4: openTop=40, closeTop=60.
        // Condition: closeTop > scrollTop + barHeight + H → 60 > scrollTop+20
        // → scrollTop < 40. But openTop <= scrollTop+barHeight → 40 <= scrollTop.
        // 40 <= scrollTop AND scrollTop < 40 → impossible.
        const scopes = [makeScope(3, 4)];
        for (const st of [0, 20, 40, 60]) {
            expect(computeVisible(scopes, st, H, getLineTop)).toEqual([]);
        }
    });

    it('shows both outer and inner scopes when inside both', () => {
        // outer: 1–30, inner: 5–20. scrollTop=200 (line 11).
        // outer: openTop=0 <= 200 ✓, closeTop(30)=560 > 220 ✓ → shown; barHeight=20
        // inner: openTop(5)=80 <= 220 ✓, closeTop(20)=380 > 240 ✓ → shown
        const scopes = [makeScope(1, 30, 'outer'), makeScope(5, 20, 'inner')];
        const shown = computeVisible(scopes, 200, H, getLineTop);
        expect(shown.length).toBe(2);
        expect(shown[0].content).toBe('outer');
        expect(shown[1].content).toBe('inner');
    });

    it('shows only outer when scrolled past inner close', () => {
        // outer: 1–50, inner: 5–10. scrollTop=300 (line 16).
        // inner closeTop(10)=180 <= 300+20+20=340… wait, barHeight=20 after outer:
        //   outer: openTop=0 <= 300 ✓, closeTop(50)=960 > 320 ✓ → shown; barHeight=20
        //   inner: openTop(5)=80 <= 320 ✓, closeTop(10)=180 > 340? → 180 > 340 FALSE → not shown
        const scopes = [makeScope(1, 50, 'outer'), makeScope(5, 10, 'inner')];
        const shown = computeVisible(scopes, 300, H, getLineTop);
        expect(shown.length).toBe(1);
        expect(shown[0].content).toBe('outer');
    });

    it('skips scopes whose lines are missing from getLineTop (returns null)', () => {
        // getLineTop returns null for line 1 (e.g. not present in diff)
        const nullTop = n => n === 1 ? null : (n - 1) * H;
        const scopes = [makeScope(1, 20)];
        expect(computeVisible(scopes, 50, H, nullTop)).toEqual([]);
    });

    it('shows a short scope only while inside it', () => {
        // scope: lines 3–5 (openTop=(3-1)*20=40, closeTop=(5-1)*20=80).
        // Condition (barHeight=0): openTop <= scrollTop AND closeTop > scrollTop + H
        //   → 40 <= scrollTop AND 80 > scrollTop + 20
        //   → scrollTop >= 40 AND scrollTop < 60
        // At scrollTop=40: 40<=40 ✓, 80>60 ✓ → shown
        // At scrollTop=60: 80>80 FALSE → not shown
        const scopes = [makeScope(3, 5)];
        expect(computeVisible(scopes, 40, H, getLineTop).length).toBe(1);
        expect(computeVisible(scopes, 60, H, getLineTop).length).toBe(0);
    });

    it('handles empty scopes array', () => {
        expect(computeVisible([], 100, H, getLineTop)).toEqual([]);
    });
});
