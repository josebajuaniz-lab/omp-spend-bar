/** `$250` for whole dollars, `$6.94` otherwise. */
export function money(value: number): string {
	return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/** `Dec 1` for an epoch-ms instant; UTC so the label does not drift with the local clock. */
export function shortDate(epochMs: number): string {
	return new Date(epochMs).toLocaleDateString("en-US", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}
