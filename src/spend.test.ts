import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDeepSeekHost, parseBalance } from "./deepseek";
import { money, shortDate } from "./format";
import { formatBudget, managementBaseUrl, parseBudget, parseResetAt } from "./litellm";
import { isOpenAIApiHost, monthStartSeconds, parseCosts, parseCreditGrants } from "./openai";

const DEC_1 = Date.parse("2026-12-01T00:00:00Z");

describe("format", () => {
	it("prints whole dollars without cents and everything else with two", () => {
		assert.equal(money(250), "$250");
		assert.equal(money(6.9), "$6.90");
		assert.equal(money(12.345), "$12.35");
	});

	it("labels an instant in UTC", () => {
		assert.equal(shortDate(DEC_1), "Dec 1");
	});
});

describe("litellm", () => {
	it("strips the API version segment but keeps proxy subpaths", () => {
		assert.equal(managementBaseUrl("https://litellm.example.com/v1"), "https://litellm.example.com");
		assert.equal(managementBaseUrl("https://litellm.example.com/v1/"), "https://litellm.example.com");
		assert.equal(managementBaseUrl("https://host.internal/litellm/v1"), "https://host.internal/litellm");
		assert.equal(managementBaseUrl("not a url"), undefined);
	});

	it("reads a naive reset datetime as UTC", () => {
		assert.equal(parseResetAt("2026-12-01T00:00:00"), DEC_1);
		assert.equal(parseResetAt("2026-12-01 00:00:00"), DEC_1);
		assert.equal(parseResetAt("2026-12-01T00:00:00Z"), DEC_1);
		assert.equal(parseResetAt("2026-12-01T00:00:00.000Z"), DEC_1);
		assert.equal(parseResetAt(1796083200000), undefined);
		assert.equal(parseResetAt("soon"), undefined);
	});

	it("prefers the key budget over the user budget", () => {
		const budget = parseBudget(
			{ spend: 12.4, max_budget: 250, budget_reset_at: "2026-12-01T00:00:00" },
			{ spend: 12, max_budget: 100 },
		);
		assert.deepEqual(budget, { spend: 12.4, limit: 250, resetsAt: DEC_1 });
	});

	it("falls back to the user budget and accepts string amounts", () => {
		const budget = parseBudget(undefined, { spend: "13.5", max_budget: "250", budget_reset_at: null });
		assert.deepEqual(budget, { spend: 13.5, limit: 250, resetsAt: undefined });
	});

	it("reports nothing without a spend figure", () => {
		assert.equal(parseBudget({ max_budget: 250 }, {}), undefined);
		assert.equal(parseBudget(undefined, undefined), undefined);
	});

	it("formats spend, cap and reset date", () => {
		assert.equal(
			formatBudget("litellm-proxy", { spend: 12.4, limit: 250, resetsAt: DEC_1 }),
			"litellm-proxy $12.40/$250 ↻Dec 1",
		);
		assert.equal(formatBudget("litellm-proxy", { spend: 3 }), "litellm-proxy $3.00");
	});
});

describe("deepseek", () => {
	it("matches only the API host", () => {
		assert.equal(isDeepSeekHost("https://api.deepseek.com"), true);
		assert.equal(isDeepSeekHost("https://api.deepseek.com/v1"), true);
		assert.equal(isDeepSeekHost("https://notapi.deepseek.com"), false);
		assert.equal(isDeepSeekHost("https://api.deepseek.com.evil.test"), false);
		assert.equal(isDeepSeekHost(undefined), false);
	});

	it("reads the USD entry of balance_infos", () => {
		assert.equal(
			parseBalance({
				balance_infos: [
					{ currency: "CNY", total_balance: "50.00" },
					{ currency: "USD", total_balance: "8.2" },
				],
			}),
			8.2,
		);
	});

	it("reports nothing without a USD balance", () => {
		assert.equal(parseBalance({ balance_infos: [{ currency: "CNY", total_balance: "50" }] }), undefined);
		assert.equal(parseBalance({}), undefined);
		assert.equal(parseBalance("nope"), undefined);
	});
});

describe("openai", () => {
	it("matches only the platform host", () => {
		assert.equal(isOpenAIApiHost("https://api.openai.com/v1"), true);
		assert.equal(isOpenAIApiHost("https://api.openai.com"), true);
		assert.equal(isOpenAIApiHost("https://openai.example.com/v1"), false);
		assert.equal(isOpenAIApiHost("https://api.openai.com.evil.test/v1"), false);
		assert.equal(isOpenAIApiHost(undefined), false);
	});

	it("starts the billing window at the UTC month boundary", () => {
		assert.equal(monthStartSeconds(Date.parse("2026-11-27T15:00:00Z")), Date.parse("2026-11-01T00:00:00Z") / 1000);
		assert.equal(monthStartSeconds(Date.parse("2026-01-01T00:00:00Z")), Date.parse("2026-01-01T00:00:00Z") / 1000);
	});

	it("reads the available credit", () => {
		assert.equal(parseCreditGrants({ total_available: 12.5 }), 12.5);
		assert.equal(parseCreditGrants({ total_available: "3.20" }), 3.2);
		assert.equal(parseCreditGrants({ total_granted: 20 }), undefined);
		assert.equal(parseCreditGrants("nope"), undefined);
	});

	it("sums USD cost buckets and ignores other currencies", () => {
		const body = {
			data: [
				{ results: [{ amount: { value: 0.06, currency: "usd" } }, { amount: { value: 1.5 } }] },
				{ results: [{ amount: { value: 2, currency: "USD" } }, { amount: { value: 9, currency: "eur" } }] },
			],
		};
		assert.equal(parseCosts(body), 3.56);
		assert.equal(parseCosts({ data: [] }), 0);
		assert.equal(parseCosts({ data: [{ results: null }] }), 0);
		assert.equal(parseCosts({}), undefined);
		assert.equal(parseCosts(null), undefined);
	});
});
