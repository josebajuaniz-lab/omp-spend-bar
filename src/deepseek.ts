import { money } from "./format";
import { asNumber, asRecord } from "./guards";
import { getJson } from "./http";

export const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

/** Exact host match: a proxy or a look-alike domain is not the DeepSeek API. */
export function isDeepSeekHost(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		return new URL(baseUrl).host === "api.deepseek.com";
	} catch {
		return false;
	}
}

/** The USD entry of `balance_infos`; other currencies are ignored. */
export function parseBalance(body: unknown): number | undefined {
	const infos = asRecord(body)?.balance_infos;
	if (!Array.isArray(infos)) return undefined;
	for (const entry of infos) {
		const info = asRecord(entry);
		if (info?.currency !== "USD") continue;
		return asNumber(info.total_balance);
	}
	return undefined;
}

export async function fetchBalance(
	apiKey: string,
	options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<number | undefined> {
	return parseBalance(await getJson(DEEPSEEK_BALANCE_URL, apiKey, options));
}

export function formatBalance(provider: string, left: number): string {
	return `${provider} ${money(left)} left`;
}
