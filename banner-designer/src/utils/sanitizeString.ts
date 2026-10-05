export function sanitizeString(input: string) {
    // Remove special characters using a regex and replace spaces with hyphens
    return input
        .replace(/\-+/g, ' ')      // Replace hypens with whitespace
        .replace(/[^\w\s]/gi, '')  // Remove special characters
        .replace(/\s+/g, '-')      // Replace whitespace with hyphens
        .toLowerCase();            // Convert to lowercase (optional)
}