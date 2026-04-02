/**
 * pr-list-columns.js — Column resize, visibility, and dropdown management for PR list table.
 *
 * Globals read: columnWidths, columnVisibility, displayPRs
 * Globals written: columnWidths, columnVisibility
 */

// Column resize defaults
const DEFAULT_COLUMN_WIDTHS = {
    id: 80,
    title: null, // flexible
    author: 60,
    repository: 200,
    reviewers: 120,
    otherAuthors: 120,
    status: 100,
    updates: 70,
    comments: 90,
    created: 150
};

// Column visibility labels and hideable list
const COLUMN_LABELS = {
    id: 'ID',
    title: 'Title',
    author: 'Author',
    repository: 'Repository',
    reviewers: 'Reviewers',
    otherAuthors: 'Other Authors',
    status: 'Status',
    updates: '🔄',
    comments: '💬',
    created: 'Created'
};
const HIDEABLE_COLUMNS = ['title', 'author', 'repository', 'reviewers', 'otherAuthors', 'status', 'updates', 'comments', 'created'];

// Column resize functionality
function initColumnResize() {
    const resizeHandles = document.querySelectorAll('.column-resize-handle');

    resizeHandles.forEach(handle => {
        // Prevent click from triggering column sort
        handle.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Double-click to expand column to fill free space
        handle.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const columnId = handle.getAttribute('data-column');
            const th = handle.closest('th');
            const table = th.closest('table');
            const container = table.closest('.main-content');

            if (!container) return;

            // Calculate total width of all columns
            let totalColumnsWidth = 0;
            for (const width of Object.values(columnWidths)) {
                totalColumnsWidth += width || 0;
            }

            // Get available container width
            const containerWidth = container.clientWidth;

            // Calculate free space
            const freeSpace = containerWidth - totalColumnsWidth;

            // Only expand if there's free space
            if (freeSpace <= 0) return;

            // Calculate new width for this column
            const currentWidth = columnWidths[columnId] || th.offsetWidth;
            const newWidth = currentWidth + freeSpace;

            // Update the column width in state
            columnWidths[columnId] = newWidth;

            // Apply the new width
            th.style.width = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';
            th.style.maxWidth = newWidth + 'px';

            // Update all td cells in this column
            const columnIndex = Array.from(th.parentElement.children).indexOf(th);
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cell = row.children[columnIndex];
                if (cell) {
                    cell.style.width = newWidth + 'px';
                    cell.style.minWidth = newWidth + 'px';
                    cell.style.maxWidth = newWidth + 'px';
                }
            });

            // Update table width and save
            updateTableWidth(table);
            saveColumnWidths();
        });

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent sorting when clicking resize handle

            const columnId = handle.getAttribute('data-column');
            const th = handle.closest('th');
            const startX = e.clientX;
            const startWidth = th.offsetWidth;
            let dragged = false;

            // Add resizing class
            document.body.classList.add('column-resizing');
            th.classList.add('resizing');

            const onMouseMove = (e) => {
                dragged = true;
                const delta = e.clientX - startX;
                const newWidth = Math.max(50, startWidth + delta); // Minimum 50px

                // Update the column width in state
                columnWidths[columnId] = newWidth;

                // Apply the new width immediately
                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px';
                th.style.maxWidth = newWidth + 'px';

                // Also update all td cells in this column
                const table = th.closest('table');
                const columnIndex = Array.from(th.parentElement.children).indexOf(th);
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cell = row.children[columnIndex];
                    if (cell) {
                        cell.style.width = newWidth + 'px';
                        cell.style.minWidth = newWidth + 'px';
                        cell.style.maxWidth = newWidth + 'px';
                    }
                });

                // Update table width to prevent other columns from expanding
                updateTableWidth(table);
            };

            const onMouseUp = () => {
                document.body.classList.remove('column-resizing');
                th.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // After a drag, suppress the click event that fires on the th
                // (which would trigger sorting). Use capture phase to intercept
                // before the th's onclick handler.
                if (dragged) {
                    const suppressClick = (e) => {
                        e.stopPropagation();
                        document.removeEventListener('click', suppressClick, true);
                    };
                    document.addEventListener('click', suppressClick, true);
                }

                // Save column widths to localStorage
                saveColumnWidths();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

function updateTableWidth(table) {
    let total = 0;
    let hasFlexColumn = false;
    for (const [columnId, width] of Object.entries(columnWidths)) {
        if (width === null) {
            hasFlexColumn = true;
            total += 300; // Default width for flexible columns
        } else {
            total += width;
        }
    }

    if (hasFlexColumn) {
        table.style.minWidth = total + 'px';
        table.style.width = '100%';
    } else {
        table.style.width = total + 'px';
        table.style.minWidth = '';
    }
}

function saveColumnWidths() {
    try {
        localStorage.setItem('prListColumnWidths', JSON.stringify(columnWidths));
    } catch (e) {
        console.warn('Failed to save column widths to localStorage:', e);
    }
}

function loadColumnWidths() {
    try {
        const saved = localStorage.getItem('prListColumnWidths');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults (in case new columns were added)
            columnWidths = { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load column widths from localStorage:', e);
        columnWidths = { ...DEFAULT_COLUMN_WIDTHS };
    }
}

function saveColumnVisibility() {
    try {
        localStorage.setItem('prListColumnVisibility', JSON.stringify(columnVisibility));
    } catch (e) {
        console.warn('Failed to save column visibility to localStorage:', e);
    }
}

function loadColumnVisibility() {
    try {
        const saved = localStorage.getItem('prListColumnVisibility');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults (all visible)
            columnVisibility = { ...columnVisibility, ...parsed };
            // Ensure id is always visible
            columnVisibility.id = true;
        }
    } catch (e) {
        console.warn('Failed to load column visibility from localStorage:', e);
    }
}

function toggleColumnVisibility(columnId) {
    if (columnId === 'id') return; // Cannot hide ID column
    columnVisibility[columnId] = !columnVisibility[columnId];
    saveColumnVisibility();
    updateColumnVisibilityUI();
    displayPRs();
}

function updateColumnVisibilityUI() {
    HIDEABLE_COLUMNS.forEach(col => {
        const checkbox = document.getElementById(`col-vis-${col}`);
        if (checkbox) {
            checkbox.checked = columnVisibility[col];
        }
    });
}

function toggleColumnsDropdown(event) {
    event.stopPropagation();
    const menu = document.getElementById('columnsDropdownMenu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const menu = document.getElementById('columnsDropdownMenu');
    if (menu && !event.target.closest('.columns-dropdown')) {
        menu.classList.remove('show');
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEFAULT_COLUMN_WIDTHS, COLUMN_LABELS, HIDEABLE_COLUMNS, saveColumnWidths, loadColumnWidths, saveColumnVisibility, loadColumnVisibility, toggleColumnVisibility, updateTableWidth };
}
