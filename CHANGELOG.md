# Changelog / تغییرات

All notable changes to NobatYar are documented here. This file follows Keep a Changelog style.

## [1.0.0] — 2026-11-22

### Added / اضافهشدنیها

- **M1–M4:** MFA/Passkey, policy visualizer, smart recurring booking + ICS, refund worker with maker/checker approval.
- **M5–M8:** notification orchestrator with quiet hours, escalation, templates and DLQ; secure file pipeline (magic bytes, quarantine, ClamAV); chat assist with redaction and consented summaries; smart video rooms with dual recording consent.
- **M9–M12:** patient-centered health timeline, medication reconciliation, encrypted patient export; triage governance with explainable rules and 115 notice; autonomous ops with SLO burn-rate and chaos gates; property-based quality tooling, mutation, visual regression, a11y and SBOM.
- **M13–M15:** PHI-free product analytics (funnel/cohort/NPS/A-B), clinic ecosystem with haversine search and organization plans, accessibility/UI preferences.
- Runtime correctness: M9 module registration, refund worker DI, funnel RLS write, full E2E MFA admin hook and tests.
- GitHub readiness: bilingual README, view-only legal notice, security policy, issue templates, social-preview covers.
- Four large 2560×1280 volumetric 3D covers with neon, aurora, amber and quantum-mesh palettes; English-only README with a full technical catalog.
- Product demo MP4 and generated poster added to the README and guarded by CI hygiene checks.

### Changed / تغییرات

- KMS is fail-closed in production with Vault Transit; dev falls back to `FIELD_KEYS` with a warning.
- Storage download URLs now require an `APPROVED` file analysis when M6 is enabled.
- OpenAPI registry covers **207 operations** with 100% controller coverage.

### Tests / تستها

- API: 85 files / 729 tests · Web: 21 files / 190 tests · E2E: 15/15 · mutation kill-rate 1.0 · a11y 0 critical violations.

[1.0.0]: https://github.com/MFCAtash/nobatyar/releases/tag/v1.0.0
