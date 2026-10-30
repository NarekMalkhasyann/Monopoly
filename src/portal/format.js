// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"; turn it into a local date string.
export function fmtDate(s) {
	if (!s) return '';
	const d = new Date(String(s).replace(' ', 'T') + 'Z');
	return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
