import { describe, it, expect } from 'vitest';
import { ADOSearch } from '../common.js';

describe('ADOSearch', () => {
    describe('normalize', () => {
        it('strips accents from common characters', () => {
            expect(ADOSearch.normalize('café')).toBe('cafe');
            expect(ADOSearch.normalize('über')).toBe('uber');
            expect(ADOSearch.normalize('naïve')).toBe('naive');
            expect(ADOSearch.normalize('résumé')).toBe('resume');
        });

        it('lowercases text', () => {
            expect(ADOSearch.normalize('Hello World')).toBe('hello world');
        });

        it('handles combined accent + case', () => {
            expect(ADOSearch.normalize('Ëlève')).toBe('eleve');
        });

        it('leaves ASCII text unchanged (after lowering)', () => {
            expect(ADOSearch.normalize('abc123')).toBe('abc123');
        });

        it('handles empty string', () => {
            expect(ADOSearch.normalize('')).toBe('');
        });
    });
});
