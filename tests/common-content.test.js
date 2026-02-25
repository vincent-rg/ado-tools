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
            const result = ADOContent.parseMarkdown('use `console.log`');
            expect(result).toContain('<code>console.log</code>');
        });

        it('parses links', () => {
            const result = ADOContent.parseMarkdown('[text](http://example.com)');
            expect(result).toContain('href="http://example.com"');
            expect(result).toContain('>text</a>');
        });

        it('auto-links bare http URLs', () => {
            const result = ADOContent.parseMarkdown('see http://www.foo.com for details');
            expect(result).toContain('href="http://www.foo.com"');
            expect(result).toContain('>http://www.foo.com</a>');
        });

        it('auto-links bare https URLs', () => {
            const result = ADOContent.parseMarkdown('https://example.com/path?a=1');
            expect(result).toContain('href="https://example.com/path?a=1"');
        });

        it('auto-link strips trailing sentence punctuation', () => {
            const result = ADOContent.parseMarkdown('see http://foo.com.');
            expect(result).toContain('href="http://foo.com"');
            expect(result).not.toContain('href="http://foo.com."');
        });

        it('does not double-link markdown links', () => {
            const result = ADOContent.parseMarkdown('[text](http://example.com)');
            const count = (result.match(/<a /g) || []).length;
            expect(count).toBe(1);
        });

        it('parses headers', () => {
            const result = ADOContent.parseMarkdown('## Title\n');
            expect(result).toContain('<h2');
            expect(result).toContain('Title');
        });

        it('parses task list checkboxes', () => {
            const result = ADOContent.parseMarkdown('- [ ] todo\n- [x] done\n');
            expect(result).toContain('type="checkbox"');
            expect(result).toContain('checked');
        });

        it('parses checkboxes after a heading', () => {
            const result = ADOContent.parseMarkdown('### liste choix\n- [X] choix A\n- [ ] choix B\n');
            expect(result).toContain('<h3');
            expect(result).toContain('liste choix');
            expect(result).toContain('type="checkbox"');
            expect(result).toContain('choix A');
            expect(result).toContain('choix B');
        });

        it('parses bullet lists', () => {
            const result = ADOContent.parseMarkdown('- item1\n- item2\n');
            expect(result).toContain('<ul');
            expect(result).toContain('<li>item1</li>');
        });

        it('parses numbered lists', () => {
            const result = ADOContent.parseMarkdown('1. first\n2. second\n');
            expect(result).toContain('<ol');
            expect(result).toContain('<li>first</li>');
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

        it('handles backslash escapes', () => {
            const result = ADOContent.parseMarkdown('\\*not italic\\*');
            expect(result).not.toContain('<em>');
            expect(result).toContain('*not italic*');
        });

        it('parses code blocks', () => {
            const result = ADOContent.parseMarkdown('```js\nconst x = 1;\n```');
            expect(result).toContain('<pre><code>');
            expect(result).toContain('const x = 1;');
        });

        it('parses images', () => {
            const result = ADOContent.parseMarkdown('![alt](http://img.png)');
            expect(result).toContain('<img');
            expect(result).toContain('src="http://img.png"');
        });

        describe('blockquotes', () => {
            it('parses a simple blockquote', () => {
                const result = ADOContent.parseMarkdown('&gt; quoted text\n');
                expect(result).toContain('<blockquote');
                expect(result).toContain('quoted text');
            });

            it('parses multi-line blockquote as one block', () => {
                const result = ADOContent.parseMarkdown('&gt; line one\n&gt; line two\n');
                expect(result).toContain('line one');
                expect(result).toContain('line two');
                expect((result.match(/<blockquote/g) || []).length).toBe(1);
            });

            it('breaks blockquote on empty line', () => {
                const result = ADOContent.parseMarkdown('&gt; first\n\n&gt; second\n');
                expect((result.match(/<blockquote/g) || []).length).toBe(2);
            });

            it('parses nested blockquotes', () => {
                const result = ADOContent.parseMarkdown('&gt; outer\n&gt; &gt; inner\n');
                expect((result.match(/<blockquote/g) || []).length).toBe(2);
                expect(result).toContain('outer');
                expect(result).toContain('inner');
            });

            it('processContent handles raw > input', () => {
                const result = ADOContent.processContent('> quoted');
                expect(result).toContain('<blockquote');
                expect(result).toContain('quoted');
            });

            it('lazy continuation: non-empty lines following > are in the same blockquote', () => {
                const result = ADOContent.parseMarkdown('&gt; quote line\ncontinuation here\n');
                expect(result).toContain('<blockquote');
                expect(result).toContain('quote line');
                expect(result).toContain('continuation here');
                expect((result.match(/<blockquote/g) || []).length).toBe(1);
            });

            it('empty line breaks lazy continuation', () => {
                const result = ADOContent.parseMarkdown('&gt; quote\ncontinues\n\nnot in quote\n');
                expect(result).toContain('<blockquote');
                expect(result).toContain('quote');
                expect(result).toContain('continues');
                // "not in quote" must be outside the blockquote
                const bqMatch = result.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/);
                expect(bqMatch[1]).not.toContain('not in quote');
                expect(result).toContain('not in quote');
            });

            it('empty line and backslash mix inside blockquote', () => {
                const result = ADOContent.parseMarkdown('&gt; quote\ncontinues\n\\\n    \\\n\\    \n\nnot in quote\n');
                // following a line in a blockquote, "\" gives an empty line inside the blockquote and continues the blockquote
                // following a line in a blockquote, "\ " gives a "\ " line inside the blockquote and continues the blockquote
                // following a line in a blockquote, " \" gives an empty line inside the blockquote and continues the blockquote
                // "not in quote" must be outside the blockquote
                const bqMatch = result.match(/<blockquote[^>]*>quote\ncontinues\n\n\n\\    <\/blockquote>not in quote/);
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
