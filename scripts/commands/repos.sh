#!/usr/bin/env bash

repos_registry_file() {
  printf '%s\n' "$DAPEI_DIR/repos.yaml"
}

repos_add() {
  local name="$1"
  local url="$2"
  [[ -n "$name" && -n "$url" ]] || die "usage: dapei repos add <name> <git-url>"
  require_cmd git

  local target="$REPOS_DIR/$name"
  local registry
  registry="$(repos_registry_file)"

  [[ ! -d "$target/.git" ]] || die "repos '$name' already exists"
  mkdir -p "$REPOS_DIR" "$DAPEI_DIR"
  git clone "$url" "$target" || die "clone failed for '$name'"

  local added_at default_branch
  added_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  default_branch="$(default_branch_for_repo "$target")"

  if [[ ! -f "$registry" ]]; then
    cat > "$registry" <<EOF_REGISTRY
version: "0.2"
repos:
EOF_REGISTRY
  fi

  if grep -q "name: $name" "$registry" 2>/dev/null; then
    log "repos '$name' already in registry"
  else
    cat >> "$registry" <<EOF_ENTRY
  - name: $name
    path: repos/$name
    url: $url
    added-at: $added_at
    default-branch: $default_branch
    test-commands: []
EOF_ENTRY
  fi

  log "repos '$name' added from $url"
}

repos_sync_one() {
  local name="$1"
  local target="$REPOS_DIR/$name"
  [[ -d "$target/.git" ]] || die "repos '$name' not found"
  require_cmd git

  if repo_has_remote "$target"; then
    log "fetching $name..."
    git -C "$target" fetch origin || die "fetch failed for '$name'"
  else
    warn "repos '$name' has no origin remote; skipped fetch"
  fi

  local branch hash
  branch="$(git -C "$target" rev-parse --abbrev-ref HEAD)"
  hash="$(git -C "$target" rev-parse --short HEAD)"
  log "repos '$name' synced, $branch at $hash"
}

repos_sync() {
  local target="$1"
  if [[ "$target" == "--all" ]]; then
    local found=0
    while IFS= read -r repo; do
      [[ -n "$repo" ]] || continue
      found=1
      repos_sync_one "$repo"
    done < <(registered_repo_names)
    [[ $found -eq 1 ]] || warn "no registered reposs"
    return 0
  fi
  repos_sync_one "$target"
}

repos_list() {
  local registry
  registry="$(repos_registry_file)"
  if [[ ! -f "$registry" ]]; then
    echo "No reposs registered."
    return 0
  fi

  local count
  count="$(registered_repo_names | wc -l | tr -d ' ')"
  echo "Codebases ($count):"

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    local repo_path="$REPOS_DIR/$name"
    if [[ -d "$repo_path/.git" ]]; then
      local hash branch
      hash="$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo "???")"
      branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "???")"
      echo "  - $name: $branch ($hash)"
    else
      echo "  - $name: not cloned"
    fi
  done < <(registered_repo_names)
}

detect_repo_language() {
  local repo_path="$1"
  local result=""
  [[ -f "$repo_path/package.json" ]] && result="$result nodejs" || true
  [[ -f "$repo_path/pom.xml" ]] && result="$result java-maven" || true
  [[ -f "$repo_path/build.gradle" || -f "$repo_path/build.gradle.kts" ]] && result="$result java-gradle" || true
  [[ -f "$repo_path/pyproject.toml" || -f "$repo_path/requirements.txt" ]] && result="$result python" || true
  [[ -f "$repo_path/go.mod" ]] && result="$result go" || true
  [[ -f "$repo_path/Cargo.toml" ]] && result="$result rust" || true
  [[ -n "$result" ]] || result=" unknown"
  echo "$result" | xargs || true
}

detect_test_commands() {
  local repo_path="$1"
  if [[ -f "$repo_path/package.json" ]]; then
    if grep -q '"test"' "$repo_path/package.json" 2>/dev/null; then
      echo "npm test"
    fi
    if [[ -f "$repo_path/pnpm-lock.yaml" ]]; then
      echo "pnpm test"
    fi
    if [[ -f "$repo_path/yarn.lock" ]]; then
      echo "yarn test"
    fi
  fi
  if [[ -f "$repo_path/pyproject.toml" || -f "$repo_path/requirements.txt" ]]; then
    echo "pytest"
  fi
  if [[ -f "$repo_path/go.mod" ]]; then
    echo "go test ./..."
  fi
  if [[ -f "$repo_path/Cargo.toml" ]]; then
    echo "cargo test"
  fi
  if [[ -f "$repo_path/pom.xml" ]]; then
    echo "mvn test"
  fi
  if [[ -f "$repo_path/build.gradle" || -f "$repo_path/build.gradle.kts" ]]; then
    echo "./gradlew test"
  fi
  return 0
}

# --- Deep analysis helpers ---

detect_package_manager() {
  local repo_path="$1"
  [[ -f "$repo_path/pnpm-lock.yaml" ]] && echo "pnpm" && return || true
  [[ -f "$repo_path/yarn.lock" ]] && echo "yarn" && return || true
  [[ -f "$repo_path/package-lock.json" ]] && echo "npm" && return || true
  [[ -f "$repo_path/pom.xml" ]] && echo "maven" && return || true
  [[ -f "$repo_path/build.gradle" || -f "$repo_path/build.gradle.kts" ]] && echo "gradle" && return || true
  [[ -f "$repo_path/go.mod" ]] && echo "go-modules" && return || true
  [[ -f "$repo_path/Cargo.toml" ]] && echo "cargo" && return || true
  [[ -f "$repo_path/pyproject.toml" ]] && echo "pip/poetry" && return || true
  [[ -f "$repo_path/requirements.txt" ]] && echo "pip" && return || true
  echo "unknown"
}

detect_framework() {
  local repo_path="$1"
  local frameworks=""
  if [[ -f "$repo_path/package.json" ]]; then
    local pkg="$repo_path/package.json"
    grep -q '"next"' "$pkg" 2>/dev/null && frameworks="$frameworks Next.js" || true
    grep -q '"react"' "$pkg" 2>/dev/null && frameworks="$frameworks React" || true
    grep -q '"vue"' "$pkg" 2>/dev/null && frameworks="$frameworks Vue" || true
    grep -q '"express"' "$pkg" 2>/dev/null && frameworks="$frameworks Express" || true
    grep -q '"koa"' "$pkg" 2>/dev/null && frameworks="$frameworks Koa" || true
    grep -q '"nestjs"' "$pkg" 2>/dev/null && frameworks="$frameworks NestJS" || true
    grep -q '"@nestjs/core"' "$pkg" 2>/dev/null && frameworks="$frameworks NestJS" || true
    grep -q '"fastify"' "$pkg" 2>/dev/null && frameworks="$frameworks Fastify" || true
    grep -q '"hono"' "$pkg" 2>/dev/null && frameworks="$frameworks Hono" || true
  fi
  if [[ -f "$repo_path/pom.xml" ]]; then
    grep -q 'spring-boot' "$repo_path/pom.xml" 2>/dev/null && frameworks="$frameworks SpringBoot" || true
    grep -q 'mybatis' "$repo_path/pom.xml" 2>/dev/null && frameworks="$frameworks MyBatis" || true
  fi
  if [[ -f "$repo_path/go.mod" ]]; then
    grep -q 'gin-gonic' "$repo_path/go.mod" 2>/dev/null && frameworks="$frameworks Gin" || true
    grep -q 'gofiber' "$repo_path/go.mod" 2>/dev/null && frameworks="$frameworks Fiber" || true
    grep -q 'echo' "$repo_path/go.mod" 2>/dev/null && frameworks="$frameworks Echo" || true
  fi
  frameworks="$(echo "$frameworks" | xargs || true)"
  if [[ -n "$frameworks" ]]; then
    echo "$frameworks"
  else
    echo "unknown"
  fi
}

scan_api_routes() {
  local repo_path="$1"
  local output="$2"
  {
    echo "### API Routes / Endpoints"
    echo
  } >> "$output"

  local found=0
  local js_routes
  js_routes="$(grep -rnE '\.(get|post|put|delete|patch)\s*\(' "$repo_path" \
    --include='*.js' --include='*.ts' --include='*.mjs' \
    -h 2>/dev/null | grep -vE 'node_modules|dist|build|\.test\.' | head -30 || true)"
  if [[ -n "$js_routes" ]]; then
    found=1
    {
      echo '```'
      echo "$js_routes"
      echo '```'
    } >> "$output"
  fi

  local java_routes
  java_routes="$(grep -rnE '@(Get|Post|Put|Delete|Patch|Request)Mapping' "$repo_path" \
    --include='*.java' -h 2>/dev/null | head -30 || true)"
  if [[ -n "$java_routes" ]]; then
    found=1
    {
      echo '```'
      echo "$java_routes"
      echo '```'
    } >> "$output"
  fi

  local go_routes
  go_routes="$(grep -rnE '\.(GET|POST|PUT|DELETE|Handle|HandleFunc)\(' "$repo_path" \
    --include='*.go' -h 2>/dev/null | grep -v vendor | head -30 || true)"
  if [[ -n "$go_routes" ]]; then
    found=1
    {
      echo '```'
      echo "$go_routes"
      echo '```'
    } >> "$output"
  fi
  [[ $found -eq 1 ]] || echo "- No API routes detected by static scan." >> "$output"
  echo >> "$output"
}

scan_db_evidence() {
  local repo_path="$1"
  local output="$2"
  {
    echo "### Database / Data Layer Evidence"
    echo
  } >> "$output"

  local found=0
  local migrations
  migrations="$(find "$repo_path" -type f \( -name '*.sql' -o -path '*/migrations/*' -o -path '*/migrate/*' \) \
    -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null | head -20 || true)"
  if [[ -n "$migrations" ]]; then
    found=1
    echo "**Migration/SQL files found:**" >> "$output"
    while IFS= read -r f; do
      [[ -n "$f" ]] && echo "- ${f#$repo_path/}" >> "$output"
    done <<< "$migrations"
    echo >> "$output"
  fi

  local orm_evidence
  orm_evidence="$(grep -rlE '(sequelize|typeorm|prisma|knex|mongoose|@Entity|@Table|@Column|CREATE TABLE|models\.Model)' "$repo_path" \
    --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' \
    2>/dev/null | grep -vE 'node_modules|dist|build|vendor|__pycache__' | head -15 || true)"
  if [[ -n "$orm_evidence" ]]; then
    found=1
    echo "**ORM/Schema files:**" >> "$output"
    while IFS= read -r f; do
      [[ -n "$f" ]] && echo "- ${f#$repo_path/}" >> "$output"
    done <<< "$orm_evidence"
    echo >> "$output"
  fi

  if [[ -f "$repo_path/prisma/schema.prisma" ]]; then
    found=1
    echo "**Prisma Schema (first 40 lines):**" >> "$output"
    echo '```prisma' >> "$output"
    head -40 "$repo_path/prisma/schema.prisma" >> "$output"
    echo '```' >> "$output"
  fi
  [[ $found -eq 1 ]] || echo "- No database evidence detected." >> "$output"
  echo >> "$output"
}

scan_mq_evidence() {
  local repo_path="$1"
  local output="$2"
  {
    echo "### Message Queue / Event Evidence"
    echo
  } >> "$output"

  local found=0
  local mq_hits
  mq_hits="$(grep -rnE '(kafka|rabbitmq|amqp|redis\.pub|bull|celery|nats|pulsar|SQS|SNS|EventBridge|@EventPattern|@MessagePattern)' "$repo_path" \
    --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' --include='*.yaml' --include='*.yml' --include='*.properties' \
    -il 2>/dev/null | grep -vE 'node_modules|dist|build|vendor|__pycache__' | head -15 || true)"
  if [[ -n "$mq_hits" ]]; then
    found=1
    echo "**Files with MQ/event references:**" >> "$output"
    while IFS= read -r f; do
      [[ -n "$f" ]] && echo "- ${f#$repo_path/}" >> "$output"
    done <<< "$mq_hits"
    echo >> "$output"
  fi
  [[ $found -eq 1 ]] || echo "- No MQ/event evidence detected." >> "$output"
  echo >> "$output"
}

scan_todo_debt() {
  local repo_path="$1"
  local output="$2"
  {
    echo "### Technical Debt Indicators"
    echo
  } >> "$output"

  local todo_count hack_count fixme_count
  local raw_todo raw_fixme raw_hack
  raw_todo="$(grep -rn 'TODO' "$repo_path" --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' --include='*.rs' 2>/dev/null || true)"
  todo_count="$(echo "$raw_todo" | grep -vcE 'node_modules|dist|build|vendor|__pycache__' || echo 0)"

  raw_fixme="$(grep -rn 'FIXME' "$repo_path" --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' --include='*.rs' 2>/dev/null || true)"
  fixme_count="$(echo "$raw_fixme" | grep -vcE 'node_modules|dist|build|vendor|__pycache__' || echo 0)"

  raw_hack="$(grep -rn 'HACK' "$repo_path" --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' --include='*.rs' 2>/dev/null || true)"
  hack_count="$(echo "$raw_hack" | grep -vcE 'node_modules|dist|build|vendor|__pycache__' || echo 0)"

  echo "| Type | Count |" >> "$output"
  echo "|---|---|" >> "$output"
  echo "| TODO | $todo_count |" >> "$output"
  echo "| FIXME | $fixme_count |" >> "$output"
  echo "| HACK | $hack_count |" >> "$output"
  echo >> "$output"

  if [[ $fixme_count -gt 0 ]]; then
    echo "**Top FIXME items:**" >> "$output"
    echo '```' >> "$output"
    grep -rn 'FIXME' "$repo_path" --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' 2>/dev/null | grep -vE 'node_modules|dist|build|vendor' | head -10 >> "$output" || true
    echo '```' >> "$output"
  fi
  echo >> "$output"
}

scan_dependency_summary() {
  local repo_path="$1"
  local output="$2"
  {
    echo "### Dependency Summary"
    echo
  } >> "$output"

  if [[ -f "$repo_path/package.json" ]]; then
    echo "**package.json key dependencies:**" >> "$output"
    echo '```json' >> "$output"
    # Extract dependencies section (simplified)
    awk '/\"dependencies\"/{found=1} found{print} found && /\}/{found=0}' "$repo_path/package.json" | head -25 >> "$output" || true
    echo '```' >> "$output"
    echo >> "$output"
  fi
  if [[ -f "$repo_path/go.mod" ]]; then
    echo "**go.mod requires:**" >> "$output"
    echo '```' >> "$output"
    grep -E '^\t' "$repo_path/go.mod" | head -20 >> "$output" || true
    echo '```' >> "$output"
    echo >> "$output"
  fi
  if [[ -f "$repo_path/pom.xml" ]]; then
    echo "**pom.xml key dependencies (first 20 artifact IDs):**" >> "$output"
    echo '```' >> "$output"
    grep '<artifactId>' "$repo_path/pom.xml" | head -20 >> "$output" || true
    echo '```' >> "$output"
    echo >> "$output"
  fi
}

# --- Main analyze function ---

repos_analyze_one() {
  local name="$1"
  local output_file="$2"
  local repo_path="$REPOS_DIR/$name"
  [[ -d "$repo_path/.git" ]] || die "repos '$name' not found"

  local branch hash language pkg_manager framework file_count
  branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
  hash="$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  language="$(detect_repo_language "$repo_path")"
  pkg_manager="$(detect_package_manager "$repo_path")"
  framework="$(detect_framework "$repo_path")"
  file_count="$(find "$repo_path" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' 2>/dev/null | wc -l | tr -d ' ' || echo 0)"

  local test_cmds
  test_cmds="$(detect_test_commands "$repo_path" | tr '\n' ', ' | sed 's/,[[:space:]]*$//' || true)"
  if [[ -z "$test_cmds" ]]; then
    test_cmds="TBD"
  fi

  {
    echo "## $name"
    echo
    echo "| Property | Value |"
    echo "|---|---|"
    echo "| Path | repos/$name |"
    echo "| Branch | $branch |"
    echo "| Revision | $hash |"
    echo "| Language/Stack | $language |"
    echo "| Package Manager | $pkg_manager |"
    echo "| Framework | $framework |"
    echo "| Source Files | ~$file_count |"
    echo "| Test Commands | $test_cmds |"
    echo
    echo "### Module Structure (top 3 levels)"
    echo '```'
  } >> "$output_file"

  find "$repo_path" -maxdepth 3 -type d \
    -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' \
    -not -path '*/__pycache__/*' -not -path '*/target/*' -not -path '*/.next/*' \
    -not -path '*/dist/*' -not -path '*/build/*' \
    2>/dev/null | sed "s#^$repo_path/##" | sort | head -60 >> "$output_file" || true

  {
    echo '```'
    echo
  } >> "$output_file"

  # Deep scans
  scan_api_routes "$repo_path" "$output_file"
  scan_db_evidence "$repo_path" "$output_file"
  scan_mq_evidence "$repo_path" "$output_file"
  scan_dependency_summary "$repo_path" "$output_file"
  scan_todo_debt "$repo_path" "$output_file"

  echo >> "$output_file"
}

repos_analyze() {
  local target="$1"
  mkdir -p "$ROOT_DIR/docs/as-is" "$ROOT_DIR/docs/architecture" "$ROOT_DIR/docs/standards"

  local report="$ROOT_DIR/docs/as-is/repo-inventory.md"
  local technical="$ROOT_DIR/docs/architecture/technical-current-state.md"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %z')"

  # -- Repo Inventory --
  {
    echo "# Repository Inventory"
    echo
    echo "- Generated At: $generated_at"
    echo "- Source: \`dapei repos analyze $target\`"
    echo "- Evidence Level: Items marked [evidence] come from file/config scanning. Items marked [inference] are pattern-based guesses. Items marked [unknown] need manual verification."
    echo
  } > "$report"

  if [[ "$target" == "--all" ]]; then
    local found=0
    while IFS= read -r repo; do
      [[ -n "$repo" ]] || continue
      found=1
      repos_analyze_one "$repo" "$report"
    done < <(registered_repo_names)
    [[ $found -eq 1 ]] || echo "No registered reposs." >> "$report"
  else
    repos_analyze_one "$target" "$report"
  fi

  # -- Technical Current State --
  {
    echo "# Technical Current State"
    echo
    echo "- Generated At: $generated_at"
    echo "- Source Inventory: docs/as-is/repo-inventory.md"
    echo "- Confidence: This document is auto-generated from repository evidence. Architecture conclusions should be refined through conversation and code review."
    echo
    echo "## Summary"
    echo
    echo "This workspace manages the following repositories. See \`docs/as-is/repo-inventory.md\` for detailed per-repo analysis including API routes, database evidence, message queues, dependencies, and technical debt indicators."
    echo
    echo "## Known Repositories"
    echo
    echo "| Repo | Stack | Framework | Package Manager |"
    echo "|---|---|---|---|"
  } > "$technical"

  if [[ "$target" == "--all" ]]; then
    while IFS= read -r repo; do
      [[ -n "$repo" ]] || continue
      local rp="$REPOS_DIR/$repo"
      [[ -d "$rp/.git" ]] || continue
      echo "| $repo | $(detect_repo_language "$rp") | $(detect_framework "$rp") | $(detect_package_manager "$rp") |" >> "$technical"
    done < <(registered_repo_names)
  else
    local rp="$REPOS_DIR/$target"
    if [[ -d "$rp/.git" ]]; then
      echo "| $target | $(detect_repo_language "$rp") | $(detect_framework "$rp") | $(detect_package_manager "$rp") |" >> "$technical"
    fi
  fi

  {
    echo
    echo "## Architecture Unknowns"
    echo
    echo "The following areas require human or agent investigation to complete the architecture picture:"
    echo
    echo "- [ ] Service-to-service communication patterns"
    echo "- [ ] Authentication and authorization model"
    echo "- [ ] Deployment topology and environments"
    echo "- [ ] Observability stack (logging, metrics, tracing)"
    echo "- [ ] Data backup and disaster recovery"
    echo "- [ ] Performance baselines and SLAs"
  } >> "$technical"

  log "repos analysis written: $report"
  log "technical current state written: $technical"
}

