# CLAUDE.md

Car Doctor: an offline PWA that diagnoses car and truck problems with a Naive Bayes model trained in Python and run in the browser. A Caylor Made Technologies project. See README.md for how it works.

## Project memory (Obsidian vault)
The full history, decisions, and next steps for this project live in the
`Caylor-Made-Technologies/obsidian-vault` repo at `Projects/Car Doctor.md`.

- **At the start of a session**, if the task involves a decision or you need background,
  attach `Caylor-Made-Technologies/obsidian-vault` and read `Projects/Car Doctor.md`
  and the vault's `CLAUDE.md`.
- **Before the session ends**, whenever anything changed, attach the vault repo and update
  `Projects/Car Doctor.md`:
  - a dated line under **Log** saying what changed
  - any new decision and its reason under **Decisions**
  - updated **Status** and **Next steps**
  Commit and push that to the vault's `main` branch.
- Never copy keys, passwords, or customer personal info into the vault.

## Working here
- No AI APIs. The model is trained by `model/train.py` and runs in `app/app.js`.
- `tokenize`, `stem`, `STOPWORDS` and `SYNONYM_GROUPS` exist in both `model/train.py` and `app/app.js`. Change both. `tests/check.py` catches drift.
- Never hand-edit `app/model.json`; run `python model/train.py`.
- Bump `VERSION` in `app/sw.js` when app files change.
- Before pushing: `python model/train.py && python tests/check.py`, and click through the app.
- Only `app/` is published (GitHub Actions → Pages), so this file stays off the live site.
- Jonathon is usually on his phone: keep explanations short.
- No Claude or Anthropic naming anywhere: no "Co-Authored-By: Claude" or session links in commits or PRs, no `claude/` branch names, no "Generated with Claude" text, no mentions in app files. Commit as `Caylor Made Technologies <andycaylor@icloud.com>`.
