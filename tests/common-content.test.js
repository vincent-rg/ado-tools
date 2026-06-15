import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ADOContent, ADOConfig } from '../js/common.js';

describe('ADOContent', () => {
    describe('escapeHtml', () => {
        it('escapes 4 HTML entities (& < > ")', () => {
            expect(ADOContent.escapeHtml('&<>"'))
                .toBe('&amp;&lt;&gt;&quot;');
        });

        it('does not escape single quotes', () => {
            expect(ADOContent.escapeHtml("it's")).toBe("it's");
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

    describe('parseMarkdown', () => {
        it('parses bold text with **', () => {
            const result = ADOContent.parseMarkdown('**bold**');
            expect(result).toBe('<strong>bold</strong>');
        });

        it('parses italic text with *', () => {
            const result = ADOContent.parseMarkdown('*italic*');
            expect(result).toBe('<em>italic</em>');
        });

        it('parses inline code', () => {
            expect(ADOContent.parseMarkdown('use `console.log`')).toBe('use <code>console.log</code>');
        });

        it('parses links', () => {
            expect(ADOContent.parseMarkdown('[text](http://example.com)')).toBe('<a href="http://example.com" target="_blank" rel="noopener noreferrer">text</a>');
        });

        it('auto-links bare http URLs', () => {
            expect(ADOContent.parseMarkdown('see http://www.foo.com for details')).toBe('see <a href="http://www.foo.com" target="_blank" rel="noopener noreferrer">http://www.foo.com</a> for details');
        });

        describe('ADO PR references (!N)', () => {
            const origGet = ADOConfig.get;
            beforeAll(() => {
                ADOConfig.get = () => ({ serverUrl: 'http://s', organization: 'o', project: 'p', repository: 'r' });
            });
            afterAll(() => { ADOConfig.get = origGet; });

            it('links a bare !N to the pull request', () => {
                const out = ADOContent.parseMarkdown('see !2 here');
                expect(out).toContain('<a href="http://s/o/p/_git/r/pullrequest/2?_a=overview" class="ado-pr-ref" data-pr-id="2" target="_blank" rel="noopener noreferrer">');
                expect(out).toContain('<span class="ado-pr-ref-text">!2</span>');
                expect(out).toContain('ado-pr-ref-icon');
            });

            it('does not treat image syntax ![alt](url) as a PR reference', () => {
                expect(ADOContent.parseMarkdown('![alt](http://x/a.png)')).toBe('<img src="http://x/a.png" alt="alt" />');
            });

            it('does not match ! attached to a preceding word/path char', () => {
                expect(ADOContent.parseMarkdown('path/to/file!2')).toBe('path/to/file!2');
            });

            it('links a bare #N to the work item', () => {
                const out = ADOContent.parseMarkdown('fixes #123 now');
                expect(out).toContain('<a href="http://s/o/p/_workitems/edit/123" class="ado-wi-ref" data-wi-id="123" target="_blank" rel="noopener noreferrer">');
                expect(out).toContain('<span class="ado-wi-ref-text">#123</span>');
                expect(out).toContain('ado-wi-ref-icon');
            });

            it('does not treat markdown headers as work item refs', () => {
                expect(ADOContent.parseMarkdown('# Heading\n')).toBe('<h1 class="md-h1">Heading</h1>');
            });

            // ADO disambiguation: "#2" is a work item link, "# 2" is an h1 with text "2".
            it('treats #2 (no space) as a work item link', () => {
                expect(ADOContent.parseMarkdown('#2')).toContain('class="ado-wi-ref"');
            });
            it('treats # 2 (with space) as a heading', () => {
                expect(ADOContent.parseMarkdown('# 2\n')).toBe('<h1 class="md-h1">2</h1>');
            });

            it('does not match # without digits (e.g. hex colors)', () => {
                expect(ADOContent.parseMarkdown('color #fff value')).toBe('color #fff value');
            });
        });

        it('auto-links bare https URLs', () => {
            expect(ADOContent.parseMarkdown('https://example.com/path?a=1')).toBe('<a href="https://example.com/path?a=1" target="_blank" rel="noopener noreferrer">https://example.com/path?a=1</a>');
        });

        it('auto-link strips trailing sentence punctuation', () => {
            expect(ADOContent.parseMarkdown('see http://foo.com.')).toBe('see <a href="http://foo.com" target="_blank" rel="noopener noreferrer">http://foo.com</a>.');
        });

        it('parses links inside bullet list items', () => {
            expect(ADOContent.parseMarkdown('- [bar](http://foo.com)\n')).toBe('<ul class="md-list"><li><a href="http://foo.com" target="_blank" rel="noopener noreferrer">bar</a></li></ul>');
        });

        it('auto-links bare URLs inside bullet list items', () => {
            expect(ADOContent.parseMarkdown('- see http://foo.com\n')).toBe('<ul class="md-list"><li>see <a href="http://foo.com" target="_blank" rel="noopener noreferrer">http://foo.com</a></li></ul>');
        });

        it('does not double-link markdown links', () => {
            const result = ADOContent.parseMarkdown('[text](http://example.com)');
            const count = (result.match(/<a /g) || []).length;
            expect(count).toBe(1);
        });

        it('parses headers', () => {
            expect(ADOContent.parseMarkdown('## Title\n')).toBe('<h2 class="md-h2">Title</h2>');
        });

        it('parses task list checkboxes', () => {
            expect(ADOContent.parseMarkdown('- [ ] todo\n- [x] done\n')).toBe('<ul class="md-list"><li class="md-task-item"><input type="checkbox" data-checkbox-index="0"> todo</li><li class="md-task-item"><input type="checkbox" checked data-checkbox-index="1"> done</li></ul>');
        });

        it('parses checkboxes after a heading', () => {
            expect(ADOContent.parseMarkdown('### liste choix\n- [X] choix A\n- [ ] choix B\n')).toBe('<h3 class="md-h3">liste choix</h3><ul class="md-list"><li class="md-task-item"><input type="checkbox" checked data-checkbox-index="0"> choix A</li><li class="md-task-item"><input type="checkbox" data-checkbox-index="1"> choix B</li></ul>');
        });

        it('parses bullet lists', () => {
            expect(ADOContent.parseMarkdown('- item1\n- item2\n')).toBe('<ul class="md-list"><li>item1</li><li>item2</li></ul>');
        });

        it('parses nested bullet lists', () => {
            const input = '- parent\n  - child\n- sibling\n';
            const result = ADOContent.parseMarkdown(input);
            expect(result).toBe('<ul class="md-list"><li>parent<ul class="md-list"><li>child</li></ul></li><li>sibling</li></ul>');
        });

        it('parses deeply nested bullet lists', () => {
            const input = '- a\n  - b\n    - c\n  - d\n';
            const result = ADOContent.parseMarkdown(input);
            expect(result).toBe('<ul class="md-list"><li>a<ul class="md-list"><li>b<ul class="md-list"><li>c</li></ul></li><li>d</li></ul></li></ul>');
        });

        it('parses numbered lists', () => {
            expect(ADOContent.parseMarkdown('1. first\n2. second\n')).toBe('<ol class="md-list"><li>first</li><li>second</li></ol>');
        });

        it('parses nested numbered lists', () => {
            const input = '1. parent\n  1. child\n2. sibling\n';
            const result = ADOContent.parseMarkdown(input);
            expect(result).toBe('<ol class="md-list"><li>parent<ol class="md-list"><li>child</li></ol></li><li>sibling</li></ol>');
        });

        it('preserves start number on interrupted numbered lists', () => {
            // When a non-list line breaks an ordered list, the continuation should keep its numbering.
            const out = ADOContent.parseMarkdown('1. one\n2. two\nfoo\n3. three\n4. four\n');
            expect(out).toContain('<ol class="md-list"><li>one</li><li>two</li></ol>');
            expect(out).toContain('<ol class="md-list" start="3"><li>three</li><li>four</li></ol>');
        });

        it('lone backslash line (nothing after) renders as empty line', () => {
            expect(ADOContent.parseMarkdown('\\')).toBe('');
            expect(ADOContent.parseMarkdown('  \\')).toBe('');  // leading spaces stripped
            expect(ADOContent.parseMarkdown('line1\n\\\nline2')).toBe('line1\n\nline2');
        });

        it('backslash with trailing content (even spaces) is NOT erased', () => {
            expect(ADOContent.parseMarkdown('\\ ')).toBe('\\ ');       // trailing space → kept
            expect(ADOContent.parseMarkdown('\\   ')).toBe('\\   ');   // trailing spaces → kept
            expect(ADOContent.parseMarkdown('\\ text')).toContain('\\ text'); // trailing text → kept
        });

        it('multiple consecutive blank lines collapse to one paragraph break', () => {
            expect(ADOContent.parseMarkdown('a\n\n\nb')).toBe('a\n\nb');       // 2 blank → 1
            expect(ADOContent.parseMarkdown('a\n\n\n\n\nb')).toBe('a\n\nb');   // 4 blank → 1
            expect(ADOContent.parseMarkdown('a\n\nb')).toBe('a\n\nb');         // 1 blank stays
            expect(ADOContent.parseMarkdown('a\nb')).toBe('a\nb');             // no blank stays
        });

        it('stacked lone-backslash lines render as multiple empty lines', () => {
            // 1 `\` line → 1 empty line (paragraph stays continuous)
            expect(ADOContent.parseMarkdown('a\n\\\nb')).toBe('a\n\nb');
            // 2 `\` lines → 2 empty lines
            expect(ADOContent.parseMarkdown('a\n\\\n\\\nb')).toBe('a\n\n\nb');
            // 3 `\` lines → 3 empty lines
            expect(ADOContent.parseMarkdown('a\n\\\n\\\n\\\nb')).toBe('a\n\n\n\nb');
        });

        it('blank line + N backslash lines = paragraph break + N empty lines', () => {
            // blank + 1 `\` → 2 empty lines (1 break + 1 from `\`)
            expect(ADOContent.parseMarkdown('a\n\n\\\nb')).toBe('a\n\n\nb');
            // blank + 2 `\` → 3 empty lines
            expect(ADOContent.parseMarkdown('a\n\n\\\n\\\nb')).toBe('a\n\n\n\nb');
            // multiple blanks (collapse to 1) + 2 `\` → 3 empty lines
            expect(ADOContent.parseMarkdown('a\n\n\n\n\\\n\\\nb')).toBe('a\n\n\n\nb');
        });

        it('trailing backslash on a content line is stripped (hard-break marker)', () => {
            expect(ADOContent.parseMarkdown('foo\\')).toBe('foo');
            expect(ADOContent.parseMarkdown('foo\\\nbar')).toBe('foo\nbar');
            // multi-line with mixed trailing backslashes
            expect(ADOContent.parseMarkdown('foo\\\nbar\\\nbaz')).toBe('foo\nbar\nbaz');
        });

        it('handles backslash escapes', () => {
            const result = ADOContent.parseMarkdown('\\*not italic\\*');
            expect(result).not.toContain('<em>');
            expect(result).toContain('*not italic*');
        });

        it('parses code blocks', () => {
            expect(ADOContent.parseMarkdown('```js\nconst x = 1;\n```')).toBe('<pre><code class="language-js hljs">const x = 1;</code></pre>');
        });

        it('preserves single quotes in code blocks (via processContent)', () => {
            const result = ADOContent.processContent("```\nit's a 'test'\n```");
            expect(result).toContain("it's a 'test'");
            expect(result).not.toContain('&#39;');
        });

        it('parses images', () => {
            expect(ADOContent.parseMarkdown('![alt](http://img.png)')).toBe('<img src="http://img.png" alt="alt" />');
        });

        describe('blockquotes', () => {
            it('parses a simple blockquote', () => {
                expect(ADOContent.parseMarkdown('&gt; quoted text\n')).toBe('<blockquote class="md-blockquote">quoted text</blockquote>');
            });

            it('parses multi-line blockquote as one block', () => {
                expect(ADOContent.parseMarkdown('&gt; line one\n&gt; line two\n')).toBe('<blockquote class="md-blockquote">line one\nline two</blockquote>');
            });

            it('breaks blockquote on empty line', () => {
                expect(ADOContent.parseMarkdown('&gt; first\n\n&gt; second\n')).toBe('<blockquote class="md-blockquote">first</blockquote><blockquote class="md-blockquote">second</blockquote>');
            });

            it('parses nested blockquotes', () => {
                expect(ADOContent.parseMarkdown('&gt; outer\n&gt; &gt; inner\n')).toBe('<blockquote class="md-blockquote">outer<blockquote class="md-blockquote">inner</blockquote></blockquote>');
            });

            it('processContent handles raw > input', () => {
                expect(ADOContent.processContent('> quoted')).toBe('<blockquote class="md-blockquote">quoted</blockquote>');
            });

            it('applies bold and italic inside blockquotes', () => {
                expect(ADOContent.processContent('> **bold** and *italic*')).toBe('<blockquote class="md-blockquote"><strong>bold</strong> and <em>italic</em></blockquote>');
            });

            it('lazy continuation: non-empty lines following > are in the same blockquote', () => {
                expect(ADOContent.parseMarkdown('&gt; quote line\ncontinuation here\n')).toBe('<blockquote class="md-blockquote">quote line\ncontinuation here</blockquote>');
            });

            it('empty line breaks lazy continuation', () => {
                expect(ADOContent.parseMarkdown('&gt; quote\ncontinues\n\nnot in quote\n')).toBe('<blockquote class="md-blockquote">quote\ncontinues</blockquote>not in quote\n');
            });

            it('empty line and backslash mix inside blockquote', () => {
                const result = ADOContent.parseMarkdown('&gt; quote\ncontinues\n\\\n    \\\n\\    \n\nnot in quote\n');
                // following a line in a blockquote, "\" gives an empty line inside the blockquote and continues the blockquote
                // following a line in a blockquote, "\ " gives a "\ " line inside the blockquote and continues the blockquote
                // following a line in a blockquote, " \" gives an empty line inside the blockquote and continues the blockquote
                // "not in quote" must be outside the blockquote
                const bqMatch = result.match(/<blockquote class="md-blockquote">quote\ncontinues\n\n\n\\    <\/blockquote>not in quote/);
                expect(bqMatch).not.toBeNull();
            });

            it('>:D at line start is an emoticon, not a blockquote', () => {
                const result = ADOContent.processContent('>:D great news\n');
                expect(result).toContain('😆');
                expect(result).not.toContain('<blockquote');
            });
        });

        describe('emoji shortcodes', () => {
            it('converts common shortcodes', () => {
                expect(ADOContent.parseMarkdown(':smile:')).toBe('😄');
                expect(ADOContent.parseMarkdown(':thumbsup:')).toBe('👍');
                expect(ADOContent.parseMarkdown(':+1:')).toBe('👍');
                expect(ADOContent.parseMarkdown(':fire:')).toBe('🔥');
                expect(ADOContent.parseMarkdown(':warning:')).toBe('⚠️');
                expect(ADOContent.parseMarkdown(':x:')).toBe('❌');
            });

            it('passes through unknown shortcodes unchanged', () => {
                expect(ADOContent.parseMarkdown(':notacode:')).toBe(':notacode:');
            });

            it('does not convert shortcode preceded by a word char', () => {
                const result = ADOContent.parseMarkdown('word:smile:');
                expect(result).not.toContain('😄');
                expect(result).toContain(':smile:');
            });

            it('does not convert shortcodes inside code spans', () => {
                const result = ADOContent.parseMarkdown('`:smile:`');
                expect(result).toContain('<code>:smile:</code>');
                expect(result).not.toContain('😄');
            });
        });

        describe('text emoticons', () => {
            it('converts :) and :-) to smile', () => {
                expect(ADOContent.parseMarkdown(':)')).toBe('😊');
                expect(ADOContent.parseMarkdown(':-)')).toBe('😊');
            });

            it('converts :D and :-D to big grin', () => {
                expect(ADOContent.parseMarkdown(':D')).toBe('😄');
                expect(ADOContent.parseMarkdown(':-D')).toBe('😄');
            });

            it('converts :( and :-( to sad', () => {
                expect(ADOContent.parseMarkdown(':(')).toBe('😞');
                expect(ADOContent.parseMarkdown(':-(')).toBe('😞');
            });

            it('converts :P to tongue', () => {
                expect(ADOContent.parseMarkdown(':P')).toBe('😛');
                expect(ADOContent.parseMarkdown(':p')).toBe('😛');
            });

            it('converts ;) to wink', () => {
                expect(ADOContent.parseMarkdown(';)')).toBe('😉');
            });

            it('converts :| to neutral', () => {
                expect(ADOContent.parseMarkdown(':|')).toBe('😐');
            });

            it("converts :'( to crying", () => {
                expect(ADOContent.parseMarkdown(":'(")).toBe('😢');
            });

            it('converts <3 to heart via processContent', () => {
                expect(ADOContent.processContent('<3')).toContain('❤️');
            });

            it('converts </3 to broken heart via processContent', () => {
                expect(ADOContent.processContent('</3')).toContain('💔');
            });

            it('converts >:D to evil grin via processContent', () => {
                expect(ADOContent.processContent('>:D')).toContain('😆');
            });

            it('does not convert :D preceded by a word char', () => {
                const result = ADOContent.parseMarkdown('x:D');
                expect(result).toContain(':D');
                expect(result).not.toContain('😄');
            });

            it('does not convert emoticons inside code spans', () => {
                const result = ADOContent.parseMarkdown('`:)`');
                expect(result).toContain('<code>');
                expect(result).not.toContain('😊');
            });

            it('converts XD to laughing emoji', () => {
                expect(ADOContent.parseMarkdown('XD')).toBe('😆');
            });
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
