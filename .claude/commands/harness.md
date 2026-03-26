---
description: "Run the multi-agent build harness (plan → build → evaluate loop)"
argument-hint: "feature description OR --resume slug OR --eval-only slug sprint-num"
allowed-tools: ["Bash", "Read"]
---

Run the multi-agent build harness for BlobFX.

**Arguments**: $ARGUMENTS

## What This Does

The harness runs 3 separate Claude agents with REAL context resets (separate `claude -p` invocations):

1. **Planner** — Expands your feature description into sprint contracts with ISC criteria
2. **Generator** — Builds one sprint at a time (fresh context per sprint)
3. **Evaluator** — Tests live UI via Playwright, grades design quality, returns structured PASS/FAIL

Each agent gets its own system prompt, allowed tools, and JSON schema. They communicate via files in `sprint-contracts/`.

## Run It

Execute the shell harness:

```bash
cd ~/Downloads/blob-tracking-project
./harness/harness.sh "$ARGUMENTS"
```

Run this command now. The harness will:
1. Show the plan and ask for approval
2. Build each sprint with generator → evaluator cycles
3. Retry failures up to 3 times per sprint
4. Run final regression check
5. Write a report and offer to commit

## Modes

- **Full run**: `./harness/harness.sh "add preset sharing"`
- **Resume**: `./harness/harness.sh --resume preset-sharing`
- **Eval only**: `./harness/harness.sh --eval-only preset-sharing 2`

## Prerequisites

- `jq` must be installed (`brew install jq`)
- Playwright MCP server must be configured
- Port 8080 must be available (harness starts its own server)
