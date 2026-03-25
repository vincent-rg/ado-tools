const SyntaxHighlight = (() => {
    const EXT_MAP = {
        c: 'c', h: 'c',
        cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
        py: 'python',
        ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
        xml: 'xml', xaml: 'xml', csproj: 'xml', props: 'xml', targets: 'xml', config: 'xml'
    };

    function highlight(rawCode, language) {
        if (!window.hljs) return ADOContent.escapeHtml(rawCode);
        try {
            const lang = hljs.getLanguage(language) ? language : null;
            if (!lang) return ADOContent.escapeHtml(rawCode);
            return hljs.highlight(rawCode, { language: lang }).value;
        } catch (e) {
            return ADOContent.escapeHtml(rawCode);
        }
    }

    // HTML-aware line splitter: closes open <span> tags at each \n, reopens on next line.
    // This preserves multi-line token context (e.g. block comments, multiline strings).
    function splitHighlightedLines(html) {
        const lines = [];
        let current = '';
        let openTags = [];
        let i = 0;
        while (i < html.length) {
            if (html[i] === '<') {
                const end = html.indexOf('>', i);
                const tag = html.slice(i, end + 1);
                if (tag.startsWith('</')) {
                    openTags.pop();
                } else if (!tag.endsWith('/>')) {
                    openTags.push(tag);
                }
                current += tag;
                i = end + 1;
            } else if (html[i] === '\n') {
                current += openTags.map(() => '</span>').join('');
                lines.push(current);
                current = openTags.join('');
                i++;
            } else {
                current += html[i++];
            }
        }
        if (current) lines.push(current);
        return lines;
    }

    // Returns array of per-line highlighted HTML strings, or null if language not supported.
    function highlightLines(rawCode, language) {
        if (!window.hljs || !language) return null;
        try {
            const lang = hljs.getLanguage(language) ? language : null;
            if (!lang) return null;
            const highlighted = hljs.highlight(rawCode, { language: lang }).value;
            return splitHighlightedLines(highlighted);
        } catch (e) {
            return null;
        }
    }

    function langFromPath(filePath) {
        if (!filePath) return null;
        const ext = filePath.split('.').pop().toLowerCase();
        return EXT_MAP[ext] || null;
    }

    return { highlight, highlightLines, langFromPath };
})();
