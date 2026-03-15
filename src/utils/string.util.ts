/**
 * Shared string utilities for safe handling of user input in queries and output.
 */

/**
 * Escapes special regex characters in a string for safe use in MongoDB $regex or RegExp.
 * Prevents ReDoS and injection when building dynamic regex from user input.
 */
export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escapes HTML special characters to prevent XSS when rendering user content.
 */
export function escapeHtml(value: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return value.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}
