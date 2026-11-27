import { money, shortDate } from "./format";
import { asNumber, asRecord } from "./guards";
import { getJson } from "./http";

export interface Budget {
	spend: number;
	limit?: number;
	resetsAt?: number;
}

/** LiteLLM management endpoints live at the proxy root, not under `/v1`. */
export function managementBaseUrl(baseUrl: string): string | undefined {
	try {
		const url = new URL(baseUrl);
		return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}`;
	} catch {
		return undefined;
	}
}

const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** LiteLLM sends `budget_reset_at` as a naive datetime; `Date.parse` alone would read it as local time. */
export function parseResetAt(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const iso = value.trim().replace(" ", "T");
	const parsed = Date.parse(NAIVE_DATETIME.test(iso) ? `${iso}Z` : iso);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Key budget wins over the user budget; either record must carry a spend figure. */
export function parseBudget(keyInfo: unknown, userInfo: unknown): Budget | undefined {
	const key = asRecord(keyInfo);
	const user = asRecord(userInfo);
	const spend = asNumber(key?.spend) ?? asNumber(user?.spend);
	if (spend === undefined) return undefined;
	return {
		spend,
		limit: asNumber(key?.max_budget) ?? asNumber(user?.max_budget),
		resetsAt: parseResetAt(key?.budget_reset_at) ?? parseResetAt(user?.budget_reset_at),
	};
}

export function formatBudget(provider: string, budget: Budget): string {
	const cap = budget.limit === undefined ? "" : `/${money(budget.limit)}`;
	const reset = budget.resetsAt === undefined ? "" : ` ↻${shortDate(budget.resetsAt)}`;
	return `${provider} $${budget.spend.toFixed(2)}${cap}${reset}`;
}

/**
 * Read the virtual key's budget from `/key/info`. `/key/info` takes the raw key
 * as `sk-…`; without that shape only the user budget (`/v2/user/info`) is read.
 */
export async function fetchBudget(
	provider: string,
	baseUrl: string,
	apiKey: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const base = managementBaseUrl(baseUrl);
	if (!base) return undefined;
	const [keyBody, userBody] = await Promise.all([
		apiKey.startsWith("sk-") ? getJson(`${base}/key/info`, apiKey, { signal }) : undefined,
		getJson(`${base}/v2/user/info`, apiKey, { signal }),
	]);
	const keyInfo = asRecord(keyBody?.info);
	const userInfo = asRecord(userBody?.user_info) ?? userBody;
	const budget = parseBudget(keyInfo, userInfo);
	return budget ? formatBudget(provider, budget) : undefined;
}
