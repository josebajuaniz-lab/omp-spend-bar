/** Narrow an unknown JSON value to plain objects before reading fields. */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>) // guard established: non-null, non-array object
		: undefined;
}

/** Numbers as JSON sends them: `250`, `"250"`, `"6.97"`. */
export function asNumber(value: unknown): number | undefined {
	const numeric = typeof value === "string" ? Number(value) : value;
	return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : undefined;
}
