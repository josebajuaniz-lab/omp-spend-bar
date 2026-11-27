import { money } from "./format";
import { asNumber, asRecord } from "./guards";
import { getJson } from "./http";
import { readPluginSetting } from "./settings";

export const OPENAI_API_BASE = "https://api.openai.com";

/** Exact host match: a proxy registered as `openai` is not the OpenAI platform. */
export function isOpenAIApiHost(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		return new URL(baseUrl).host === "api.openai.com";
	} catch {
		return false;
	}
}

/** First instant of the current UTC month, in the epoch seconds `/organization/costs` takes. */
export function monthStartSeconds(now: number = Date.now()): number {
	const date = new Date(now);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
}

/** `total_available` from the legacy `/dashboard/billing/credit_grants` body. */
export function parseCreditGrants(body: unknown): number | undefined {
	return asNumber(asRecord(body)?.total_available);
}

/** Sum the USD `amount.value` of every result in a `/organization/costs` page. */
export function parseCosts(body: unknown): number | undefined {
	const data = asRecord(body)?.data;
	if (!Array.isArray(data)) return undefined;
	let total = 0;
	for (const bucket of data) {
		const results = asRecord(bucket)?.results;
		if (!Array.isArray(results)) continue;
		for (const entry of results) {
			const amount = asRecord(asRecord(entry)?.amount);
			const currency = amount?.currency;
			if (typeof currency === "string" && currency.toLowerCase() !== "usd") continue;
			total += asNumber(amount?.value) ?? 0;
		}
	}
	return total;
}

/**
 * Month-to-date spend from the Administration API. Needs an Admin key (or a key
 * with `api.usage.read`); a project key is rejected with 403 and yields nothing.
 */
export async function fetchMonthSpend(apiKey: string, signal?: AbortSignal): Promise<number | undefined> {
	let page: string | undefined;
	let total: number | undefined;
	for (let request = 0; request < 7; request++) {
		const query = new URLSearchParams({
			start_time: String(monthStartSeconds()),
			bucket_width: "1d",
			limit: "31",
		});
		if (page) query.set("page", page);
		const body = await getJson(`${OPENAI_API_BASE}/v1/organization/costs?${query}`, apiKey, { signal });
		const spent = parseCosts(body);
		if (spent === undefined) return total;
		total = (total ?? 0) + spent;
		const next = asRecord(body)?.next_page;
		if (typeof next !== "string" || next === "") return total;
		page = next;
	}
	return total;
}

/**
 * Balance is only exposed by the undocumented `/dashboard/billing/credit_grants`,
 * which accepts a browser session token or a legacy user key — never a project
 * key. Spend is the only figure an Admin key can read for a project-key account.
 */
export async function fetchOpenAIText(
	provider: string,
	apiKey: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const session = process.env.OPENAI_SESSION_KEY?.trim();
	const legacyKey = apiKey.startsWith("sk-proj-") || apiKey.startsWith("sk-admin-") ? undefined : apiKey;
	const billingKey = session || legacyKey;
	if (billingKey) {
		const body = await getJson(`${OPENAI_API_BASE}/v1/dashboard/billing/credit_grants`, billingKey, { signal });
		const left = parseCreditGrants(body);
		if (left !== undefined) return `${provider} ${money(left)} left`;
	}
	const admin =
		(await readPluginSetting("openaiAdminKey")) ||
		process.env.OPENAI_ADMIN_KEY?.trim() ||
		(apiKey.startsWith("sk-admin-") ? apiKey : undefined);
	if (!admin) return undefined;
	const spent = await fetchMonthSpend(admin, signal);
	return spent === undefined ? undefined : `${provider} ${money(spent)} spent`;
}
