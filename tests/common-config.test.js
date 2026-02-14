import { describe, it, expect, beforeEach } from 'vitest';
import { ADOConfig } from '../common.js';

// Minimal localStorage mock
const store = {};
globalThis.localStorage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
};

describe('ADOConfig', () => {
    beforeEach(() => {
        for (const key of Object.keys(store)) delete store[key];
    });

    describe('isValid', () => {
        it('returns truthy when all required fields are present', () => {
            expect(ADOConfig.isValid({
                serverUrl: 'https://dev.azure.com',
                organization: 'org',
                project: 'proj',
                pat: 'token',
            })).toBeTruthy();
        });

        it('returns falsy when serverUrl is missing', () => {
            expect(ADOConfig.isValid({ organization: 'org', project: 'proj', pat: 'token' })).toBeFalsy();
        });

        it('returns falsy for null', () => {
            expect(ADOConfig.isValid(null)).toBeFalsy();
        });

        it('returns falsy for empty object', () => {
            expect(ADOConfig.isValid({})).toBeFalsy();
        });
    });

    describe('save / get / clear', () => {
        const config = {
            serverUrl: 'https://dev.azure.com',
            organization: 'org',
            project: 'proj',
            repository: 'repo',
            pat: 'token',
        };

        it('saves and retrieves config', () => {
            ADOConfig.save(config);
            const result = ADOConfig.get();
            expect(result).toEqual(config);
        });

        it('returns null when nothing saved', () => {
            expect(ADOConfig.get()).toBeNull();
        });

        it('clears config', () => {
            ADOConfig.save(config);
            ADOConfig.clear();
            expect(ADOConfig.get()).toBeNull();
        });
    });
});
