"""Shared helpers for the synthetic kits (plan task 0.6): dates, fonts, PDF layout, labels and photos.

Every kit writes <out>/Download/DocNavigatorTest/ (for «Файл»), <out>/Pictures/DocNavigatorTest/ (for «Фото из
галереи») and <out>/labels.json in the format of scripts/eval/README.md. Labels find the page of every quote in
the generated PDF, so they follow the layout; check_expect() catches typos in kinds and levels before writing.
"""

import argparse
import calendar
import io
import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import pillow_heif
import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
from pypdf import PdfReader
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_ROOT = REPO_ROOT / "scripts" / "eval" / "out"
DEVICE_FOLDER = "DocNavigatorTest"
SUBJECT = "Synthetic test document for DocNavigator – all data fictitious"
FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/opt/homebrew/share/fonts",
    "/usr/local/share/fonts",
    "/Library/Fonts",
]

rl_config.invariant = 1  # Same --today, same bytes.
pillow_heif.register_heif_opener()

# --- Dates -----------------------------------------------------------------------------------------

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]  # fmt: skip
MONTHS_DE = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]  # fmt: skip
MONTHS_RU = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]  # fmt: skip
WEEKDAYS_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
# Nationwide German holidays on fixed dates; enough for "the 3rd working day of a month".
FIXED_HOLIDAYS = {(1, 1), (5, 1), (10, 3), (12, 25), (12, 26)}
DAY = timedelta(days=1)


def is_working_day(d):
    return d.weekday() < 5 and (d.month, d.day) not in FIXED_HOLIDAYS


def add_months(d, months):
    index = d.month - 1 + months
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def nth_working_day(month_start, n):
    d, seen = month_start, 0
    while True:
        seen += is_working_day(d)
        if seen == n:
            return d
        d += DAY


def next_day_where(start, condition):
    d = start
    while not condition(d):
        d += DAY
    return d


def next_working_day(d):
    """d itself if it is a working day, else the next one (a deadline on a weekend moves forward)."""
    return next_day_where(d, is_working_day)


def add_working_days(d, n):
    for _ in range(n):
        d = next_working_day(d + DAY)
    return d


def month_start_after(d):
    """The 1st of the month after d, or d itself if it is a 1st."""
    return d if d.day == 1 else add_months(d.replace(day=1), 1)


def en(d):
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def month_year(d):
    return f"{MONTHS[d.month - 1]} {d.year}"


def de(d):
    return d.strftime("%d.%m.%Y")


def de_long(d):
    return f"{d.day}. {MONTHS_DE[d.month - 1]} {d.year}"


def de_month_year(d):
    return f"{MONTHS_DE[d.month - 1]} {d.year}"


def ru(d):
    return f"{d.day} {MONTHS_RU[d.month - 1]} {d.year} г."


def slashed(d):
    return d.strftime("%d/%m/%Y")


# --- Money and accounts ----------------------------------------------------------------------------

CENT = Decimal("0.01")


def money(value):
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def _grouped(value, thousands, decimal):
    whole, fraction = f"{money(value):,.2f}".split(".")
    return whole.replace(",", thousands) + decimal + fraction


def eur_de(value):
    return f"{_grouped(value, '.', ',')} €"


def eur_en(value):
    return f"€{_grouped(value, ',', '.')}"


def eur_ru(value):
    return f"{_grouped(value, ' ', ',')} €"


def iban(country, bban):
    """A fictitious IBAN with correct check digits, grouped by four."""
    digits = "".join(str(int(ch, 36)) for ch in bban + country + "00")
    raw = f"{country}{98 - int(digits) % 97:02d}{bban}"
    return " ".join(raw[i : i + 4] for i in range(0, len(raw), 4))


# --- Fonts, styles, flowables ----------------------------------------------------------------------

INK = colors.HexColor("#1b1b1b")
MUTED = colors.HexColor("#5a5a5a")
RULE = colors.HexColor("#9a9a9a")
FRAUD_RED = colors.HexColor("#8a1010")


def register_fonts(font_dir):
    candidates = [font_dir] if font_dir else FONT_DIRS
    folder = next((d for d in candidates if d and os.path.exists(os.path.join(d, "DejaVuSans.ttf"))), None)
    if not folder:
        raise SystemExit("DejaVu fonts not found (Cyrillic and € need them). Pass --font-dir.")
    for name, file in {
        "Serif": "DejaVuSerif.ttf",
        "Serif-Bold": "DejaVuSerif-Bold.ttf",
        "Serif-Italic": "DejaVuSerif-Italic.ttf",
        "Sans": "DejaVuSans.ttf",
        "Sans-Bold": "DejaVuSans-Bold.ttf",
    }.items():
        pdfmetrics.registerFont(TTFont(name, os.path.join(folder, file)))
    pdfmetrics.registerFontFamily("Serif", normal="Serif", bold="Serif-Bold", italic="Serif-Italic")
    pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold", italic="Sans", boldItalic="Sans-Bold")


def styles():
    return {
        "title": ParagraphStyle("title", fontName="Sans-Bold", fontSize=15, leading=19, alignment=TA_CENTER, textColor=INK),
        "subtitle": ParagraphStyle("subtitle", fontName="Sans", fontSize=9.5, leading=13, alignment=TA_CENTER, textColor=MUTED),
        "heading": ParagraphStyle("heading", fontName="Sans-Bold", fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3, textColor=INK, keepWithNext=1),
        "body": ParagraphStyle("body", fontName="Serif", fontSize=9.6, leading=13.2, alignment=TA_JUSTIFY, spaceAfter=4, textColor=INK),
        "cell": ParagraphStyle("cell", fontName="Serif", fontSize=9.6, leading=13.2, textColor=INK),
        "small": ParagraphStyle("small", fontName="Serif", fontSize=8, leading=10.5, textColor=MUTED),
        "letterhead": ParagraphStyle("letterhead", fontName="Sans-Bold", fontSize=18, leading=22, textColor=FRAUD_RED),
        "letter": ParagraphStyle("letter", fontName="Sans", fontSize=10, leading=14, spaceAfter=6, textColor=INK),
        "injection": ParagraphStyle("injection", fontName="Sans", fontSize=6.5, leading=8.5, textColor=colors.HexColor("#9a9a9a")),
        # Letters and invoices.
        "sans": ParagraphStyle("sans", fontName="Sans", fontSize=9.6, leading=13.4, spaceAfter=5, textColor=INK),
        "sans_cell": ParagraphStyle("sans_cell", fontName="Sans", fontSize=9, leading=12, textColor=INK),
        "sans_right": ParagraphStyle("sans_right", fontName="Sans", fontSize=9, leading=12, alignment=TA_RIGHT, textColor=INK),
        "sans_small": ParagraphStyle("sans_small", fontName="Sans", fontSize=7.8, leading=10.2, textColor=MUTED),
        "sans_heading": ParagraphStyle("sans_heading", fontName="Sans-Bold", fontSize=10, leading=13.5, spaceBefore=6, spaceAfter=3, textColor=INK, keepWithNext=1),
        "subject": ParagraphStyle("subject", fontName="Sans-Bold", fontSize=11, leading=15, spaceBefore=10, spaceAfter=8, textColor=INK),
        "tiny": ParagraphStyle("tiny", fontName="Sans", fontSize=6.8, leading=8.5, textColor=MUTED),
    }  # fmt: skip


STYLES = styles()


def p(text, style="body"):
    return Paragraph(text, STYLES[style])


def boxed(rows, widths, style="cell", grid=True, header=False, right_columns=()):
    """A table of paragraphs; right_columns are right-aligned (amounts), header makes the first row bold."""

    def cell(text, column):
        name = "sans_right" if column in right_columns else style
        return p(text, name)

    table = Table([[cell(c, i) for i, c in enumerate(row)] for row in rows], colWidths=widths)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if grid:
        commands.append(("GRID", (0, 0), (-1, -1), 0.5, RULE))
    else:
        commands.append(("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE))
    if header:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")))
    table.setStyle(TableStyle(commands))
    return table


def letterhead(name, tagline, color=INK, size=16):
    style = ParagraphStyle("brand", fontName="Sans-Bold", fontSize=size, leading=size + 4, textColor=color)
    return [Paragraph(name, style), p(tagline, "sans_small"), Spacer(1, 10)]


def address_block(return_line, recipient, info, widths=(95 * mm, 75 * mm)):
    """DIN 5008 style: the return address and recipient on the left, reference data on the right."""
    left = [p(f"<u>{return_line}</u>", "tiny"), Spacer(1, 3), p("<br/>".join(recipient), "sans")]
    right = Table(
        [[p(k, "sans_small"), p(v, "sans_cell")] for k, v in info],
        colWidths=[33 * mm, widths[1] - 33 * mm],
        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]),
    )  # fmt: skip
    table = Table([[left, right]], colWidths=list(widths))
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
    return [table, Spacer(1, 6)]


def build_pdf(story, *, title, author, decorate=None, margins=(20, 20, 22, 20)):
    """Builds the PDF twice, so decorate(canvas, page, total) can print "Page X of Y".

    story is a function that returns fresh flowables (platypus consumes them while building).
    """
    left, right, top, bottom = (m * mm for m in margins)

    def once(total):
        out = io.BytesIO()
        doc = BaseDocTemplate(
            out, pagesize=A4, leftMargin=left, rightMargin=right, topMargin=top, bottomMargin=bottom,
            title=title, author=author, subject=SUBJECT,
        )  # fmt: skip
        frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")

        def on_page(canvas, document):
            if decorate:
                canvas.saveState()
                decorate(canvas, document.page, total)
                canvas.restoreState()

        doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=on_page)])
        doc.build(story())
        return out.getvalue()

    draft = once(None)
    return once(len(PdfReader(io.BytesIO(draft)).pages))


def page_decor(*, header=None, footer=(), numbering=None, hidden=None, band=None):
    """A decorate() for build_pdf: header line, footer lines, "Seite {page} von {total}", a colour band on top,
    and hidden text (white, tiny: invisible on paper, present in the text layer) as (text, pages)."""

    def draw(canvas, page, total):
        width, height = A4
        if band:
            canvas.setFillColor(band)
            canvas.rect(0, height - 7 * mm, width, 7 * mm, stroke=0, fill=1)
        canvas.setFont("Sans", 7.2)
        canvas.setFillColor(MUTED)
        canvas.setStrokeColor(RULE)
        if header:
            canvas.drawString(20 * mm, height - 12 * mm, header)
            canvas.line(20 * mm, height - 13.5 * mm, width - 20 * mm, height - 13.5 * mm)
        if footer:
            canvas.line(20 * mm, 15.5 * mm, width - 20 * mm, 15.5 * mm)
            for i, line in enumerate(footer):
                canvas.drawString(20 * mm, 12 * mm - i * 3.2 * mm, line)
        if numbering and total:
            y = 4 * mm if footer else 11 * mm
            canvas.drawRightString(width - 20 * mm, y, numbering.format(page=page, total=total))
        if hidden and page in hidden[1]:
            canvas.setFillColor(colors.white)
            canvas.setFont("Sans", 4)
            canvas.drawString(20 * mm, height - 18 * mm, hidden[0])

    return draw


def pdf_page_count(pdf):
    return len(PdfReader(io.BytesIO(pdf)).pages)


# --- Expected results ------------------------------------------------------------------------------

DOCUMENT_TYPES = {"letter", "invoice", "contract", "official_notice", "fine", "tax", "insurance", "bank", "medical", "other", "unknown"}  # fmt: skip
DEADLINE_KINDS = {"payment", "response", "submission", "appointment", "cancellation", "renewal", "other"}
SEVERITIES = {"high", "medium", "low"}
FACT_KINDS = {"amount", "reference", "account", "period", "contact", "other"}
SENDER_KINDS = {"government", "company", "individual", "unknown"}
ISSUES = {"blurry", "cropped", "dark", "not_a_document", "partial", "handwritten"}


def page_texts(pdf_bytes):
    pdf = pdfium.PdfDocument(pdf_bytes)
    return [re.sub(r"\s+", " ", page.get_textpage().get_text_range()) for page in pdf]


class Pages:
    """Finds the page of a quote in the generated PDF, so the labels follow the layout."""

    def __init__(self, pdf_bytes):
        self.texts = page_texts(pdf_bytes)

    def of(self, quote):
        pages = [i + 1 for i, text in enumerate(self.texts) if quote in text]
        if not pages:
            raise AssertionError(f"Quote not found in the generated PDF: {quote!r}")
        return pages[0]


def deadline(pages, label, kinds, when, quote, *, time=None, computed=False, tolerance=0, required=True, **extra):
    return {
        "label": label,
        "required": required,
        "kind": kinds,
        "date": when.isoformat(),
        "toleranceDays": tolerance,
        "time": time,
        "dateSource": "computed" if computed else "explicit",
        "quote": quote,
        "page": pages.of(quote),
        **extra,
    }


def risk(pages, label, severity, quote, *, required=True):
    return {"label": label, "required": required, "severity": severity, "quote": quote, "page": pages.of(quote)}


def fact(pages, kind, value, required=True):
    return {"kind": kind, "value": value, "required": required, "page": pages.of(value)}


def forbidden(when, quote, reason):
    return {"date": when.isoformat() if when else None, "quote": quote, "reason": reason}


def fraud(pages, quote, signals, minimum=3):
    return {"min": minimum, "page": pages.of(quote), "signals": signals}


NO_FRAUD = {"max": 0}


def analysis(*, language, document_date, deadlines, risks, key_facts, fraud_signals, document_type=None,
             sender=None, forbidden_items=None, quality=None, note=None):  # fmt: skip
    """An `analysis` expectation. document_type and sender are left out where the right answer is unclear
    (a forged letter is from whoever it pretends to be), so they aren't compared."""
    expect = {"outcome": "analysis"}
    if document_type:
        expect["documentType"] = document_type
    expect["documentLanguage"] = language
    expect["documentDate"] = document_date.isoformat()
    if sender:
        expect["sender"] = {"name": sender[0], "kind": sender[1]}
    expect["quality"] = quality or {"readable": True}
    expect["deadlines"] = deadlines
    if forbidden_items:
        expect["forbidden"] = forbidden_items
    expect["risks"] = risks
    expect["keyFacts"] = key_facts
    expect["fraudSignals"] = fraud_signals
    if note:
        expect["note"] = note
    return expect


def only_pages(expect, page_numbers):
    """Expectations for a part of the document: what's on other pages is no longer required."""
    part = json.loads(json.dumps(expect))
    for key in ("deadlines", "risks", "keyFacts"):
        for item in part[key]:
            if item["page"] not in page_numbers:
                item["required"] = False
    if part["fraudSignals"].get("page") not in page_numbers:
        part["fraudSignals"] = {"max": 0}
    part["quality"]["issuesMayInclude"] = ["partial"]
    return part


def check_expect(expect, today):
    """Fails on a label the evaluation couldn't use: unknown kinds or levels, a required deadline that the
    server's date range would drop (SPEC §7.4), a malformed date or time."""

    def fail(message):
        raise AssertionError(f"{message}: {json.dumps(expect, ensure_ascii=False)[:200]}")

    outcome = expect["outcome"]
    if outcome not in {"analysis", "client_error", "server_error"}:
        fail(f"unknown outcome {outcome}")
    if outcome != "analysis":
        return
    if expect.get("documentType", "other") not in DOCUMENT_TYPES:
        fail("unknown documentType")
    if expect.get("sender") and expect["sender"]["kind"] not in SENDER_KINDS:
        fail("unknown sender kind")
    quality = expect["quality"]
    if not set(quality.get("issuesAnyOf", []) + quality.get("issuesMayInclude", [])) <= ISSUES:
        fail("unknown quality issue")
    start = (date.fromisoformat(expect["documentDate"]) if expect.get("documentDate") else today) - timedelta(days=365)
    end = date(today.year + 10, today.month, min(today.day, 28))
    for item in expect["deadlines"]:
        if not set(item["kind"]) <= DEADLINE_KINDS or item["dateSource"] not in {"explicit", "computed"}:
            fail(f"bad deadline {item['label']}")
        when = date.fromisoformat(item["date"])
        if item["required"] and not start <= when <= end:
            fail(f"required deadline outside the server's range: {item['label']}")
        if item["time"] is not None and not re.fullmatch(r"[0-2]\d:[0-5]\d", item["time"]):
            fail(f"bad time {item['time']}")
    for item in expect.get("risks", []):
        if not item["severity"] or not set(item["severity"]) <= SEVERITIES:
            fail(f"bad risk {item['label']}")
    for item in expect.get("keyFacts", []):
        if item["kind"] not in FACT_KINDS:
            fail(f"bad key fact {item['value']}")
    signals = expect.get("fraudSignals")
    if signals is not None and "min" not in signals and "max" not in signals:
        fail("fraudSignals needs min or max")


# --- Images ----------------------------------------------------------------------------------------


def render_pages(pdf_bytes, dpi):
    return [page.render(scale=dpi / 72).to_pil().convert("RGB") for page in pdfium.PdfDocument(pdf_bytes)]


def as_photo(page, angle):
    """A page as a phone camera sees it: grey paper, tilt, grain, softer focus."""
    gray = ImageEnhance.Contrast(page.convert("L")).enhance(0.85).point(lambda v: int(v * 0.93 + 8))
    tilted = gray.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=205)
    grainy = Image.blend(tilted, Image.effect_noise(tilted.size, 18), 0.08)
    return grainy.filter(ImageFilter.GaussianBlur(0.4)).convert("RGB")


def not_a_document(size=(1600, 1200)):
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(size[1]):
        t = y / size[1]
        draw.line([(0, y), (size[0], y)], fill=(int(250 - 80 * t), int(170 - 90 * t), int(90 + 60 * t)))
    draw.ellipse([980, 520, 1380, 920], fill=(255, 214, 120))
    draw.polygon([(0, 1200), (520, 640), (900, 1200)], fill=(48, 56, 72))
    draw.polygon([(600, 1200), (1150, 760), (1600, 1200)], fill=(32, 40, 58))
    return image


def pdf_bytes(write):
    buf = io.BytesIO()
    write(buf)
    return buf.getvalue()


def _solve(matrix, vector):
    """Gauss-Jordan elimination for the 8×8 perspective system (no numpy in the requirements)."""
    n = len(vector)
    rows = [row[:] + [value] for row, value in zip(matrix, vector)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(rows[r][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        for r in range(n):
            if r != col:
                factor = rows[r][col] / rows[col][col]
                rows[r] = [a - factor * b for a, b in zip(rows[r], rows[col])]
    return [rows[i][n] / rows[i][i] for i in range(n)]


def _perspective(image, corners, size):
    """Warps image so its corners land on corners (top-left, top-right, bottom-right, bottom-left)."""
    w, h = image.size
    matrix, vector = [], []
    for (x, y), (u, v) in zip(corners, [(0, 0), (w, 0), (w, h), (0, h)]):
        matrix += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        vector += [u, v]
    coeffs = _solve(matrix, vector)
    warped = image.transform(size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    opaque = Image.new("L", image.size, 255)
    mask = opaque.transform(size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BILINEAR)
    return warped, mask


def _table(size, base):
    """A desk surface: base colour with grain and a few darker streaks."""
    surface = Image.new("RGB", size, base)
    grain = Image.effect_noise(size, 30).convert("RGB")
    surface = Image.blend(surface, ImageChops.multiply(surface, grain), 0.35)
    draw = ImageDraw.Draw(surface)
    for i in range(0, size[1], 37):
        shade = tuple(max(0, c - 18 - (i * 7) % 15) for c in base)
        draw.line([(0, i), (size[0], i + 25)], fill=shade, width=3)
    return surface.filter(ImageFilter.GaussianBlur(1.2))


def _light(image, strength, center=(0.4, 0.35)):
    """Uneven light: bright near center, darker towards the corners."""
    w, h = image.size
    small = Image.new("L", (64, 64))
    for y in range(64):
        for x in range(64):
            distance = ((x / 63 - center[0]) ** 2 + (y / 63 - center[1]) ** 2) ** 0.5
            small.putpixel((x, y), int(255 * max(0.0, 1 - strength * distance)))
    gradient = small.resize((w, h), Image.Resampling.BICUBIC).convert("RGB")
    return ImageChops.multiply(image, gradient)


def photo_on_table(page, corners, size=(1650, 2200), base=(132, 98, 70), light=0.55):
    """A page photographed on a desk at an angle: perspective, a soft shadow, uneven light, grain."""
    scene = _table(size, base)
    paper = ImageEnhance.Color(page).enhance(0.9)
    paper = ImageChops.multiply(paper, Image.new("RGB", paper.size, (250, 246, 236)))
    shadow_corners = [(x + 18, y + 22) for x, y in corners]
    shadow = Image.new("L", size, 0)
    ImageDraw.Draw(shadow).polygon(shadow_corners, fill=140)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    scene = Image.composite(Image.new("RGB", size, (20, 14, 10)), scene, shadow)
    warped, mask = _perspective(paper, corners, size)
    scene.paste(warped, mask=mask)
    scene = _light(scene, light)
    scene = Image.blend(scene, Image.effect_noise(size, 22).convert("RGB"), 0.05)
    return scene.filter(ImageFilter.GaussianBlur(0.5))


def dim_light(photo, brightness=0.45):
    """The same photo in a dim room: dark, warm, low contrast, more sensor noise."""
    dark = ImageEnhance.Brightness(photo).enhance(brightness)
    dark = ImageChops.multiply(dark, Image.new("RGB", dark.size, (255, 226, 188)))
    dark = ImageEnhance.Contrast(dark).enhance(0.8)
    return Image.blend(dark, Image.effect_noise(dark.size, 40).convert("RGB"), 0.07)


def hand_shadow(photo, polygon, darkness=0.5):
    """The shadow of the phone and hand over part of the page."""
    mask = Image.new("L", photo.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=int(255 * darkness))
    mask = mask.filter(ImageFilter.GaussianBlur(40))
    return Image.composite(Image.new("RGB", photo.size, (10, 8, 6)), photo, mask)


def soft_focus(photo, radius):
    return photo.filter(ImageFilter.GaussianBlur(radius))


def shaken(photo, length, step=(1, 0.35)):
    """Motion blur from a shaking hand: the average of copies shifted along one direction."""
    result = photo.copy()
    for i in range(1, length):
        dx, dy = int(step[0] * (i - length // 2)), int(step[1] * (i - length // 2))
        shifted = ImageChops.offset(photo, dx, dy)
        result = Image.blend(result, shifted, 1 / (i + 1))
    return result


# --- Kits ------------------------------------------------------------------------------------------


@dataclass
class Doc:
    """A generated document and its expected analysis (pageCount is added on writing)."""

    name: str
    pdf: bytes
    covers: list
    expect: dict


class KitWriter:
    def __init__(self, out, today):
        self.out = out
        self.today = today
        self.downloads = out / "Download" / DEVICE_FOLDER
        self.pictures = out / "Pictures" / DEVICE_FOLDER
        for folder in (self.downloads, self.pictures):
            shutil.rmtree(folder, ignore_errors=True)
            folder.mkdir(parents=True)
        self.documents = []

    def add(self, paths, source, covers, expect):
        check_expect(expect, self.today)
        self.documents.append(
            {"files": [str(p.relative_to(self.out)) for p in paths], "source": source, "covers": covers, "expect": expect}
        )

    def add_pdf(self, doc):
        path = self.downloads / f"{doc.name}.pdf"
        path.write_bytes(doc.pdf)
        self.add([path], "file", doc.covers, {**doc.expect, "pageCount": pdf_page_count(doc.pdf)})

    def write_labels(self, kit, generator, timezone):
        labels = {
            "kit": kit,
            "generator": str(Path(generator).resolve().relative_to(REPO_ROOT)),
            "request": {"today": self.today.isoformat(), "timezone": timezone},
            "documents": self.documents,
        }
        (self.out / "labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return self.documents


def pdf_kit(out, today, timezone, kit, generator, makers):
    """Writes a kit of PDFs, one per maker(today) -> Doc."""
    writer = KitWriter(out, today)
    for make in makers:
        writer.add_pdf(make(today))
    return writer.write_labels(kit, generator, timezone)


def arguments(description, kit):
    parser = argparse.ArgumentParser(description=description.split("\n\n")[0])
    parser.add_argument("--today", type=date.fromisoformat, default=date.today(),
                        help="date the deadlines are relative to, YYYY-MM-DD (default: today)")  # fmt: skip
    parser.add_argument("--timezone", default="Europe/Berlin", help="IANA time zone recorded in labels.json")
    parser.add_argument("--out", type=Path, default=OUT_ROOT / kit if kit else OUT_ROOT)
    parser.add_argument("--font-dir", help="folder with DejaVuSans.ttf and DejaVuSerif.ttf")
    return parser.parse_args()


def print_kit(out, documents, today):
    for document in documents:
        for file in document["files"]:
            size = (out / file).stat().st_size / 1024 / 1024
            print(f"{file:60} {size:7.2f} MB  {document['expect']['outcome']}")
    print(f"\n{len(documents)} labelled cases for today = {today}: {out / 'labels.json'}")


def run_kit(description, kit, generate):
    """The command line of a single kit: python <kit>.py [--today] [--timezone] [--out] [--font-dir]."""
    args = arguments(description, kit)
    register_fonts(args.font_dir)
    documents = generate(args.out, args.today, args.timezone)
    print_kit(args.out, documents, args.today)
