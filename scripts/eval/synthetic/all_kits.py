"""Regenerates every synthetic kit of the test set (plan task 0.6) for one --today.

Each kit goes to <out>/<kit>/ with its own labels.json (format: scripts/eval/README.md); the evaluation reads
<out>/*/labels.json. Prints the number of cases per kit and how many expect an analysis.

Usage: python scripts/eval/synthetic/all_kits.py [--today YYYY-MM-DD] [--timezone Europe/Berlin] [--out DIR]
"""

import authorities_kit
import fraud_kit
import invoices_kit
import languages_kit
import photos_kit
import tenancy_kit
from common import arguments, register_fonts

KITS = [tenancy_kit, invoices_kit, authorities_kit, fraud_kit, languages_kit, photos_kit]


def main():
    args = arguments(__doc__, None)
    register_fonts(args.font_dir)
    total = analyses = 0
    for kit in KITS:
        documents = kit.generate(args.out / kit.KIT, args.today, args.timezone)
        count = sum(document["expect"]["outcome"] == "analysis" for document in documents)
        print(f"{kit.KIT:12} {len(documents):3} cases, {count:3} expect an analysis  ->  {args.out / kit.KIT}")
        total += len(documents)
        analyses += count
    print(f"\n{total} labelled cases, {analyses} expecting an analysis, for today = {args.today}")


if __name__ == "__main__":
    main()
