import { describe, it, expect } from 'vitest';
import { ADOContent } from '../common.js';

describe('ADOContent', () => {
    describe('escapeHtml', () => {
        it('escapes all 5 HTML entities', () => {
            expect(ADOContent.escapeHtml('&<>"\''))
                .toBe('&amp;&lt;&gt;&quot;&#39;');
        });

        it('returns empty string for null/undefined', () => {
            expect(ADOContent.escapeHtml(null)).toBe('');
            expect(ADOContent.escapeHtml(undefined)).toBe('');
            expect(ADOContent.escapeHtml('')).toBe('');
        });

        it('converts numbers to strings', () => {
            expect(ADOContent.escapeHtml(42)).toBe('42');
        });

        it('passes through safe text unchanged', () => {
            expect(ADOContent.escapeHtml('hello world')).toBe('hello world');
        });

        it('escapes script tags', () => {
            expect(ADOContent.escapeHtml('<script>alert("xss")</script>'))
                .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });
    });

    describe('escapeJs', () => {
        it('escapes backslash and quotes', () => {
            expect(ADOContent.escapeJs("it's a \"test\" with \\")).toBe("it\\'s a \\\"test\\\" with \\\\");
        });

        it('returns empty string for falsy input', () => {
            expect(ADOContent.escapeJs('')).toBe('');
            expect(ADOContent.escapeJs(null)).toBe('');
        });
    });

    describe('parseMarkdownLinks', () => {
        it('parses bold text with **', () => {
            const result = ADOContent.parseMarkdownLinks('**bold**');
            expect(result).toBe('<strong>bold</strong>');
        });

        it('parses italic text with *', () => {
            const result = ADOContent.parseMarkdownLinks('*italic*');
            expect(result).toBe('<em>italic</em>');
        });

        it('parses inline code', () => {
            const result = ADOContent.parseMarkdownLinks('use `console.log`');
            expect(result).toContain('<code>console.log</code>');
        });

        it('parses links', () => {
            const result = ADOContent.parseMarkdownLinks('[text](http://example.com)');
            expect(result).toContain('href="http://example.com"');
            expect(result).toContain('>text</a>');
        });

        it('parses headers', () => {
            const result = ADOContent.parseMarkdownLinks('## Title\n');
            expect(result).toContain('<h2');
            expect(result).toContain('Title');
        });

        it('parses task list checkboxes', () => {
            const result = ADOContent.parseMarkdownLinks('- [ ] todo\n- [x] done\n');
            expect(result).toContain('type="checkbox"');
            expect(result).toContain('checked');
        });

        it('parses bullet lists', () => {
            const result = ADOContent.parseMarkdownLinks('- item1\n- item2\n');
            expect(result).toContain('<ul');
            expect(result).toContain('<li>item1</li>');
        });

        it('parses numbered lists', () => {
            const result = ADOContent.parseMarkdownLinks('1. first\n2. second\n');
            expect(result).toContain('<ol');
            expect(result).toContain('<li>first</li>');
        });

        it('handles backslash escapes', () => {
            const result = ADOContent.parseMarkdownLinks('\\*not italic\\*');
            expect(result).not.toContain('<em>');
            expect(result).toContain('*not italic*');
        });

        it('parses code blocks', () => {
            const result = ADOContent.parseMarkdownLinks('```js\nconst x = 1;\n```');
            expect(result).toContain('<pre><code>');
            expect(result).toContain('const x = 1;');
        });

        it('parses images', () => {
            const result = ADOContent.parseMarkdownLinks('![alt](http://img.png)');
            expect(result).toContain('<img');
            expect(result).toContain('src="http://img.png"');
        });
    });

    describe('processContent', () => {
        it('escapes, resolves mentions, and parses markdown', () => {
            const result = ADOContent.processContent('**bold** & <script>');
            expect(result).toContain('<strong>bold</strong>');
            expect(result).toContain('&amp;');
            expect(result).toContain('&lt;script&gt;');
        });

        it('returns empty string for null/empty', () => {
            expect(ADOContent.processContent('')).toBe('');
            expect(ADOContent.processContent(null)).toBe('');
        });
    });
});
