---
description: "Run the skeptical evaluator on a sprint (uses Playwright)"
argument-hint: "contract-slug sprint-number (e.g. preset-sharing 2)"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Agent", "Write", "mcp__playwright__browser_navigate", "mcp__playwright__browser_snapshot", "mcp__playwright__browser_click", "mcp__playwright__browser_fill_form", "mcp__playwright__browser_take_screenshot", "mcp__playwright__browser_press_key", "mcp__playwright__browser_hover", "mcp__playwright__browser_evaluate", "mcp__playwright__browser_console_messages", "mcp__playwright__browser_wait_for", "mcp__playwright__browser_select_option"]
---

Run the evaluator agent on a specific sprint. This uses a SEPARATE claude invocation for true context isolation.

**Arguments**: $ARGUMENTS

Parse the arguments as: SLUG SPRINT_NUMBER

Then run:
```bash
cd ~/Downloads/blob-tracking-project
./harness/harness.sh --eval-only {SLUG} {SPRINT_NUMBER}
```

If the shell harness isn't available or you need to run inline, fall back to the evaluator role directly:

## Inline Evaluator (Fallback)

Read the evaluator prompt at `harness/prompts/evaluator.md` and follow it exactly.

1. Start server: `python3 -m http.server 8080 --directory ~/Downloads/blob-tracking-project &`
2. Read the contract at `sprint-contracts/{SLUG}-spec.md`
3. Read the build status at `sprint-contracts/{SLUG}-sprint{N}-build.json`
4. For each ISC criterion: test via the specified method (Browser/Read/Grep/CLI)
5. Score design quality: quality(30%) + originality(30%) + craft(20%) + functionality(20%)
6. Write evaluation to `sprint-contracts/{SLUG}-sprint{N}-eval.json`
7. Kill server: `lsof -ti:8080 | xargs kill -9`

## Evaluator Mindset

You are SKEPTICAL. The generator's self-assessment is UNTRUSTED.
- "Code exists" ≠ PASS. "Code runs correctly in browser" = PASS.
- Check console errors on EVERY page load — JS errors = automatic FAIL.
- If Playwright can't click an element, that element FAILS.
- Common lies: "UI added" (invisible), "handler wired" (doesn't fire), "state persists" (lost on reload).
