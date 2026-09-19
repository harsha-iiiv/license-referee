# License Referee

**An agent that rules on open-source license compatibility for your dependency
tree — directional, version-exact, with the sources cited.**

- **Live app:** https://license-referee.vercel.app
- **Sanity Studio (structured dataset):** https://license-referee.sanity.studio/
- **Sanity project:** `9qqt8rm4` (dataset `production`)

## What this is

Paste a `package.json`, a GitHub repo URL, or an npm package name. License
Referee resolves every dependency's declared license, checks it against your
project's license in the correct direction, and returns a verdict —
compatible, conditional, incompatible, or disputed — with the verbatim quote
and source URL behind it. You can also just ask it a question ("Can I
statically link an LGPL library into a closed-source app?") without a
project.

It's an AI agent, not a lookup table: it resolves dependencies from the live
npm registry, normalizes whatever license string it finds (`OR`/`AND`
expressions, legacy license objects, ambiguous family names), and reasons
about edge cases — linking vs. separate process, SaaS network use, secondary
license clauses — using a structured dataset instead of guessing from
pretrained knowledge.

## Why this matters

Every modern codebase is mostly other people's code. A typical production
service pulls in hundreds of transitive dependencies, and each one carries a
license that is a real, binding legal agreement — not a formality. Getting
license compatibility wrong has real consequences: forced disclosure of
proprietary source code under a copyleft license, blocked fundraising or
M&A due diligence when license issues surface in a data room, takedown
demands, or straightforward legal liability.

Three things make this hard to get right by hand:

- **Compatibility is directional.** Apache-2.0 code may be included in a
  GPLv3 work. GPLv3 code may **not** be included in an Apache-2.0 work. Same
  two licenses, opposite answer depending on which one is "yours."
- **Version matters.** Apache-2.0 is compatible with GPLv3 and *incompatible*
  with GPLv2 — the Apache Software Foundation says so explicitly, and the
  FSF agrees. `GPL-2.0-only` and `GPL-2.0-or-later` give different answers
  for the same dependency.
- **Authorities disagree.** The OSI has approved licenses the FSF does not
  call "free software." CC0 is FSF-recommended for software but was
  withdrawn from OSI review. A single "is this open source?" answer hides
  that disagreement.

License compliance tooling (software composition analysis, SBOM generation,
open-source risk scanning) is already an established enterprise software
category, and regulatory pressure in that direction is increasing — SBOM
requirements now show up in procurement and security-compliance
requirements in several jurisdictions. Most tools in that category are good
at *detecting* which licenses are present in a dependency tree; fewer are
good at *reasoning* about whether a specific pair is legally compatible, in
which direction, and what you owe as a result. That reasoning step is what
this project is about.

## Who it's for

- **Individual developers and OSS maintainers** deciding whether a
  dependency is safe to add.
- **Legal and compliance teams** who need a fast, citation-backed first pass
  before a manual review, instead of starting from a blank page.
- **Engineering leads and procurement** doing license risk assessment on a
  vendor's or acquisition target's codebase.
- **Builders of other compliance tooling** who want a citation-grounded
  reasoning layer rather than a static rules table.

## How it works

**The dataset** (`studio/schemaTypes/`) is a typed graph, not a bag of text:

| Type | Purpose |
|---|---|
| `license` | One SPDX id: category, OSI/FSF flags, FSF GPL-compatibility verdict, permissions/conditions/limitations |
| `compatibilityRuling` | Directional: `from` → `into`, verdict, combination kind (linking / source / separate process), verbatim quote, source URL, and an optional `dissent` when another authority disagrees |
| `obligation` | What you must *do* — per license, per trigger (distribute, modify, link, serve over a network) |
| `source` | The authorities themselves, ranked by what they're authoritative *for* |

`npm run import` builds this from the full SPDX License List,
choosealicense.com's permissions/conditions/limitations metadata, and 138
hand-verified directional rulings, each with a quote checked against its
cited source page.

**The agent** (`web/`, Next.js + Vercel AI SDK + Gemini) reads this dataset
over two read-only Sanity Context MCP endpoints:

- **Knowledge Base mode** — `knowledge_base_read`, indexed from the dataset
  above, for explanations, obligations, and cross-source reconciliation.
- **GROQ mode** — `groq_query` / `schema_explorer`, live queries over the
  typed dataset for exact, deterministic verdicts.

A golden-set eval comparing this configuration against a keyword-search
baseline (same source pages, no structure) and a no-retrieval baseline
(model's own knowledge only):

| Mode | Pass | Avg score | Cited |
|---|---|---|---|
| **Sanity Context** (this agent) | 21/22 | 98% | 22/22 |
| Keyword search (same source pages) | 21/22 | 98% | 22/22 |
| No retrieval (model's own knowledge) | 16/22 | 93% | 22/22 |

The score gap alone undersells it. On an obscure license
(`BlueOak-1.0.0` into a GPL-3.0-only project) the no-retrieval mode reached
the right verdict but backed it with a citation that doesn't exist — a
fabricated FSF license-list entry, checked live against the real page. Both
retrieval-backed modes instead said, correctly, that no FSF ruling exists
for it. A right verdict with an invented authority is worse than a right
verdict with an honest "no ruling exists" — only grounding in real content
tells the two apart.

## Running it

```bash
npm install                 # root: import script deps
npm run import              # build the Sanity dataset from scripts/data/
npm run mcp:check           # smoke-test both Context MCP endpoints

cd web && npm install
cp ../.env .env.local        # SANITY_*, GOOGLE_GENERATIVE_AI_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run eval                 # golden set × {sanity, keyword, none}
```

`studio/` is a standard Sanity Studio: `cd studio && npx sanity dev`.

## Known limitations

- npm ecosystem only (no PyPI/Cargo/Maven resolvers yet).
- Direct dependencies only — a full transitive audit is future work.
- Rulings cover the license pairs a real npm dependency tree hits most often
  (138), not the full SPDX × SPDX matrix; unmapped pairs fall back to the
  license's own `gplCompatibility` field and are marked `unknown` if that
  isn't enough to answer.
- Not legal advice. It cites primary sources so you (or your counsel) can
  verify; it does not replace review for anything consequential.

## License

MIT — see [LICENSE](LICENSE).
