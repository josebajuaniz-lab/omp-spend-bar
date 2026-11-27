import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { asRecord } from "./guards";

export const PACKAGE_NAME = "omp-spend-bar";

/**
 * omp keeps `omp plugin config set` values in `<plugins>/omp-plugins.lock.json`;
 * an installed copy lives at `<plugins>/node_modules/omp-spend-bar/src`.
 */
export const LOCKFILE_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../omp-plugins.lock.json",
);

/** Non-empty string setting `key` of this plugin from a lock-file body. */
export function parsePluginSetting(body: unknown, key: string): string | undefined {
	const value = asRecord(asRecord(asRecord(body)?.settings)?.[PACKAGE_NAME])?.[key];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A setting from the lock file; `undefined` when the file or the key is absent. */
export async function readPluginSetting(key: string, lockfile: string = LOCKFILE_PATH): Promise<string | undefined> {
	try {
		return parsePluginSetting(JSON.parse(await readFile(lockfile, "utf8")), key);
	} catch {
		return undefined;
	}
}
