/**
 * pr-list-display.js — Pure display helpers extracted from displayPRs() in ado-pr-list.html.
 *
 * All functions are pure (no DOM access, no global mutation) and testable.
 */

const PRListDisplay = {
    /**
     * Build sort indicator arrow for a column header.
     * @param {string} column - Column being checked
     * @param {string} currentSort - Currently sorted column
     * @param {string} currentOrder - 'asc' or 'desc'
     * @returns {string} HTML span with arrow or empty string
     */
    getSortIndicator(column, currentSort, currentOrder) {
        if (currentSort === column) {
            return `<span class="sort-indicator">${currentOrder === 'asc' ? '\u2191' : '\u2193'}</span>`;
        }
        return '';
    },

    /**
     * Build inline style string for a column's fixed width.
     * @param {string} columnId
     * @param {object} columnWidths - Map of columnId -> width (px) or null
     * @returns {string} CSS style string
     */
    getColumnStyle(columnId, columnWidths) {
        const width = columnWidths[columnId];
        return width ? `width: ${width}px; min-width: ${width}px; max-width: ${width}px;` : '';
    },

    /**
     * Calculate total table width style from visible columns.
     * @param {object} columnWidths - Map of columnId -> width (px) or null
     * @param {object} columnVisibility - Map of columnId -> boolean
     * @returns {string} CSS style string for table width
     */
    calculateTableWidth(columnWidths, columnVisibility) {
        let total = 0;
        let hasFlexColumn = false;
        for (const [columnId, width] of Object.entries(columnWidths)) {
            if (!columnVisibility[columnId]) continue;
            if (width === null) {
                hasFlexColumn = true;
                total += 300;
            } else {
                total += width;
            }
        }
        return hasFlexColumn ? `min-width: ${total}px; width: 100%;` : `width: ${total}px;`;
    },

    /**
     * Build HTML for the comment count cell.
     * @param {string} prKey - PR key (project/repoId/prId)
     * @param {object} prCommentCounts - Cache of comment counts
     * @returns {string} HTML string
     */
    buildCommentDisplay(prKey, prCommentCounts) {
        if (prCommentCounts[prKey] === undefined) {
            return '<span style="color: #8a8886;">-</span>';
        }
        const entry = prCommentCounts[prKey];
        const count = entry.count !== undefined ? entry.count : entry;
        if (count > 0) {
            return `<span style="color: #d13438; font-weight: 600;">${count}</span>`;
        }
        return '<span style="color: #8a8886;">0</span>';
    },

    /**
     * Build HTML for the updates (iterations) count cell.
     * @param {string} prKey - PR key
     * @param {object} prIterationCounts - Cache of iteration counts
     * @returns {string} HTML string
     */
    buildUpdatesDisplay(prKey, prIterationCounts) {
        if (prIterationCounts[prKey] === undefined) {
            return '<span style="color: #8a8886;">-</span>';
        }
        const count = prIterationCounts[prKey].count;
        return count > 1
            ? `<span style="color: #0078d4; font-weight: 600;">${count}</span>`
            : `<span style="color: #8a8886;">${count}</span>`;
    },

    /**
     * Build HTML for the info bar (showing count, columns dropdown, per-page selector).
     * @param {object} params
     * @param {number} params.startIndex - 0-based start index
     * @param {number} params.endIndex - 0-based end index (exclusive)
     * @param {number} params.totalPRs - Total filtered PR count
     * @param {number} params.allPRsCount - Total unfiltered PR count
     * @param {number} params.itemsPerPage - Current items per page
     * @param {string} params.columnsDropdownHtml - Pre-built dropdown content
     * @returns {string} HTML string
     */
    buildInfoBarHtml({ startIndex, endIndex, totalPRs, allPRsCount, itemsPerPage, columnsDropdownHtml }) {
        const filterNote = totalPRs !== allPRsCount ? ` (filtered from ${allPRsCount} total)` : '';
        return `
            <span>Showing ${startIndex + 1}-${endIndex} of ${totalPRs} Pull Requests${filterNote}</span>
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="columns-dropdown">
                    <button class="columns-dropdown-btn" onclick="toggleColumnsDropdown(event)">Columns \u25be</button>
                    <div id="columnsDropdownMenu" class="columns-dropdown-menu">
                        ${columnsDropdownHtml}
                    </div>
                </div>
                <label style="font-size: 14px;"><span>Show:</span><select onchange="changePerPage(this.value)" style="padding: 4px 8px; border: 1px solid #d1d1d1; border-radius: 0; background: white;"><option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option><option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option><option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100</option></select><span>per page</span></label>
            </div>
        `;
    },

    /**
     * Build pagination controls HTML.
     * @param {number} currentPage - 1-based current page
     * @param {number} totalPages - Total number of pages
     * @returns {string} HTML string (empty if totalPages <= 1)
     */
    buildPaginationHtml(currentPage, totalPages) {
        if (totalPages <= 1) return '';

        let html = '';

        // Previous button
        if (currentPage > 1) {
            html += `<button onclick="changePage(${currentPage - 1})" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #0078d4;">\u2190 Previous</button>`;
        } else {
            html += `<button disabled style="padding: 8px 12px; background: #f9f8f7; border: 1px solid #d1d1d1; border-radius: 0; cursor: not-allowed; color: #8a8886;">\u2190 Previous</button>`;
        }

        // Page numbers
        html += '<div style="display: flex; gap: 5px;">';

        const maxVisiblePages = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // First page + ellipsis
        if (startPage > 1) {
            html += `<button onclick="changePage(1)" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #0078d4; font-weight: 500; min-width: 40px;">1</button>`;
            if (startPage > 2) {
                html += `<span style="padding: 8px 4px; color: #8a8886;">...</span>`;
                const middlePage = Math.round((1 + startPage) / 2);
                if (middlePage > 1 && middlePage < startPage) {
                    html += `<button onclick="changePage(${middlePage})" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #323130; min-width: 40px;">${middlePage}</button>`;
                    html += `<span style="padding: 8px 4px; color: #8a8886;">...</span>`;
                }
            }
        }

        // Page number buttons
        for (let i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                html += `<button disabled style="padding: 8px 12px; background: #0078d4; border: 1px solid #0078d4; border-radius: 0; color: white; font-weight: 600; min-width: 40px;">${i}</button>`;
            } else {
                html += `<button onclick="changePage(${i})" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #323130; min-width: 40px;">${i}</button>`;
            }
        }

        // Ellipsis + last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<span style="padding: 8px 4px; color: #8a8886;">...</span>`;
                const middlePage = Math.round((endPage + totalPages) / 2);
                if (middlePage > endPage && middlePage < totalPages) {
                    html += `<button onclick="changePage(${middlePage})" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #323130; min-width: 40px;">${middlePage}</button>`;
                    html += `<span style="padding: 8px 4px; color: #8a8886;">...</span>`;
                }
            }
            html += `<button onclick="changePage(${totalPages})" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #0078d4; font-weight: 500; min-width: 40px;">${totalPages}</button>`;
        }

        html += '</div>';

        // Next button
        if (currentPage < totalPages) {
            html += `<button onclick="changePage(${currentPage + 1})" style="padding: 8px 12px; background: white; border: 1px solid #d1d1d1; border-radius: 0; cursor: pointer; color: #0078d4;">Next \u2192</button>`;
        } else {
            html += `<button disabled style="padding: 8px 12px; background: #f9f8f7; border: 1px solid #d1d1d1; border-radius: 0; cursor: not-allowed; color: #8a8886;">Next \u2192</button>`;
        }

        return html;
    },

    /**
     * Clamp currentPage to valid bounds. Returns the clamped value.
     * @param {number} currentPage
     * @param {number} totalPages
     * @returns {number}
     */
    clampPage(currentPage, totalPages) {
        if (totalPages <= 0) return 1;
        if (currentPage > totalPages) return totalPages;
        if (currentPage < 1) return 1;
        return currentPage;
    },

    /**
     * Compute pagination slice indices.
     * @param {number} currentPage - 1-based
     * @param {number} itemsPerPage
     * @param {number} totalItems
     * @returns {{ startIndex: number, endIndex: number }}
     */
    getPageSlice(currentPage, itemsPerPage, totalItems) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        return { startIndex, endIndex };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PRListDisplay };
}
