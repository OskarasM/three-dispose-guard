# Vendored agent contract checker

Copied unchanged from the owner's private agent-setup repository, revision f825239bd3955220fdb7a4101af9048483ba20ad.
Both files are required: check.mjs reads repo-policies.json beside it. It reads files and Git metadata only and never runs commands found in documents.
It validates the AGENTS.md contract and the docs/STATE.md, docs/ROADMAP.md and docs/DECISIONS.md structure. CI runs it with `--ci`, which does not require the local-only CLAUDE.md.

| file | sha256 (LF bytes as committed) |
|---|---|
| check.mjs | 36b3c798ad33f60421c2fcb9802938e72e82ef02d046b6515396f99121f35ab1 |
| repo-policies.json | 624d772b016a9dc8c43c1263c6a8fa09df95504029aba010bc9097b2b512ff21 |

This directory is skipped by `scripts/check-prose.mjs`, because the vendored bytes must stay identical to the source and use American spelling.

To update: copy both files from a newer agent-setup revision together, then update this revision and the hashes.
