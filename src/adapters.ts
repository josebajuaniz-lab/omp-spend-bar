import type { ExtensionContext, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { fetchBalance, formatBalance, isDeepSeekHost } from "./deepseek";
import { fetchBudget } from "./litellm";
import { fetchOpenAIText, isOpenAIApiHost } from "./openai";

export type ActiveModel = NonNullable<ExtensionContext["model"]>;

export interface SpendAdapter {
	/** Provider ids this adapter answers for. */
	readonly providers: readonly string[];
	/** Whether the active model's spend is this adapter's business. */
	matches(model: ActiveModel): boolean;
	/** Status-line text for the active model, or undefined when the provider reported no figure. */
	text(
		provider: string,
		model: ActiveModel,
		apiKey: string,
		signal?: AbortSignal,
	): Promise<string | undefined>;
	/**
	 * Usage limit fed to `omp usage` for a provider omp ships no adapter for.
	 * Omit when omp already reports the provider (LiteLLM, Anthropic, …).
	 */
	readonly usage?: NonNullable<ProviderConfig["usage"]>;
}

const deepseekUsage: NonNullable<ProviderConfig["usage"]> = {
	id: "deepseek",
	cacheVersion: 1,
	supports: (params) =>
		params.provider === "deepseek" &&
		params.credential.type === "api_key" &&
		typeof params.credential.apiKey === "string",
	fetchUsage: async (params, context) => {
		const apiKey = "apiKey" in params.credential ? params.credential.apiKey : undefined;
		if (typeof apiKey !== "string") return null;
		const left = await fetchBalance(apiKey, { signal: params.signal, fetchImpl: context.fetch });
		if (left === undefined) return null;
		return {
			provider: params.provider,
			fetchedAt: Date.now(),
			limits: [
				{
					id: "balance",
					label: "Credit balance",
					scope: { provider: params.provider, windowId: "balance" },
					amount: { remaining: left, unit: "usd" },
				},
			],
		};
	},
};

export const ADAPTERS: readonly SpendAdapter[] = [
	{
		providers: ["deepseek"],
		matches: (model) => isDeepSeekHost(model.baseUrl),
		text: async (provider, _model, apiKey, signal) => {
			const left = await fetchBalance(apiKey, { signal });
			return left === undefined ? undefined : formatBalance(provider, left);
		},
		usage: deepseekUsage,
	},
	{
		// OpenAI's platform API: credit balance when the key can read it, month-to-date spend otherwise.
		providers: [],
		matches: (model) => model.provider === "openai" && isOpenAIApiHost(model.baseUrl),
		text: (provider, _model, apiKey, signal) => fetchOpenAIText(provider, apiKey, signal),
	},
	{
		// omp reports LiteLLM budgets in /usage already; the extension only formats them for the bar.
		providers: [],
		matches: (model) => model.providerType === "litellm",
		text: (provider, model, apiKey, signal) => fetchBudget(provider, model.baseUrl, apiKey, signal),
	},
];

export function adapterFor(model: ActiveModel): SpendAdapter | undefined {
	return ADAPTERS.find((adapter) => adapter.matches(model));
}
