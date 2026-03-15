/**
 * Escape special regex characters in user input to prevent ReDoS.
 * Use before passing search strings to $regex queries.
 */
export function escapeRegex(str: string): string {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
