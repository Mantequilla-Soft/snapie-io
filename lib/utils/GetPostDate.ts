export function getPostDate(date: string | Date): string {
    const today = new Date();
    // Hive timestamps omit the trailing 'Z' — append it so the string is
    // parsed as UTC rather than local time, matching how the sidecar stores them.
    const normalized = typeof date === 'string' && !date.endsWith('Z') ? `${date}Z` : date;
    const created = new Date(normalized);
    if (isNaN(created.getTime())) return 'just now';

    const diffMs = today.getTime() - created.getTime(); // milliseconds between now & then
    const diffDays = Math.floor(diffMs / 86400000); // days
    const diffHrs = Math.floor(diffMs / 3600000); // hours
    const diffMins = Math.round(diffMs / 60000); // minutes

    let postCreated = "";

    if (diffMins < 60) {
        postCreated = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHrs < 24) {
        postCreated = `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
    } else if (diffDays < 31) {
        postCreated = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        postCreated = `${created.getDate()}/${created.getMonth() + 1}/${created.getFullYear()}`;
    }

    return postCreated;
}