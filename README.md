# omp-spend-bar

Money spent so far, on the [omp](https://github.com/can1357/oh-my-pi) status line, for the provider your session is using.

| Active provider | Status text                       | `/usage`                       |
| --------------- | --------------------------------- | ------------------------------ |
| LiteLLM proxy | `litellm-proxy $12.40/$250 ↻Dec 1` | budget bar (omp's own adapter) |
| DeepSeek | `deepseek $8.20 left` | `Credit balance` limit |
| OpenAI platform | `openai $8.20 left` or `openai $12.40 spent` | unchanged |
| anything else   | cleared                           | unchanged                      |

omp's built-in `usage` segment shows subscription quota windows (`5h`, `7d`, …) as percentages. It has no path for a dollar figure, so balances and budgets go into the `status` segment instead — that is the whole reason this plugin exists.

## Install

Requires omp 19.2 or newer.

From GitHub:

```sh
omp plugin install github:<owner>/omp-spend-bar
```

From a local checkout:

```sh
omp plugin link ~/src/omp-spend-bar
```

Either way omp imports the entry declared in `package.json` (`omp.extensions`), records it in `~/.omp/plugins/omp-plugins.lock.json`, and loads it in every new session. Restart omp after installing.

## Show it on the status line

The plugin writes a `setStatus("spend-bar", …)` entry. Only the `status` segment renders those, and `status` is not part of omp's default layout, so switch to a custom layout:

```sh
omp config set statusLine.preset custom
omp config set statusLine.rightSegments '["status","usage","session_name","token_total","cost","context_pct"]'
omp config set statusLine.showHookStatus false
```

`showHookStatus: false` drops the second copy. omp prints every `setStatus` entry a second time as its own line under the composer, gated by `statusLine.showHookStatus` (on by default) with no check for the `status` segment, so leaving it on shows `deepseek $8.20 left` in the bar *and* under the prompt. The `status` segment keeps rendering the text, so nothing else is lost.

`usage` is optional — add it if you also want the subscription windows (Anthropic 5h/7d, Copilot requests, …). Drop either segment and the corresponding text disappears. Left segments stay at their defaults unless you set `statusLine.leftSegments`.

## Provider configuration

### OpenAI

OpenAI has no documented endpoint that returns the remaining platform balance.
The plugin uses the two figures that are reachable, in this order:

| Credential | Call | Bar |
| --- | --- | --- |
| `OPENAI_SESSION_KEY` (browser `__Secure-next-auth.session-token` from platform.openai.com), or a legacy user key (`sk-…`, not `sk-proj-…`/`sk-admin-…`) | `GET /v1/dashboard/billing/credit_grants` | `openai $8.20 left` |
| `openaiAdminKey` plugin setting or `OPENAI_ADMIN_KEY` (`sk-admin-…`), or the model key when it is an Admin key | `GET /v1/organization/costs` | `openai $12.40 spent` (UTC month to date) |

Keep the project key (`sk-proj-…`) as the model `apiKey` in `models.yaml`: an
Admin key cannot call models. Store the Admin key in the plugin config:

```sh
omp plugin config set omp-spend-bar openaiAdminKey sk-admin-…
```

or put `OPENAI_ADMIN_KEY` / `OPENAI_SESSION_KEY` in `~/.omp/agent/.env`; omp
loads that file into the process environment. The plugin setting wins over the
variable.

- Project keys (`sk-proj-…`) and Admin keys are rejected by `credit_grants` with
  `403 … must be made with a session key`, so the balance path needs a session
  token or an old user key.
- `/organization/costs` reports spend, not remaining balance; without an Admin
  key (or `api.usage.read`) it answers `403`.
- The plugin matches only `provider: openai` with `baseUrl` host
  `api.openai.com`; an OpenAI-compatible proxy belongs to its own provider
  (LiteLLM, …) and is not read as OpenAI.
- With a plain project key and no Admin key or session token configured, the bar stays blank: no
  dollar figure is readable for that account. The `/spend` command then reports
  `nothing to show`.

### DeepSeek

Needs a DeepSeek API key with credit. Either log in:

```sh
omp auth login deepseek
```

or declare the provider in `~/.omp/agent/models.yaml` with the key inline:

```yaml
providers:
  deepseek:
    apiKey: sk-…
```

The balance comes from `GET https://api.deepseek.com/user/balance`, the USD entry only. A provider whose `baseUrl` host is exactly `api.deepseek.com` is treated as DeepSeek; a proxy in front of DeepSeek is not.

The plugin also registers a usage limit for the provider, so `omp usage` (and `/usage`) report `Credit balance` even though omp ships no DeepSeek adapter.

### LiteLLM

A LiteLLM proxy provider needs a virtual key in `models.yaml`, preferably as a literal `sk-…` value:

```yaml
providers:
  litellm-proxy:
    baseUrl: https://litellm.example.com/v1
    apiKey: sk-…
    api: openai-completions
    discovery:
      type: litellm
```

Notes:

- `/key/info` authenticates with the raw virtual key. If `apiKey` names an environment variable instead of holding the key, omp sends the variable's *name* as the key and the proxy rejects it — put the literal key here.
- Providers with `providerType: "litellm"` (or `discovery.type: litellm`) are matched; no `api` requirement.
- Spend, `max_budget` and `budget_reset_at` are read from `/key/info`, with `/v2/user/info` as the fallback for user-level budgets. A naive `budget_reset_at` (no zone) is read as UTC, matching LiteLLM.
- omp 19.2 already reports LiteLLM budgets in `/usage`; this plugin does not register a second LiteLLM adapter, it only formats the same numbers for the bar.

## Commands

| Command | Effect |
| --- | --- |
| `/spend` | Clears the cache, re-reads the provider, and toasts the text the bar would show. |
| `/usage` | omp's own report: subscription windows plus any registered credit balance. |

## Refresh behaviour

- Read on session start and on every turn start/end.
- Cached for 5 minutes per provider, so a quiet session does not hammer the API.
- The last good text is kept when a refresh fails (network down, expired key); the bar never blanks on a transient error.
- Every request carries a 10 s deadline and never throws out of a handler.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Nothing on the bar | `status` is not in `statusLine.rightSegments`/`leftSegments`, or `statusLine.preset` is not `custom`. |
| Text shows twice: in the bar and on its own line under the composer | `statusLine.showHookStatus` is on while `status` is in the segments; run `omp config set statusLine.showHookStatus false`. |
| Bar shows a stale number | Cache window (5 min) or a failed refresh with last-good text. `/spend` forces a read. |
| `401 … Virtual Key expected` in the toast | `models.yaml` `apiKey` holds an env var name; use the literal `sk-…` key. |
| LiteLLM text without `$spent/$limit` | `/key/info` refused the key and `/v2/user/info` had no `max_budget`; only a spend figure is shown. |
| DeepSeek shows `nothing to show` | Key missing (`omp auth login deepseek`), or the USD balance entry is absent. |
| OpenAI shows `nothing to show` | The model key is a project key and neither `OPENAI_SESSION_KEY` nor `OPENAI_ADMIN_KEY` is set; see the OpenAI section. |
| OpenAI shows `… spent`, no balance | No official endpoint exposes the balance; an Admin key reports spend only. |

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # node:test via tsx
```

Layout:

| File | Purpose |
| --- | --- |
| `src/index.ts` | Extension entry: registers usage adapters, `/spend`, and status refreshes. |
| `src/adapters.ts` | Table of providers: how a model is matched, how its text is fetched. |
| `src/litellm.ts` | `/key/info` + `/v2/user/info` parsing and `$spent/$limit ↻date` formatting. |
| `src/openai.ts` | `credit_grants` balance and `/organization/costs` month-to-date spend. |
| `src/deepseek.ts` | `/user/balance` parsing and `$X left` formatting. |
| `src/http.ts` | JSON GET with a deadline; returns `undefined` instead of throwing. |
| `src/format.ts`, `src/guards.ts` | Formatting and JSON narrowing helpers. |

Adding a provider: append one entry to `ADAPTERS` in `src/adapters.ts` — a `matches(model)` predicate, a `text()` that returns the bar string or `undefined`, and optionally a `usage` block when omp has no adapter of its own. Unit-test the parser in `src/spend.test.ts`.

The LiteLLM parser is implemented here rather than imported from `@oh-my-pi/pi-ai/usage/litellm` so the plugin keeps working across omp versions without tracking internal module shapes; the trade-off is the duplicate ~40 lines.

## Uninstall

```sh
omp plugin uninstall omp-spend-bar
```

Then drop `status` from the status line if nothing else uses it.
