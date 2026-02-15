import { describe, it, expect } from 'vitest';
import { MentionUtils } from '../mention-utils.js';

describe('MentionUtils', () => {
    describe('getMentionContext', () => {
        it('detects @ at start of text', () => {
            const result = MentionUtils.getMentionContext('@john', 5);
            expect(result).toEqual({ query: 'john', mentionStart: 0 });
        });

        it('detects @ after space', () => {
            const result = MentionUtils.getMentionContext('hello @jane', 11);
            expect(result).toEqual({ query: 'jane', mentionStart: 6 });
        });

        it('detects @ after newline', () => {
            const result = MentionUtils.getMentionContext('line1\n@bob', 10);
            expect(result).toEqual({ query: 'bob', mentionStart: 6 });
        });

        it('returns null when no @ present', () => {
            expect(MentionUtils.getMentionContext('hello world', 11)).toBeNull();
        });

        it('returns null when @ is mid-word (no preceding whitespace)', () => {
            expect(MentionUtils.getMentionContext('email@test', 10)).toBeNull();
        });

        it('detects @ with empty query (just typed @)', () => {
            const result = MentionUtils.getMentionContext('hello @', 7);
            expect(result).toEqual({ query: '', mentionStart: 6 });
        });

        it('detects @ with partial query', () => {
            const result = MentionUtils.getMentionContext('cc @jo', 6);
            expect(result).toEqual({ query: 'jo', mentionStart: 3 });
        });

        it('uses cursor position, ignoring text after cursor', () => {
            const result = MentionUtils.getMentionContext('@john some more text', 5);
            expect(result).toEqual({ query: 'john', mentionStart: 0 });
        });

        it('returns null when cursor is before @', () => {
            expect(MentionUtils.getMentionContext('hello @john', 3)).toBeNull();
        });

        it('detects @ after tab character', () => {
            const result = MentionUtils.getMentionContext('\t@tab', 5);
            expect(result).toEqual({ query: 'tab', mentionStart: 1 });
        });

        it('handles multiple @ signs, picks the last one', () => {
            const result = MentionUtils.getMentionContext('@first then @second', 19);
            expect(result).toEqual({ query: 'second', mentionStart: 12 });
        });

        it('returns null at cursor position 0', () => {
            expect(MentionUtils.getMentionContext('', 0)).toBeNull();
        });

        it('detects @ at very start with cursor right after @', () => {
            const result = MentionUtils.getMentionContext('@', 1);
            expect(result).toEqual({ query: '', mentionStart: 0 });
        });
    });

    describe('buildMentionText', () => {
        it('inserts @<DisplayName> in place of @query', () => {
            const result = MentionUtils.buildMentionText('hello @john', 11, 6, 'John Doe');
            expect(result.text).toBe('hello @<John Doe> ');
            expect(result.cursorPos).toBe(18);
        });

        it('preserves text after cursor', () => {
            const result = MentionUtils.buildMentionText('hello @jo world', 9, 6, 'Jo Smith');
            expect(result.text).toBe('hello @<Jo Smith>  world');
        });

        it('works at start of text', () => {
            const result = MentionUtils.buildMentionText('@user', 5, 0, 'User Name');
            expect(result.text).toBe('@<User Name> ');
            expect(result.cursorPos).toBe(13);
        });

        it('positions cursor after trailing space', () => {
            const result = MentionUtils.buildMentionText('@x', 2, 0, 'Xi');
            expect(result.cursorPos).toBe(6); // @<Xi> + space
            expect(result.text[result.cursorPos - 1]).toBe(' ');
        });

        it('handles empty query (just @)', () => {
            const result = MentionUtils.buildMentionText('test @', 6, 5, 'Bob');
            expect(result.text).toBe('test @<Bob> ');
        });
    });

    describe('resolveDisplayMentions', () => {
        it('replaces @<DisplayName> with @<id> format', () => {
            const mentionMap = new Map([['John Doe', 'abc-123']]);
            const result = MentionUtils.resolveDisplayMentions('hello @<John Doe> world', mentionMap);
            expect(result).toBe('hello @<abc-123> world');
        });

        it('handles multiple mentions', () => {
            const mentionMap = new Map([['Alice', 'id-1'], ['Bob', 'id-2']]);
            const result = MentionUtils.resolveDisplayMentions('@<Alice> and @<Bob>', mentionMap);
            expect(result).toBe('@<id-1> and @<id-2>');
        });

        it('returns text unchanged when mentionMap is empty', () => {
            expect(MentionUtils.resolveDisplayMentions('hello @<world>', new Map())).toBe('hello @<world>');
        });

        it('returns text unchanged when mentionMap is null', () => {
            expect(MentionUtils.resolveDisplayMentions('hello @<world>', null)).toBe('hello @<world>');
        });

        it('handles mention at start of text', () => {
            const mentionMap = new Map([['Jane', 'id-j']]);
            expect(MentionUtils.resolveDisplayMentions('@<Jane> please review', mentionMap)).toBe('@<id-j> please review');
        });

        it('handles mention at end of text', () => {
            const mentionMap = new Map([['Jane', 'id-j']]);
            expect(MentionUtils.resolveDisplayMentions('cc @<Jane>', mentionMap)).toBe('cc @<id-j>');
        });

        it('handles mention after newline', () => {
            const mentionMap = new Map([['Jane', 'id-j']]);
            expect(MentionUtils.resolveDisplayMentions('line1\n@<Jane> line2', mentionMap)).toBe('line1\n@<id-j> line2');
        });

        it('replaces longer names first to avoid conflicts', () => {
            const mentionMap = new Map([['Bob', 'id-b'], ['Bob Smith', 'id-bs']]);
            const result = MentionUtils.resolveDisplayMentions('@<Bob Smith> and @<Bob>', mentionMap);
            expect(result).toBe('@<id-bs> and @<id-b>');
        });

        it('handles same mention appearing multiple times', () => {
            const mentionMap = new Map([['Jane', 'id-j']]);
            expect(MentionUtils.resolveDisplayMentions('@<Jane> and @<Jane>', mentionMap)).toBe('@<id-j> and @<id-j>');
        });
    });

    describe('resolveIdsToNames', () => {
        it('replaces @<guid> with @<DisplayName>', () => {
            const cache = { '7e301b9f-8667-4dde-8f1c-aaac59dcdcd8': 'John Doe' };
            const result = MentionUtils.resolveIdsToNames('hello @<7e301b9f-8667-4dde-8f1c-aaac59dcdcd8> world', cache);
            expect(result.text).toBe('hello @<John Doe> world');
            expect(result.mentionMap.get('John Doe')).toBe('7e301b9f-8667-4dde-8f1c-aaac59dcdcd8');
        });

        it('handles uppercase GUIDs', () => {
            const cache = { '7E301B9F-8667-4DDE-8F1C-AAAC59DCDCD8': 'Jane' };
            const result = MentionUtils.resolveIdsToNames('@<7E301B9F-8667-4DDE-8F1C-AAAC59DCDCD8>', cache);
            expect(result.text).toBe('@<Jane>');
            expect(result.mentionMap.get('Jane')).toBe('7E301B9F-8667-4DDE-8F1C-AAAC59DCDCD8');
        });

        it('leaves unresolved IDs as-is', () => {
            const cache = {};
            const result = MentionUtils.resolveIdsToNames('@<7e301b9f-8667-4dde-8f1c-aaac59dcdcd8>', cache);
            expect(result.text).toBe('@<7e301b9f-8667-4dde-8f1c-aaac59dcdcd8>');
            expect(result.mentionMap.size).toBe(0);
        });

        it('handles multiple mentions', () => {
            const cache = {
                'aaaa1111-2222-3333-4444-555566667777': 'Alice',
                'bbbb1111-2222-3333-4444-555566667777': 'Bob'
            };
            const result = MentionUtils.resolveIdsToNames(
                '@<aaaa1111-2222-3333-4444-555566667777> and @<bbbb1111-2222-3333-4444-555566667777>',
                cache
            );
            expect(result.text).toBe('@<Alice> and @<Bob>');
            expect(result.mentionMap.size).toBe(2);
        });

        it('returns empty mentionMap for text without mentions', () => {
            const result = MentionUtils.resolveIdsToNames('no mentions here', {});
            expect(result.text).toBe('no mentions here');
            expect(result.mentionMap.size).toBe(0);
        });

        it('handles null/empty text', () => {
            expect(MentionUtils.resolveIdsToNames('', {}).text).toBe('');
            expect(MentionUtils.resolveIdsToNames(null, {}).text).toBe('');
        });

        it('handles null cache', () => {
            const result = MentionUtils.resolveIdsToNames('@<aaaa1111-2222-3333-4444-555566667777>', null);
            expect(result.text).toBe('@<aaaa1111-2222-3333-4444-555566667777>');
        });

        it('round-trips correctly with resolveDisplayMentions', () => {
            const cache = { 'aaaa1111-2222-3333-4444-555566667777': 'John Doe' };
            const original = 'hello @<aaaa1111-2222-3333-4444-555566667777> world';
            const resolved = MentionUtils.resolveIdsToNames(original, cache);
            const backToIds = MentionUtils.resolveDisplayMentions(resolved.text, resolved.mentionMap);
            expect(backToIds).toBe(original);
        });
    });
});
