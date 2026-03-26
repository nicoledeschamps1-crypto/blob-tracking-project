#!/bin/bash
# ============================================================================
# BlobFX Multi-Agent Build Harness
# GAN-inspired: Planner -> Generator -> Evaluator with real context resets
#
# Usage:
#   ./harness/harness.sh "add preset sharing with export/import and QR codes"
#   ./harness/harness.sh --resume layers-v2
#   ./harness/harness.sh --eval-only layers-v2 2
# ============================================================================

set -euo pipefail

# --- Config ---
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HARNESS_DIR="$PROJECT_DIR/harness"
CONTRACTS_DIR="$PROJECT_DIR/sprint-contracts"
PROMPTS_DIR="$HARNESS_DIR/prompts"
SCHEMAS_DIR="$HARNESS_DIR/schemas"
SERVER_PORT=8080
MAX_FIX_ROUNDS=3
MAX_BUDGET_PER_PHASE=25

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Helpers ---
log()  { echo -e "${BLUE}[harness]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
phase(){ echo -e "\n${PURPLE}${BOLD}=== $* ===${NC}\n"; }

ensure_jq() {
  if ! command -v jq &>/dev/null; then
    fail "jq is required. Install with: brew install jq"
    exit 1
  fi
}

start_server() {
  lsof -ti:$SERVER_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 1
  log "Starting dev server on port $SERVER_PORT..."
  python3 -m http.server $SERVER_PORT --directory "$PROJECT_DIR" &>/dev/null &
  SERVER_PID=$!
  sleep 2
  if ! curl -s "http://localhost:$SERVER_PORT/blob-tracking.html" >/dev/null 2>&1; then
    fail "Server failed to start on port $SERVER_PORT"
    exit 1
  fi
  ok "Server running (PID $SERVER_PID)"
}

stop_server() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  lsof -ti:$SERVER_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
}

sync_files() {
  log "Syncing files to ~/Downloads..."
  for f in blob-tracking.html blob-core.js blob-fx.js blob-shader-fx.js \
           blob-overlay.js blob-audio.js blob-timeline.js blob-mask.js blob-tracking.js; do
    cp "$PROJECT_DIR/$f" ~/Downloads/"$f" 2>/dev/null || true
  done
  ok "Files synced"
}

# Write a prompt to a temp file and return the path
write_prompt() {
  local tmpfile
  tmpfile=$(mktemp /tmp/harness-prompt-XXXXXX.txt)
  cat > "$tmpfile"
  echo "$tmpfile"
}

# --- Phase 1: PLANNER ---
run_planner() {
  local feature_desc="$1"
  phase "PHASE 1: PLANNER"
  log "Feature: $feature_desc"

  local prompt_file
  prompt_file=$(mktemp /tmp/harness-planner-XXXXXX.txt)
  cat > "$prompt_file" <<EOF
Plan this feature for BlobFX:

"$feature_desc"

Instructions:
1. Read the codebase: glob for *.js and *.html files in the project root
2. Read blob-core.js (first 200 lines for globals/config)
3. Read blob-fx.js (first 100 lines for FX_UI_CONFIG structure)
4. Grep for any existing code related to this feature
5. Write a sprint contract to: $CONTRACTS_DIR/${SLUG}-spec.md

The contract MUST follow the format in your system prompt.
After writing the contract, return the structured JSON summary.
EOF

  log "Invoking planner agent (fresh context)..."
  local plan_result
  plan_result=$(claude -p \
    --system-prompt "$(cat "$PROMPTS_DIR/planner.md")" \
    --allowed-tools "Read,Glob,Grep,Write,Agent" \
    --permission-mode "auto" \
    --output-format json \
    --json-schema "$(cat "$SCHEMAS_DIR/plan-output.json")" \
    --max-budget-usd "$MAX_BUDGET_PER_PHASE" \
    "$(cat "$prompt_file")" 2>/dev/null) || {
      fail "Planner agent failed"
      rm -f "$prompt_file"
      exit 1
    }

  rm -f "$prompt_file"

  echo "$plan_result" > "$CONTRACTS_DIR/${SLUG}-plan-output.json"

  local num_sprints total_criteria
  num_sprints=$(echo "$plan_result" | jq '.sprints | length')
  total_criteria=$(echo "$plan_result" | jq '.total_criteria')

  ok "Plan complete: $num_sprints sprints, $total_criteria criteria"
  echo ""
  echo "$plan_result" | jq -r '.sprints[] | "  Sprint \(.number): \(.title) (\(.criteria_count) criteria, \(.complexity))"'
  echo ""

  NUM_SPRINTS=$num_sprints
  CONTRACT_PATH="$CONTRACTS_DIR/${SLUG}-spec.md"

  echo -e "${CYAN}${BOLD}Review the contract at:${NC} $CONTRACT_PATH"
  echo -ne "${CYAN}${BOLD}Approve and continue? [y/n/edit]${NC} "
  read -r approval
  case "$approval" in
    y|Y|yes) ok "Plan approved" ;;
    edit)
      log "Opening contract for editing..."
      ${EDITOR:-nano} "$CONTRACT_PATH"
      ok "Contract edited, continuing"
      ;;
    *)
      warn "Plan rejected. Edit $CONTRACT_PATH and re-run with --resume $SLUG"
      exit 0
      ;;
  esac
}

# --- Phase 2: GENERATOR ---
run_generator() {
  local sprint_num="$1"
  phase "PHASE 2: GENERATOR -- Sprint $sprint_num"

  local contract_content
  contract_content=$(cat "$CONTRACT_PATH")

  # Build generator prompt via temp file
  local prompt_file
  prompt_file=$(mktemp /tmp/harness-generator-XXXXXX.txt)

  {
    echo "Implement Sprint $sprint_num from this contract:"
    echo ""
    echo "$contract_content"
    echo ""

    # Include previous sprint eval if exists
    if [[ $sprint_num -gt 1 ]]; then
      local prev_eval="$CONTRACTS_DIR/${SLUG}-sprint$((sprint_num-1))-eval.json"
      if [[ -f "$prev_eval" ]]; then
        echo "## Previous Sprint Evaluation (Sprint $((sprint_num-1)))"
        cat "$prev_eval"
        echo ""
      fi
    fi

    # Include fix requests if this is a retry
    local eval_file="$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-eval.json"
    if [[ -f "$eval_file" ]]; then
      local prev_verdict
      prev_verdict=$(jq -r '.verdict' "$eval_file" 2>/dev/null || echo "")
      if [[ "$prev_verdict" == "FAIL" ]]; then
        echo "## FIX REQUIRED -- Previous Evaluation Failed"
        echo "Fix ONLY these items -- do not change passing code:"
        jq -r '.required_fixes[]' "$eval_file" 2>/dev/null | sed 's/^/- /'
        echo ""
        echo "Failed criteria:"
        jq -r '.criteria[] | select(.result == "FAIL") | "- \(.id): \(.evidence)"' "$eval_file" 2>/dev/null
        echo ""
      fi
    fi

    echo "## Your Task"
    echo "1. Read the contracts Sprint $sprint_num section"
    echo "2. Read all files listed in Files Modified for this sprint"
    echo "3. Implement each ISC criterion"
    echo "4. Write your status/self-assessment"
    echo "5. Sync files: copy all 9 files from $PROJECT_DIR to ~/Downloads/"
    echo "6. Update ?v= cache-bust in blob-tracking.html for changed JS files"
    echo ""
    echo "Return structured JSON with your self-assessment for each criterion."
  } > "$prompt_file"

  log "Invoking generator agent (fresh context)..."
  local build_result
  build_result=$(claude -p \
    --system-prompt "$(cat "$PROMPTS_DIR/generator.md")" \
    --allowed-tools "Read,Glob,Grep,Edit,Write,Bash" \
    --permission-mode "auto" \
    --output-format json \
    --json-schema "$(cat "$SCHEMAS_DIR/build-output.json")" \
    --max-budget-usd "$MAX_BUDGET_PER_PHASE" \
    "$(cat "$prompt_file")" 2>/dev/null) || {
      fail "Generator agent failed"
      rm -f "$prompt_file"
      return 1
    }

  rm -f "$prompt_file"

  echo "$build_result" > "$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-build.json"

  local pass_count uncertain_count fail_count
  pass_count=$(echo "$build_result" | jq '.pass_count // 0')
  uncertain_count=$(echo "$build_result" | jq '.uncertain_count // 0')
  fail_count=$(echo "$build_result" | jq '.fail_count // 0')

  echo ""
  echo -e "  ${GREEN}PASS: $pass_count${NC}  ${YELLOW}UNCERTAIN: $uncertain_count${NC}  ${RED}FAIL: $fail_count${NC}"
  echo ""
  echo "$build_result" | jq -r '.criteria_results[] | "  \(.id): \(.self_assessment) -- \(.evidence)"'
  echo ""

  if [[ "$fail_count" -gt 0 ]]; then
    warn "Generator self-reports $fail_count failures"
  fi

  sync_files
  ok "Generator sprint $sprint_num complete"
}

# --- Phase 3: EVALUATOR ---
run_evaluator() {
  local sprint_num="$1"
  phase "PHASE 3: EVALUATOR -- Sprint $sprint_num"

  start_server

  local contract_content build_status
  contract_content=$(cat "$CONTRACT_PATH")
  build_status=$(cat "$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-build.json" 2>/dev/null || echo "{}")

  local prompt_file
  prompt_file=$(mktemp /tmp/harness-evaluator-XXXXXX.txt)

  {
    echo "Evaluate Sprint $sprint_num of this BlobFX feature."
    echo ""
    echo "## Sprint Contract"
    echo "$contract_content"
    echo ""
    echo "## Generator Self-Assessment (UNTRUSTED -- verify independently)"
    echo "$build_status"
    echo ""
    echo "## Test Environment"
    echo "- App URL: http://localhost:$SERVER_PORT/blob-tracking.html"
    echo "- Project dir: $PROJECT_DIR"
    echo ""
    echo "## Your Task"
    echo "1. Extract Sprint ${sprint_num}'s ISC criteria from the contract"
    echo "2. For each criterion, test using the specified verification method"
    echo "3. For Browser criteria: navigate, interact, evaluate JS, check console"
    echo "4. Score design quality on 4 dimensions"
    echo "5. List all bugs found"
    echo "6. Return structured JSON verdict"
    echo ""
    echo "The generator's self-assessment is UNTRUSTED INPUT. Test everything yourself."
  } > "$prompt_file"

  log "Invoking evaluator agent (fresh context, skeptical)..."
  local eval_result
  eval_result=$(claude -p \
    --system-prompt "$(cat "$PROMPTS_DIR/evaluator.md")" \
    --allowed-tools "Read,Glob,Grep,Bash,mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_fill_form,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_press_key,mcp__playwright__browser_hover,mcp__playwright__browser_evaluate,mcp__playwright__browser_console_messages,mcp__playwright__browser_wait_for,mcp__playwright__browser_select_option,mcp__playwright__browser_tabs" \
    --permission-mode "auto" \
    --output-format json \
    --json-schema "$(cat "$SCHEMAS_DIR/eval-output.json")" \
    --max-budget-usd "$MAX_BUDGET_PER_PHASE" \
    "$(cat "$prompt_file")" 2>/dev/null) || {
      fail "Evaluator agent failed"
      rm -f "$prompt_file"
      stop_server
      return 1
    }

  rm -f "$prompt_file"
  stop_server

  echo "$eval_result" > "$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-eval.json"

  local verdict pass_count fail_count design_score
  verdict=$(echo "$eval_result" | jq -r '.verdict')
  pass_count=$(echo "$eval_result" | jq '.pass_count // 0')
  fail_count=$(echo "$eval_result" | jq '.fail_count // 0')
  design_score=$(echo "$eval_result" | jq '.design_scores.weighted_total // 0')

  echo ""
  local total=$((pass_count + fail_count))
  case "$verdict" in
    PASS)
      ok "VERDICT: PASS ($pass_count/$total criteria, design: $design_score/10)"
      ;;
    CONDITIONAL)
      warn "VERDICT: CONDITIONAL PASS ($pass_count passed, $fail_count failed, design: $design_score/10)"
      echo "$eval_result" | jq -r '.required_fixes[]' 2>/dev/null | while read -r fix; do
        echo "  ! $fix"
      done
      ;;
    FAIL)
      fail "VERDICT: FAIL ($pass_count passed, $fail_count failed, design: $design_score/10)"
      echo "$eval_result" | jq -r '.required_fixes[]' 2>/dev/null | while read -r fix; do
        echo "  x $fix"
      done
      ;;
  esac

  local bug_count
  bug_count=$(echo "$eval_result" | jq '.bugs | length')
  if [[ "$bug_count" -gt 0 ]]; then
    echo ""
    warn "Bugs found: $bug_count"
    echo "$eval_result" | jq -r '.bugs[] | "  [\(.severity)] \(.description) @ \(.location)"'
  fi

  local console_err_count
  console_err_count=$(echo "$eval_result" | jq '.console_errors | length // 0')
  if [[ "$console_err_count" -gt 0 ]]; then
    echo ""
    fail "Console errors: $console_err_count"
    echo "$eval_result" | jq -r '.console_errors[]' 2>/dev/null | sed 's/^/  > /'
  fi

  echo ""
  # Return verdict for caller to parse
  echo "$verdict"
}

# --- Sprint Cycle (build + eval + fix loop) ---
run_sprint_cycle() {
  local sprint_num="$1"
  local fix_round=0

  while true; do
    run_generator "$sprint_num"

    local verdict
    verdict=$(run_evaluator "$sprint_num" | tail -1)

    case "$verdict" in
      PASS)
        ok "Sprint $sprint_num PASSED"
        return 0
        ;;
      CONDITIONAL)
        warn "Sprint $sprint_num conditional pass -- proceeding"
        return 0
        ;;
      FAIL)
        fix_round=$((fix_round + 1))
        if [[ $fix_round -ge $MAX_FIX_ROUNDS ]]; then
          fail "Sprint $sprint_num failed after $MAX_FIX_ROUNDS fix rounds"
          echo ""
          echo -e "${RED}${BOLD}Escalating to user.${NC}"
          echo "Review: $CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-eval.json"
          echo -ne "Options: [r]etry / [s]kip / [a]bort "
          read -r choice
          case "$choice" in
            r) fix_round=0; continue ;;
            s) warn "Skipping sprint $sprint_num"; return 0 ;;
            *) fail "Aborted"; exit 1 ;;
          esac
        fi
        warn "Fix round $fix_round/$MAX_FIX_ROUNDS -- generator will address failures"
        ;;
    esac
  done
}

# --- Regression Check ---
run_regression() {
  phase "FINAL: REGRESSION CHECK"
  start_server

  log "Re-testing all sprints against live app..."
  local all_pass=true
  for sprint_num in $(seq 1 "$NUM_SPRINTS"); do
    local eval_file="$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-eval.json"
    if [[ -f "$eval_file" ]]; then
      local v p f
      v=$(jq -r '.verdict' "$eval_file")
      p=$(jq '.pass_count // 0' "$eval_file")
      f=$(jq '.fail_count // 0' "$eval_file")
      echo "  Sprint $sprint_num: $v ($p passed, $f failed)"
      if [[ "$v" == "FAIL" ]]; then
        all_pass=false
      fi
    fi
  done

  stop_server

  if $all_pass; then
    ok "All sprints passing"
  else
    warn "Some sprints have issues -- review before committing"
  fi
}

# --- Report ---
write_report() {
  phase "REPORT"

  local report_file="$CONTRACTS_DIR/${SLUG}-report.md"
  {
    echo "# Harness Report: $FEATURE_NAME"
    echo "## Date: $(date +%Y-%m-%d)"
    echo ""
    echo "## Sprint Results"
    echo "| Sprint | Criteria | Passed | Failed | Design Score |"
    echo "|--------|----------|--------|--------|--------------|"

    local total_pass=0 total_fail=0
    for sprint_num in $(seq 1 "$NUM_SPRINTS"); do
      local eval_file="$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-eval.json"
      if [[ -f "$eval_file" ]]; then
        local p f d title
        p=$(jq '.pass_count // 0' "$eval_file")
        f=$(jq '.fail_count // 0' "$eval_file")
        d=$(jq '.design_scores.weighted_total // 0' "$eval_file")
        title=$(jq -r ".sprints[$((sprint_num-1))].title // \"Sprint $sprint_num\"" \
          "$CONTRACTS_DIR/${SLUG}-plan-output.json" 2>/dev/null || echo "Sprint $sprint_num")
        echo "| $sprint_num: $title | $((p + f)) | $p | $f | $d/10 |"
        total_pass=$((total_pass + p))
        total_fail=$((total_fail + f))
      fi
    done

    echo ""
    echo "## Summary"
    local total_criteria=$((total_pass + total_fail))
    if [[ $total_criteria -gt 0 ]]; then
      echo "- Total criteria: $total_criteria"
      echo "- Passed: $total_pass"
      echo "- Failed: $total_fail"
      echo "- Pass rate: $(( total_pass * 100 / total_criteria ))%"
    else
      echo "- No evaluation data found"
    fi
    echo ""
    echo "## Files Modified"
    for sprint_num in $(seq 1 "$NUM_SPRINTS"); do
      local build_file="$CONTRACTS_DIR/${SLUG}-sprint${sprint_num}-build.json"
      if [[ -f "$build_file" ]]; then
        jq -r '.files_changed[]' "$build_file" 2>/dev/null | sed 's/^/- /'
      fi
    done | sort -u
  } > "$report_file"

  ok "Report written to $report_file"
  echo ""
  cat "$report_file"
}

# --- Entry Point ---
main() {
  ensure_jq

  local mode="full"
  local feature_desc=""
  local eval_sprint_num=""
  SLUG=""
  NUM_SPRINTS=0
  FEATURE_NAME=""
  CONTRACT_PATH=""
  SERVER_PID=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --resume)
        mode="resume"
        SLUG="$2"
        shift 2
        ;;
      --eval-only)
        mode="eval-only"
        SLUG="$2"
        eval_sprint_num="$3"
        shift 3
        ;;
      --help|-h)
        echo "Usage: $0 \"feature description\""
        echo "       $0 --resume <slug>"
        echo "       $0 --eval-only <slug> <sprint-number>"
        exit 0
        ;;
      *)
        feature_desc="$1"
        shift
        ;;
    esac
  done

  mkdir -p "$CONTRACTS_DIR"
  trap stop_server EXIT

  case "$mode" in
    full)
      if [[ -z "$feature_desc" ]]; then
        fail "Usage: $0 \"feature description\""
        exit 1
      fi
      SLUG=$(echo "$feature_desc" | tr '[:upper:]' '[:lower:]' | \
        sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-40)
      FEATURE_NAME="$feature_desc"

      echo -e "${PURPLE}${BOLD}"
      echo "  BlobFX Multi-Agent Build Harness"
      echo "  Planner -> Generator -> Evaluator"
      echo -e "${NC}"

      run_planner "$feature_desc"

      for sprint_num in $(seq 1 "$NUM_SPRINTS"); do
        run_sprint_cycle "$sprint_num"
      done

      run_regression
      write_report

      echo ""
      echo -ne "${CYAN}${BOLD}Feature complete. Commit changes? [y/n]${NC} "
      read -r commit_choice
      if [[ "$commit_choice" == "y" ]]; then
        cd "$PROJECT_DIR"
        git add -A
        git commit -m "feat: $FEATURE_NAME (harness-built, $(date +%Y-%m-%d))"
        ok "Committed"
        sync_files
      fi
      ;;

    resume)
      CONTRACT_PATH="$CONTRACTS_DIR/${SLUG}-spec.md"
      if [[ ! -f "$CONTRACT_PATH" ]]; then
        fail "No contract found at $CONTRACT_PATH"
        exit 1
      fi
      FEATURE_NAME="$SLUG"
      NUM_SPRINTS=$(jq '.sprints | length' "$CONTRACTS_DIR/${SLUG}-plan-output.json")
      local resume_sprint=1
      for s in $(seq 1 "$NUM_SPRINTS"); do
        local ef="$CONTRACTS_DIR/${SLUG}-sprint${s}-eval.json"
        if [[ -f "$ef" ]]; then
          local v
          v=$(jq -r '.verdict' "$ef")
          if [[ "$v" == "PASS" || "$v" == "CONDITIONAL" ]]; then
            resume_sprint=$((s + 1))
          fi
        fi
      done
      log "Resuming from sprint $resume_sprint of $NUM_SPRINTS"
      for sprint_num in $(seq "$resume_sprint" "$NUM_SPRINTS"); do
        run_sprint_cycle "$sprint_num"
      done
      run_regression
      write_report
      ;;

    eval-only)
      CONTRACT_PATH="$CONTRACTS_DIR/${SLUG}-spec.md"
      if [[ ! -f "$CONTRACT_PATH" ]]; then
        fail "No contract found at $CONTRACT_PATH"
        exit 1
      fi
      run_evaluator "$eval_sprint_num"
      ;;
  esac
}

main "$@"
