/**
 * @mention autocomplete utilities (pure functions for testability)
 */
const MentionUtils = {
    /**
     * Detect @mention context at cursor position in a text value.
     * Returns { query, mentionStart } or null if no mention is being typed.
     * The @ must be preceded by whitespace/newline or be at position 0.
     */
    getMentionContext(text, cursorPos) {
        const beforeCursor = text.substring(0, cursorPos);
        const match = beforeCursor.match(/(^|[\s\n])@([^\s]*)$/);
        if (!match) return null;
        const query = match[2];
        const mentionStart = cursorPos - query.length - 1; // position of @
        return { query, mentionStart };
    },

    /**
     * Build the new text value after inserting a mention.
     * Uses displayName in the text for readability; resolveDisplayMentions converts back on submit.
     * Returns { text, cursorPos } with the updated text and new cursor position.
     */
    buildMentionText(text, cursorPos, mentionStart, displayName) {
        const before = text.substring(0, mentionStart);
        const after = text.substring(cursorPos);
        const mention = `@<${displayName}> `;
        return {
            text: before + mention + after,
            cursorPos: mentionStart + mention.length
        };
    },

    /**
     * Replace @<DisplayName> occurrences with @<id> format for API submission.
     * mentionMap is a Map<displayName, localId>.
     * Longer names are replaced first to avoid partial matches.
     */
    resolveDisplayMentions(text, mentionMap) {
        if (!mentionMap || mentionMap.size === 0) return text;
        // Sort by name length descending to avoid partial replacements
        const entries = [...mentionMap.entries()].sort((a, b) => b[0].length - a[0].length);
        let result = text;
        for (const [displayName, localId] of entries) {
            const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@<${escaped}>`, 'g');
            result = result.replace(regex, `@<${localId}>`);
        }
        return result;
    },

    /**
     * Replace @<id> (GUIDs) with @<DisplayName> for display in textareas during editing.
     * identityCache is an object { id: displayName }.
     * Returns { text, mentionMap } where mentionMap is a Map<displayName, id> for round-tripping.
     */
    resolveIdsToNames(text, identityCache) {
        const mentionMap = new Map();
        if (!text || !identityCache) return { text: text || '', mentionMap };
        const resolved = text.replace(/@<([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi, (match, id) => {
            const displayName = identityCache[id];
            if (displayName) {
                mentionMap.set(displayName, id);
                return `@<${displayName}>`;
            }
            return match;
        });
        return { text: resolved, mentionMap };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MentionUtils };
}
