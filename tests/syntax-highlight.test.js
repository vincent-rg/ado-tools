import { describe, it, expect } from 'vitest';
import SyntaxHighlight from '../js/syntax-highlight.js';

describe('SyntaxHighlight', () => {
    describe('langFromPath', () => {
        it('returns python for .py extension', () => {
            expect(SyntaxHighlight.langFromPath('src/main.py')).toBe('python');
        });

        it('returns c for .c extension', () => {
            expect(SyntaxHighlight.langFromPath('lib/util.c')).toBe('c');
        });

        it('returns c for .h extension', () => {
            expect(SyntaxHighlight.langFromPath('include/util.h')).toBe('c');
        });

        it('returns cpp for .cpp extension', () => {
            expect(SyntaxHighlight.langFromPath('src/main.cpp')).toBe('cpp');
        });

        it('returns cpp for .hpp extension', () => {
            expect(SyntaxHighlight.langFromPath('include/util.hpp')).toBe('cpp');
        });

        it('returns powershell for .ps1 extension', () => {
            expect(SyntaxHighlight.langFromPath('scripts/deploy.ps1')).toBe('powershell');
        });

        it('returns powershell for .psm1 extension', () => {
            expect(SyntaxHighlight.langFromPath('modules/helper.psm1')).toBe('powershell');
        });

        it('returns xml for .xml extension', () => {
            expect(SyntaxHighlight.langFromPath('config/app.xml')).toBe('xml');
        });

        it('returns xml for .csproj extension', () => {
            expect(SyntaxHighlight.langFromPath('project.csproj')).toBe('xml');
        });

        it('returns xml for .config extension', () => {
            expect(SyntaxHighlight.langFromPath('web.config')).toBe('xml');
        });

        it('returns null for unknown extension', () => {
            expect(SyntaxHighlight.langFromPath('readme.md')).toBeNull();
        });

        it('returns null for null input', () => {
            expect(SyntaxHighlight.langFromPath(null)).toBeNull();
        });

        it('returns null for empty string', () => {
            expect(SyntaxHighlight.langFromPath('')).toBeNull();
        });

        it('handles uppercase extensions via toLowerCase', () => {
            expect(SyntaxHighlight.langFromPath('MAIN.PY')).toBe('python');
        });

        it('returns null for file with no extension', () => {
            expect(SyntaxHighlight.langFromPath('Makefile')).toBeNull();
        });
    });

    describe('splitHighlightedLines', () => {
        it('splits plain text on newlines', () => {
            expect(SyntaxHighlight.splitHighlightedLines('line1\nline2\nline3'))
                .toEqual(['line1', 'line2', 'line3']);
        });

        it('returns single element for text without newlines', () => {
            expect(SyntaxHighlight.splitHighlightedLines('hello'))
                .toEqual(['hello']);
        });

        it('handles empty string', () => {
            expect(SyntaxHighlight.splitHighlightedLines(''))
                .toEqual([]);
        });

        it('preserves span context across newlines', () => {
            const html = '<span class="token">line1\nline2</span>';
            const result = SyntaxHighlight.splitHighlightedLines(html);
            expect(result).toEqual([
                '<span class="token">line1</span>',
                '<span class="token">line2</span>',
            ]);
        });

        it('handles nested spans across newlines', () => {
            const html = '<span class="outer"><span class="inner">a\nb</span></span>';
            const result = SyntaxHighlight.splitHighlightedLines(html);
            expect(result).toEqual([
                '<span class="outer"><span class="inner">a</span></span>',
                '<span class="outer"><span class="inner">b</span></span>',
            ]);
        });

        it('handles spans that open and close on the same line', () => {
            const html = '<span class="kw">if</span> (true)\n<span class="kw">return</span>';
            const result = SyntaxHighlight.splitHighlightedLines(html);
            expect(result).toEqual([
                '<span class="kw">if</span> (true)',
                '<span class="kw">return</span>',
            ]);
        });

        it('handles empty lines in the middle', () => {
            const html = 'a\n\nb';
            const result = SyntaxHighlight.splitHighlightedLines(html);
            expect(result).toEqual(['a', '', 'b']);
        });

        it('handles self-closing tags', () => {
            const html = 'before<br/>after';
            const result = SyntaxHighlight.splitHighlightedLines(html);
            expect(result).toEqual(['before<br/>after']);
        });

        it('handles multiple spans on one line then newline', () => {
            const html = '<span class="a">x</span><span class="b">y</span>\nz';
            const result = SyntaxHighlight.splitHighlightedLines(html);
            expect(result).toEqual([
                '<span class="a">x</span><span class="b">y</span>',
                'z',
            ]);
        });
    });
});
