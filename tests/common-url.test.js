import { describe, it, expect } from 'vitest';
import { ADOURL } from '../common.js';

const config = {
    serverUrl: 'https://dev.azure.com',
    organization: 'myorg',
    project: 'myproj',
    repository: 'myrepo',
};

describe('ADOURL', () => {
    describe('buildPRUrl', () => {
        it('builds overview URL by default', () => {
            const url = ADOURL.buildPRUrl(config, 42);
            expect(url).toBe('https://dev.azure.com/myorg/myproj/_git/myrepo/pullrequest/42?_a=overview');
        });

        it('builds files tab URL', () => {
            const url = ADOURL.buildPRUrl(config, 42, 'files');
            expect(url).toBe('https://dev.azure.com/myorg/myproj/_git/myrepo/pullrequest/42?_a=files');
        });
    });

    describe('buildThreadUrl', () => {
        it('builds overview thread URL when no filePath', () => {
            const url = ADOURL.buildThreadUrl(config, 42, 100);
            expect(url).toContain('_a=overview');
            expect(url).toContain('discussionId=100');
        });

        it('builds files thread URL with filePath', () => {
            const url = ADOURL.buildThreadUrl(config, 42, 100, '/src/file.js');
            expect(url).toContain('_a=files');
            expect(url).toContain('path=%2Fsrc%2Ffile.js');
            expect(url).toContain('discussionId=100');
        });
    });
});
