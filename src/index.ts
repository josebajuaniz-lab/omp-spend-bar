import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { ADAPTERS, adapterFor } from "./adapters";

const STATUS_KEY = "spend-bar";
const CACHE_TTL_MS = 5 * 60_000;

export default function spendBar(pi: ExtensionAPI): void {
	for (const adapter of ADAPTERS) {
		if (!adapter.usage) continue;
		for (const provider of adapter.providers) pi.registerProvider(provider, { usage: adapter.usage });
	}

	const cache = new Map<string, { text: string; at: number }>();

	async function statusFor(ctx: ExtensionContext): Promise<string | undefined> {
		const model = ctx.model;
		if (!model) return undefined;
		const adapter = adapterFor(model);
		if (!adapter) return undefined;
		const cached = cache.get(model.provider);
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;
		const apiKey = await ctx.modelRegistry.getApiKey(model);
		if (!apiKey) return cached?.text;
		const text = await adapter.text(model.provider, model, apiKey);
		if (text === undefined) return cached?.text;
		cache.set(model.provider, { text, at: Date.now() });
		return text;
	}

	async function refresh(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) return;
		try {
			ctx.ui.setStatus(STATUS_KEY, await statusFor(ctx));
		} catch (error) {
			pi.logger.warn(
				`spend-bar: status refresh failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	pi.on("session_start", (_event, ctx) => refresh(ctx));
	pi.on("turn_start", (_event, ctx) => refresh(ctx));
	pi.on("turn_end", (_event, ctx) => refresh(ctx));

	pi.registerCommand("spend", {
		description: "Show spend/balance for the active provider",
		handler: async (_args, ctx) => {
			cache.clear();
			let text: string | undefined;
			try {
				text = await statusFor(ctx);
			} catch (error) {
				ctx.ui.notify(`spend: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}
			ctx.ui.notify(text ?? `${ctx.model?.provider ?? "no provider"}: nothing to show (see /usage)`, "info");
		},
	});
}
