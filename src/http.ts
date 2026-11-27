import { asRecord } from "./guards";

/** Every network read is bounded: an extension handler that throws is an uncaughtException. */
export const REQUEST_TIMEOUT_MS = 10_000;

interface Deadline {
	signal: AbortSignal;
	done: () => void;
}

function withDeadline(timeoutMs: number, upstream?: AbortSignal): Deadline {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
	const relay = () => controller.abort(upstream?.reason);
	upstream?.addEventListener("abort", relay, { once: true });
	return {
		signal: controller.signal,
		done: () => {
			clearTimeout(timer);
			upstream?.removeEventListener("abort", relay);
		},
	};
}

/**
 * GET `url` and return the JSON object body, or `undefined` for any failure
 * (non-2xx, timeout, transport error, non-object JSON). Never throws.
 */
export async function getJson(
	url: string,
	apiKey: string | undefined,
	options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<Record<string, unknown> | undefined> {
	const doFetch = options.fetchImpl ?? fetch;
	const deadline = withDeadline(REQUEST_TIMEOUT_MS, options.signal);
	try {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
		const response = await doFetch(url, { headers, signal: deadline.signal });
		if (!response.ok) return undefined;
		const body: unknown = await response.json();
		return asRecord(body);
	} catch {
		return undefined;
	} finally {
		deadline.done();
	}
}
