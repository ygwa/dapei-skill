#!/usr/bin/env bash

extract_stage_block() {
  local workflow_file="$1"
  local stage="$2"
  awk -v stage="$stage" '
    BEGIN { in_stage=0 }
    $0 ~ "^[[:space:]]*- id: " stage "$" { in_stage=1; next }
    in_stage && $0 ~ "^[[:space:]]*- id: " { exit }
    in_stage { print }
  ' "$workflow_file"
}

stage_exists() {
  local workflow_file="$1"
  local stage="$2"
  grep -q "^[[:space:]]*- id: $stage$" "$workflow_file"
}

stage_requires() {
  local workflow_file="$1"
  local stage="$2"
  extract_stage_block "$workflow_file" "$stage" |
    awk '/^[[:space:]]*requires:[[:space:]]*\[/ {
      line=$0
      sub(/^.*\[/, "", line)
      sub(/\].*$/, "", line)
      gsub(/[",]/, "", line)
      print line
      exit
    }' |
    tr ' ' '\n' |
    sed '/^$/d'
}

sanitize_stage_output_path() {
  local raw="$1"
  raw="$(echo "$raw" | sed -E 's/[[:space:]]*\(.*\)[[:space:]]*$//')"
  raw="$(echo "$raw" | xargs)"
  printf '%s\n' "$raw"
}

stage_outputs() {
  local workflow_file="$1"
  local stage="$2"
  extract_stage_block "$workflow_file" "$stage" |
    awk '
      /^[[:space:]]*outputs:[[:space:]]*$/ { in_outputs=1; next }
      in_outputs && /^[[:space:]]*[a-zA-Z_-]+:[[:space:]]*$/ { exit }
      in_outputs && /^[[:space:]]*-[[:space:]]+/ {
        line=$0
        sub(/^[[:space:]]*-[[:space:]]+/, "", line)
        print line
      }
    '
}

ensure_stage_output_shells() {
  local feature_dir="$1"
  local workflow_file="$2"
  local stage="$3"

  while IFS= read -r raw_out; do
    local output_path
    output_path="$(sanitize_stage_output_path "$raw_out")"
    case "$output_path" in
      ""|"code changes"|"all reports"|"layered context"|"feature manifest"|"repos/")
        continue
        ;;
    esac

    if [[ "$output_path" == reports/* && ! -e "$feature_dir/$output_path" ]]; then
      mkdir -p "$(dirname "$feature_dir/$output_path")"
      {
        echo "# $(basename "$output_path" .md | tr '-' ' ')"
        echo
        echo "- Stage: $stage"
        echo "- Status: pending content"
      } > "$feature_dir/$output_path"
    fi

    if [[ "$output_path" == release-notes.md && ! -e "$feature_dir/$output_path" ]]; then
      {
        echo "# Release Notes"
        echo
        echo "- Feature: $(basename "$feature_dir")"
        echo "- Status: pending content"
      } > "$feature_dir/$output_path"
    fi
  done < <(stage_outputs "$workflow_file" "$stage")
}

validate_stage_outputs() {
  local feature_dir="$1"
  local workflow_file="$2"
  local stage="$3"
  local missing=0

  while IFS= read -r raw_out; do
    local output_path
    output_path="$(sanitize_stage_output_path "$raw_out")"
    case "$output_path" in
      ""|"code changes"|"all reports"|"layered context"|"feature manifest"|"repos/")
        continue
        ;;
    esac
    if [[ ! -e "$feature_dir/$output_path" ]]; then
      err "stage '$stage' missing declared output: $output_path"
      missing=1
    fi
  done < <(stage_outputs "$workflow_file" "$stage")

  return $missing
}

run_workflow_stage() {
  local feature="$1"
  local stage="$2"
  local feature_dir
  feature_dir="$(require_feature_dir "$feature")"
  local workflow_file="$DAPEI_DIR/workflows/feature-lifecycle.yaml"
  [[ -f "$workflow_file" ]] || die "workflow file not found: $workflow_file"
  stage_exists "$workflow_file" "$stage" || die "stage '$stage' not found in workflow"

  local required
  while IFS= read -r required; do
    [[ -n "$required" ]] || continue
    if [[ ! -f "$feature_dir/reports/stage-$required.completed" ]]; then
      die "required stage '$required' not completed before running '$stage'"
    fi
  done < <(stage_requires "$workflow_file" "$stage")

  mkdir -p "$feature_dir/reports"
  context_build "$feature" "$stage"

  {
    echo
    echo "## Stage: $stage"
    echo "- Time: $(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "- Status: started"
  } >> "$feature_dir/reports/feature-progress.md"

  ensure_stage_output_shells "$feature_dir" "$workflow_file" "$stage"

  if ! validate_stage_outputs "$feature_dir" "$workflow_file" "$stage"; then
    {
      echo "- Status: failed"
      echo "- Reason: missing declared outputs"
    } >> "$feature_dir/reports/feature-progress.md"
    exit 1
  fi

  local marker_file="$feature_dir/reports/stage-$stage.completed"
  {
    echo "stage: $stage"
    echo "completed-at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$marker_file"

  {
    echo "- Status: completed"
    echo "- Marker: reports/stage-$stage.completed"
  } >> "$feature_dir/reports/feature-progress.md"

  log "workflow stage completed: feature=$feature stage=$stage"
}
