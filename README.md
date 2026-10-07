# token-guardrails

Two [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) that stop your plan from being burned by accident.

Built after a real incident: a script that called `claude -p` every 60 seconds made about **800 Opus calls in 13 hours**, emptied two full plan windows, and produced nothing but "hold". Nothing in Claude Code stopped it. These mods would have stopped it after 20 minutes.

| mod | what it does |
|---|---|
| **quota-sentry** | Caps headless `claude -p` runs at 20 per hour across your whole machine. After 15 automatic turns in a row with no message from you, it asks before going on. Warns at 80% and 95% of your 5-hour and 7-day windows. **Your own prompts are never blocked.** |
| **effort-router** | Sets reasoning effort per prompt: `low` for "ok, go on", `high` for real work. It does **not** switch the main model, because the prompt cache belongs to one model and switching re-reads your whole context. Optionally moves subagents (which start with an empty context) to a cheaper model. Above 80% of your 5-hour window, effort steps down one level. |

Classification is local keyword matching: **zero tokens**. No network calls, no telemetry.

## Install

Requires Claude Code **2.1.287 or later** (mods).

```bash
claude plugin marketplace add amiralimardani-art/token-guardrails
claude plugin install quota-sentry@token-guardrails
claude plugin install effort-router@token-guardrails
```

Start a new session, then try `/quota-sentry` and `/effort-router`.

## Commands

| command | effect |
|---|---|
| `/quota-sentry` | plan windows, session cost, loop counters |
| `/quota-sentry pause` · `resume` | disable the blocks for one hour, or re-enable them |
| `/effort-router` | how your prompts were classified |
| `/effort-router off` · `on` | turn routing off or on |
| `/effort-router subagents claude-sonnet-5-5` | move subagents on non-hard tasks to that model (`subagents off` to undo) |

All commands answer instantly without a model turn, so they cost nothing.

## Tests

```bash
cd quota-sentry && claude plugin test    # 4 tests
cd effort-router && claude plugin test   # 4 tests
```

## Honest limits

- Keyword classification is a heuristic. Effort `low` on a prompt that needed more will give a weaker answer: `/effort-router off` if it bothers you.
- The headless counter is shared through the mod's local store; two sessions writing at the same instant can miss one count.
- Tested on Claude Code 2.1.292, macOS.

## License

MIT
