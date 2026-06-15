#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# seed_drugs.sh — Import large Indian drug CSV into drug_catalog via psql COPY
#
# Usage:
#   bash scripts/seed_drugs.sh /path/to/indian_drugs.csv
#   bash scripts/seed_drugs.sh /path/to/indian_drugs.csv --clear
#
# The CSV must have a header row. Supported column names (case-insensitive):
#   brand_name / brand / name / medicine_name / product_name
#   generic_name / generic / composition / salt_composition
#   manufacturer / company / mfr
#   strength / dosage
#   dosage_form / form / type
#   category        (allopathy | homeopathy | ayurvedic | unani)
#   schedule        (H | H1 | X | OTC …)
#
# Free data sources:
#   CDSCO (50k+):  https://cdscoonline.gov.in → Approved Drugs → Export Excel → CSV
#   Kaggle (11k):  https://www.kaggle.com/datasets/shudhanshusingh/medicines-india
#   1mg (6k+):     https://www.kaggle.com/datasets/singhakash/1mg-data
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CSV_FILE="${1:-}"
CLEAR="${2:-}"

if [[ -z "$CSV_FILE" ]]; then
  echo "Usage: bash scripts/seed_drugs.sh /path/to/drugs.csv [--clear]"
  exit 1
fi

if [[ ! -f "$CSV_FILE" ]]; then
  echo "❌  File not found: $CSV_FILE"
  exit 1
fi

# Load .env if present
if [[ -f "$(dirname "$0")/../.env" ]]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "❌  DATABASE_URL not set. Export it or add it to .env"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Indian Drug Catalog — CSV Importer         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  File   : $CSV_FILE"
echo "  DB     : ${DB_URL%%@*}@…"

# Detect column positions from header row
HEADER=$(head -1 "$CSV_FILE" | tr '[:upper:]' '[:lower:]' | tr -d '\r')

col_index() {
  local h="$HEADER"
  local target="$1"
  local IFS=','
  local i=0
  for col in $h; do
    col=$(echo "$col" | tr -d '"' | xargs)
    if [[ "$col" == "$target" ]]; then echo "$i"; return; fi
    ((i++))
  done
  echo "-1"
}

# Find column indexes
IDX_BRAND=$(   col_index "brand_name");   [[ "$IDX_BRAND"   == "-1" ]] && IDX_BRAND=$(col_index "brand"); [[ "$IDX_BRAND"   == "-1" ]] && IDX_BRAND=$(col_index "name"); [[ "$IDX_BRAND"   == "-1" ]] && IDX_BRAND=$(col_index "medicine_name"); [[ "$IDX_BRAND"   == "-1" ]] && IDX_BRAND=$(col_index "product_name")
IDX_GENERIC=$( col_index "generic_name"); [[ "$IDX_GENERIC" == "-1" ]] && IDX_GENERIC=$(col_index "generic"); [[ "$IDX_GENERIC" == "-1" ]] && IDX_GENERIC=$(col_index "composition"); [[ "$IDX_GENERIC" == "-1" ]] && IDX_GENERIC=$(col_index "salt_composition")
IDX_MFR=$(     col_index "manufacturer"); [[ "$IDX_MFR"     == "-1" ]] && IDX_MFR=$(col_index "company"); [[ "$IDX_MFR"     == "-1" ]] && IDX_MFR=$(col_index "mfr")
IDX_STR=$(     col_index "strength");     [[ "$IDX_STR"     == "-1" ]] && IDX_STR=$(col_index "dosage")
IDX_FORM=$(    col_index "dosage_form");  [[ "$IDX_FORM"    == "-1" ]] && IDX_FORM=$(col_index "form"); [[ "$IDX_FORM"    == "-1" ]] && IDX_FORM=$(col_index "type")
IDX_CAT=$(     col_index "category")
IDX_SCHED=$(   col_index "schedule")

echo ""
echo "  Detected columns:"
echo "    brand_name  → col $IDX_BRAND"
echo "    generic     → col $IDX_GENERIC"
echo "    manufacturer→ col $IDX_MFR"
echo "    strength    → col $IDX_STR"
echo "    dosage_form → col $IDX_FORM"
echo "    category    → col $IDX_CAT"
echo "    schedule    → col $IDX_SCHED"
echo ""

if [[ "$IDX_BRAND" == "-1" ]]; then
  echo "❌  Could not detect brand_name column. Check CSV header."
  exit 1
fi

# Optional: clear existing data
if [[ "$CLEAR" == "--clear" ]]; then
  echo "  ⚠ Truncating drug_catalog…"
  psql "$DB_URL" -c "TRUNCATE drug_catalog RESTART IDENTITY;" > /dev/null
fi

# Create a temp normalised CSV with fixed column order
TMPFILE=$(mktemp /tmp/drug_import_XXXXXX.csv)
trap "rm -f $TMPFILE" EXIT

echo "brand_name,generic_name,manufacturer,strength,dosage_form,category,schedule" > "$TMPFILE"

tail -n +2 "$CSV_FILE" | python3 - "$IDX_BRAND" "$IDX_GENERIC" "$IDX_MFR" "$IDX_STR" "$IDX_FORM" "$IDX_CAT" "$IDX_SCHED" <<'PYEOF' >> "$TMPFILE"
import sys, csv, io

indexes = [int(x) for x in sys.argv[1:]]

reader = csv.reader(sys.stdin)
writer = csv.writer(sys.stdout)

for row in reader:
    def g(i):
        if i == -1 or i >= len(row): return ''
        return row[i].strip()
    brand = g(indexes[0])
    if not brand:
        continue
    cat = g(indexes[5]).lower() or 'allopathy'
    if cat not in ('allopathy','homeopathy','ayurvedic','unani','siddha'):
        cat = 'allopathy'
    writer.writerow([brand, g(indexes[1]), g(indexes[2]), g(indexes[3]), g(indexes[4]), cat, g(indexes[6])])
PYEOF

ROW_COUNT=$(( $(wc -l < "$TMPFILE") - 1 ))
echo "  Rows to import: $(printf '%s' "$ROW_COUNT" | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"
echo ""

# Import via psql \COPY (client-side, no superuser needed)
psql "$DB_URL" <<SQL
\COPY drug_catalog (brand_name, generic_name, manufacturer, strength, dosage_form, category, schedule)
FROM '$TMPFILE'
WITH (FORMAT CSV, HEADER TRUE, NULL '');

SELECT category, COUNT(*) AS total
FROM   drug_catalog
GROUP  BY category
ORDER  BY total DESC;
SQL

echo ""
echo "  ✓ Import complete."
echo ""
