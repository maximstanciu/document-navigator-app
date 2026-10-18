"""Bad phone photos of documents from the other kits, for the test set (plan task 0.6, SPEC §7.6, ANL-7).

Six gallery cases: the speeding fine shot at an angle on a desk, the electricity statement in dim light, the
phone bill slightly out of focus, the first page of the child benefit letter under the shadow of the hand,
the forged electricity letter photographed at an angle, and the bank letter blurred by a shaking hand beyond
reading. The readable ones expect the same analysis as the PDF (the issue may be reported); the shaken one
expects quality.readable = false. Documents are rebuilt for --today, so the dates match the other kits.

Writes <out>/Pictures/DocNavigatorTest/*.jpg and <out>/labels.json (format: scripts/eval/README.md).

Usage: python scripts/eval/synthetic/photos_kit.py [--today YYYY-MM-DD] [--timezone Europe/Berlin] [--out DIR]
"""

import authorities_kit
import fraud_kit
import invoices_kit
import languages_kit
from common import (
    KitWriter,
    dim_light,
    hand_shadow,
    only_pages,
    photo_on_table,
    render_pages,
    run_kit,
    shaken,
    soft_focus,
)

KIT = "photos"

# Page corners on a 1650 × 2200 photo (top-left, top-right, bottom-right, bottom-left).
STRAIGHT = [(150, 170), (1500, 150), (1520, 2050), (130, 2070)]
ANGLED = [
    [(230, 260), (1430, 140), (1580, 1990), (90, 2110)],
    [(170, 140), (1460, 230), (1530, 2120), (210, 1990)],
]


def _with_quality(expect, page_count, **quality):
    return {**expect, "quality": {"readable": True, **quality}, "pageCount": page_count}


def generate(out, today, timezone):
    writer = KitWriter(out, today)

    def save(name, images):
        paths = []
        for i, image in enumerate(images, start=1):
            paths.append(writer.pictures / f"{name}-page-{i}.jpg")
            image.save(paths[-1], quality=82)
        return paths

    fine = authorities_kit.speeding_fine(today)
    photos = [photo_on_table(page, ANGLED[i % 2]) for i, page in enumerate(render_pages(fine.pdf, 150))]
    writer.add(save("speeding-fine-angled", photos), "gallery", ["CAP-3", "CAP-4", "CAP-5"],
               _with_quality(fine.expect, len(photos)))  # fmt: skip

    statement = invoices_kit.utility_statement(today)
    photos = [dim_light(photo_on_table(page, STRAIGHT, light=0.8)) for page in render_pages(statement.pdf, 150)]
    writer.add(save("electricity-statement-dark", photos), "gallery", ["CAP-4", "ANL-7"],
               _with_quality(statement.expect, len(photos), issuesMayInclude=["dark"]))  # fmt: skip

    bill = invoices_kit.phone_bill(today)
    photos = [soft_focus(photo_on_table(page, STRAIGHT), 1.6) for page in render_pages(bill.pdf, 150)]
    writer.add(save("phone-bill-blurry", photos), "gallery", ["CAP-4", "ANL-7"],
               _with_quality(bill.expect, len(photos), issuesMayInclude=["blurry"]))  # fmt: skip

    benefit = authorities_kit.child_benefit_request(today)
    first = render_pages(benefit.pdf, 150)[0]
    shadow = [(900, 1150), (1650, 1000), (1650, 2200), (700, 2200)]
    photo = hand_shadow(photo_on_table(first, ANGLED[1]), shadow, darkness=0.55)
    expect = only_pages(benefit.expect, {1})
    expect["quality"]["issuesMayInclude"] += ["dark"]
    writer.add(save("child-benefit-shadow-first-page", [photo]), "gallery", ["CAP-4", "ANL-7"],
               {**expect, "pageCount": 1})  # fmt: skip

    forged = fraud_kit.fake_utility(today)
    photos = [photo_on_table(page, ANGLED[0], base=(176, 176, 170)) for page in render_pages(forged.pdf, 150)]
    writer.add(save("forged-electricity-letter-angled", photos), "gallery", ["CAP-4", "ANL-11"],
               _with_quality(forged.expect, len(photos)))  # fmt: skip

    bank = languages_kit.bank_letter(today)
    photos = [soft_focus(shaken(photo_on_table(page, STRAIGHT), 38), 1.5) for page in render_pages(bank.pdf, 100)]
    writer.add(save("bank-letter-shaken-unreadable", photos), "gallery", ["ANL-7"],
               {"outcome": "analysis", "quality": {"readable": False, "issuesAnyOf": ["blurry"]}, "deadlines": []})  # fmt: skip

    return writer.write_labels(KIT, __file__, timezone)


if __name__ == "__main__":
    run_kit(__doc__, KIT, generate)
