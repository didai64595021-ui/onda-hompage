# Kmong Auto Reply ERP Worklog

## Current Goal
Implement the Kmong auto-reply generation flow as an internal ERP workflow: learn seller tone from copied/edited replies, let AI generate reply drafts, and support copy-paste/manual review instead of relying on blind auto-send.

## Checklist
- [x] Inspect existing Kmong reply bot, style profile, command queue, and dashboard tabs.
- [x] Identify current gap: dashboard approves/sends but does not provide a proper copy-paste workflow or command-triggered generation.
- [x] Update style-profile learning to include historical seller replies and admin edited/copy-approved feedback.
- [x] Add dashboard command support for reply generation/regeneration and style-profile refresh.
- [x] Replace automatic-send oriented ERP actions with copy, edit, regenerate, skip, and generation request actions.
- [x] Log admin edits/copy approvals into `kmong_reply_feedback` for future tone learning.
- [x] Validate static dashboard and Node scripts.
- [ ] Commit, push, and verify the live GitHub Pages dashboard.

## Completed
- Existing bot already has `auto-reply.js`, `style-profile.js`, `reply-generator.js`, Telegram review cards, and Supabase feedback tables.
- Existing dashboard has an `자동응답` tab, but its UX still centers on approve/send instead of internal ERP copy-paste.
- Existing `command-processor.js` does not yet process reply generation commands.
- `style-profile.js` now treats `kmong_reply_feedback` admin edits/approvals as first-priority tone samples.
- `command-processor.js` now handles `generate_reply`, `regen_reply`, and `refresh_style_profile`.
- Dashboard auto-reply tab now supports AI generation command registration, regenerate, copy, edit, skip, bulk pending generation, and style-profile refresh.
- Validation passed: `node --check` for changed crawler scripts and `npm run validate`.
- Local Playwright checks passed for `390`, `768`, and `1440` widths; no page/console errors on the auto-reply tab.

## Remaining
- Commit and push.
- Verify the live GitHub Pages dashboard after deployment.

## Last Action
Local Playwright verified the auto-reply ERP tab and edit modal on the static server at `http://127.0.0.1:4173/portfolio-sites/kmong-dashboard/`.

## Blockers
- No current blocker. Direct browser-side AI calls were intentionally avoided because API secrets must stay server-side.

## Next Action
Stop local server, review git diff, commit, push, and verify live GitHub Pages.
