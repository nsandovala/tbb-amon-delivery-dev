version: 1

loop:
  name: "AMON Codex Loop"
  purpose: "Debug, patch and verify with minimal-risk engineering discipline"

stages:
  - observe
  - diagnose
  - plan
  - patch
  - verify
  - learn
  - persist

rules:
  observe:
    must:
      - read_context_files
      - inspect_target_files
      - inspect_recent_audits
      - inspect_contracts
    forbid:
      - editing_before_diagnosis
      - speculative_refactor
    output:
      - touched_scope
      - current_runtime_state
      - known_constraints

  diagnose:
    must:
      - identify_root_cause
      - distinguish_symptom_vs_root_cause
      - identify_broken_contracts
      - identify_risk_level
    forbid:
      - vague_language_without_evidence
      - "fixing symptoms only"
    output:
      - root_cause
      - secondary_causes
      - impacted_files
      - severity

  plan:
    must:
      - propose_minimal_fix
      - define_validation_commands
      - define_expected_runtime_result
    forbid:
      - broad_refactor_without_request
      - introducing_new_architecture_mid-debug
    output:
      - files_to_change
      - change_order
      - validation_plan
      - rollback_note

  patch:
    must:
      - touch_minimum_files
      - preserve_contracts
      - preserve_backend_first_architecture
      - prefer_existing_patterns
    forbid:
      - mocks
      - direct_critical_writes_from_frontend
      - firebase_admin_in_frontend
      - schema_drift
    output:
      - changed_files
      - summary_of_changes

  verify:
    must:
      - run_typecheck
      - run_build_when_applicable
      - run_seed_when_required
      - validate_manual_flow_when_requested
    forbid:
      - claiming_success_without_commands
    output:
      - commands_run
      - exact_results
      - remaining_failures
      - pass_fail_status

  learn:
    must:
      - record_failure_pattern
      - record_prevention_rule
      - record_if_contract_was_wrong_or_code_was_wrong
    output:
      - anti_pattern_candidate
      - prevention_note

  persist:
    must:
      - update_recent_audits
      - update_phase_log
      - update_current_sprint_if_scope_changed
    forbid:
      - storing_unverified_claims
    output:
      - persisted_files