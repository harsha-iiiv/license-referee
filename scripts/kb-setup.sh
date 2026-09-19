#!/usr/bin/env bash
# Import content into a Sanity Context Knowledge Base and build it.
# NOT CURRENTLY RUNNABLE: the org's free-tier plan caps indexed documents,
# and the "docs" knowledge base already sits at 243/150 from the dataset
# import alone. Adding these source-page crawls needs a plan upgrade first.
# Left here ready to run once that's raised.
# Usage: ./scripts/kb-setup.sh <knowledge-base-id>
# Requires SANITY_AUTH_TOKEN (an org-level token with Context Editor grant)
# in the environment, e.g.: set -a && . ./.env && SANITY_AUTH_TOKEN=$SANITY_ORGANIZATION_TOKEN set +a
set -euo pipefail

KB_ID="${1:?usage: kb-setup.sh <knowledge-base-id>}"
SANITY="./studio/node_modules/.bin/sanity"

SOURCE_URLS=(
  "https://blueoakcouncil.org/license/1.0.0"
  "https://choosealicense.com/licenses/0bsd/"
  "https://choosealicense.com/licenses/bsd-2-clause/"
  "https://choosealicense.com/licenses/bsd-3-clause/"
  "https://choosealicense.com/licenses/cc0-1.0/"
  "https://choosealicense.com/licenses/isc/"
  "https://choosealicense.com/licenses/mit/"
  "https://choosealicense.com/licenses/unlicense/"
  "https://choosealicense.com/licenses/zlib/"
  "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository"
  "https://spdx.org/licenses/BUSL-1.1.html"
  "https://spdx.org/licenses/PostgreSQL.html"
  "https://spdx.org/licenses/SSPL-1.0.html"
  "https://www.apache.org/legal/resolved.html"
  "https://www.apache.org/licenses/GPL-compatibility.html"
  "https://www.apache.org/licenses/LICENSE-2.0"
  "https://www.eclipse.org/legal/epl-2.0/faq.php"
  "https://www.gnu.org/licenses/gpl-faq.html"
  "https://www.gnu.org/licenses/license-list.html"
  "https://www.mozilla.org/en-US/MPL/2.0/"
  "https://www.mozilla.org/en-US/MPL/2.0/FAQ/"
)

echo "Binding Sanity dataset (9qqt8rm4/production: license, compatibilityRuling, obligation, source docs)..."
"$SANITY" context imports create "$KB_ID" \
  --query '*[_type in ["license","compatibilityRuling","obligation","source"]]' \
  --sanity-project 9qqt8rm4 \
  --sanity-dataset production

for url in "${SOURCE_URLS[@]}"; do
  echo "Importing $url ..."
  "$SANITY" context imports create "$KB_ID" --url "$url"
done

echo "Starting build (--watch)..."
"$SANITY" context build "$KB_ID" --watch

echo "Done. Knowledge base $KB_ID is built."
