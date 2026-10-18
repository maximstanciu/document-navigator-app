"""Synthetic German invoices for the test set (plan task 0.6, SPEC §7.6).

Four documents: an annual electricity statement with a direct debit and a price increase, a mobile phone
bill with a third-party subscription, a plumber's invoice with a cash discount, and a genuine second payment
reminder (urgency and collection threats from a real sender: no fraud signals expected). All dates are
relative to --today; all names, addresses and accounts are fictitious.

Writes <out>/Download/DocNavigatorTest/*.pdf and <out>/labels.json (format: scripts/eval/README.md).

Usage: python scripts/eval/synthetic/invoices_kit.py [--today YYYY-MM-DD] [--timezone Europe/Berlin] [--out DIR]
"""

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Spacer

from common import (
    DAY,
    NO_FRAUD,
    Doc,
    Pages,
    add_months,
    address_block,
    analysis,
    boxed,
    build_pdf,
    de,
    de_month_year,
    deadline,
    eur_de,
    fact,
    forbidden,
    iban,
    letterhead,
    money,
    month_start_after,
    p,
    page_decor,
    pdf_kit,
    risk,
    run_kit,
)

KIT = "invoices"
SPREELAND_BLUE = colors.HexColor("#0b4f6c")


def utility_statement(today):
    """Annual electricity statement: the balance is debited soon, prices go up, a special right to cancel."""
    issued = today - 4 * DAY
    period_end = issued.replace(day=1) - DAY
    period_start = add_months(period_end + DAY, -12)
    debit = issued + 14 * DAY
    next_instalment = add_months(issued.replace(day=15), 1)
    price_change = month_start_after(today + 35 * DAY)
    cancel_by = price_change - DAY

    kwh, price, base = 2684, money("0.2940"), money("11.90")
    energy = money(kwh * price)
    standing = money(12 * base)
    net = energy + standing
    vat = money(net * money("0.19"))
    gross = net + vat
    paid = money(12 * 79)
    balance = gross - paid
    account = "8100 4471 23"
    phone = "030 5550 2290"
    customer_iban = "DE** **** **** **** **63 18"

    def story():
        return [
            *letterhead("Spreeland Energie GmbH", "Strom · Gas · Wärme für Berlin und Brandenburg", SPREELAND_BLUE),
            *address_block(
                "Spreeland Energie GmbH · Uferstraße 40 · 12435 Berlin",
                ["Frau", "Olena Kovalenko", "Weichselstraße 41", "12045 Berlin"],
                [
                    ("Kundennummer", "40 118 732"),
                    ("Vertragskonto", account),
                    ("Zählernummer", "1ESY 1160 3348 21"),
                    ("Datum", de(issued)),
                    ("Kundenservice", phone),
                ],
            ),
            p(f"Ihre Jahresabrechnung Strom für den Zeitraum {de(period_start)} bis {de(period_end)}", "subject"),
            p("Sehr geehrte Frau Kovalenko,", "sans"),
            p("vielen Dank für Ihr Vertrauen. Mit diesem Schreiben erhalten Sie Ihre Jahresabrechnung für Ihren "
              "Stromtarif „Spree Klassik“ an der Lieferstelle Weichselstraße 41, 12045 Berlin.", "sans"),  # fmt: skip
            boxed(
                [
                    ["Position", "Menge", "Preis (netto)", "Betrag (netto)"],
                    ["Arbeitspreis", f"{kwh:,} kWh".replace(",", "."), "29,40 ct/kWh", eur_de(energy)],
                    ["Grundpreis", "12 Monate", "11,90 €/Monat", eur_de(standing)],
                    ["Summe netto", "", "", eur_de(net)],
                    ["Umsatzsteuer 19 %", "", "", eur_de(vat)],
                    ["<b>Gesamtbetrag brutto</b>", "", "", f"<b>{eur_de(gross)}</b>"],
                    ["Abzüglich geleisteter Abschläge", "12 × 79,00 €", "", f"−{eur_de(paid)}"],
                    ["<b>Nachzahlung</b>", "", "", f"<b>{eur_de(balance)}</b>"],
                ],
                [70 * mm, 30 * mm, 32 * mm, 38 * mm],
                style="sans_cell",
                header=True,
                right_columns=(1, 2, 3),
            ),
            Spacer(1, 8),
            p(f"Den Nachzahlungsbetrag von <b>{eur_de(balance)}</b> buchen wir am <b>{de(debit)}</b> per "
              f"SEPA-Lastschrift von Ihrem Konto ab (IBAN {customer_iban}, Mandatsreferenz SPE-40118732-01). "
              "Bitte sorgen Sie für ausreichende Deckung.", "sans"),  # fmt: skip
            p(f"Ihr neuer monatlicher Abschlag beträgt <b>98,00 €</b> (bisher 79,00 €). Wir buchen ihn ab dem "
              f"{de(next_instalment)} jeweils zum 15. eines Monats ab. Der höhere Abschlag berücksichtigt Ihren "
              "Verbrauch und die Preisänderung auf Seite 2.", "sans"),  # fmt: skip
            p("Bei einer Rücklastschrift stellen wir Ihnen die uns entstehenden Bankgebühren sowie eine "
              "Bearbeitungspauschale von 7,50 € in Rechnung.", "sans"),  # fmt: skip
            p("Die nächste Ablesung Ihres Zählers erfolgt im kommenden Jahr. Den genauen Termin teilen wir Ihnen "
              "rechtzeitig mit.", "sans"),  # fmt: skip
            p("Mit freundlichen Grüßen<br/>Ihre Spreeland Energie", "sans"),
            PageBreak(),
            p(f"Preisänderung zum {de(price_change)}", "subject"),
            p(f"Aufgrund gestiegener Beschaffungskosten und Netzentgelte passen wir zum <b>{de(price_change)}</b> "
              "die Preise Ihres Tarifs „Spree Klassik“ an:", "sans"),  # fmt: skip
            boxed(
                [
                    ["Preisbestandteil", "bisher (brutto)", "neu (brutto)"],
                    ["Arbeitspreis", "34,99 ct/kWh", "neu 40,34 ct/kWh"],
                    ["Grundpreis", "14,16 €/Monat", "15,47 €/Monat"],
                ],
                [70 * mm, 50 * mm, 50 * mm],
                style="sans_cell",
                header=True,
                right_columns=(1, 2),
            ),
            Spacer(1, 6),
            p("Sie haben das Recht, den Vertrag ohne Einhaltung einer Kündigungsfrist zum Wirksamwerden der "
              f"Preisänderung zu kündigen. Ihre Kündigung muss uns bis zum <b>{de(cancel_by)}</b> in Textform "
              "vorliegen. Kündigen Sie nicht, gelten ab diesem Zeitpunkt die neuen Preise.", "sans"),  # fmt: skip
            p("Stromkennzeichnung nach § 42 EnWG: erneuerbare Energien 61,2 %, Erdgas 18,4 %, Kohle 17,9 %, "
              "sonstige fossile Energieträger 2,5 %. CO₂-Emissionen: 214 g/kWh.", "sans_small"),  # fmt: skip
            p("Bei Beanstandungen wenden Sie sich bitte zuerst an unseren Kundenservice. Ist Ihre Beschwerde nicht "
              "gelöst, können Sie die Schlichtungsstelle Energie e. V. anrufen.", "sans_small"),  # fmt: skip
        ]

    pdf = build_pdf(
        story,
        title="Jahresabrechnung Strom",
        author="Spreeland Energie GmbH",
        decorate=page_decor(
            footer=[
                "Spreeland Energie GmbH · Uferstraße 40 · 12435 Berlin · service@spreeland-energie.example",
                f"Gläubiger-ID DE98ZZZ09999999999 · Bankverbindung: {iban('DE', '370400440532013000')}",
            ],
            numbering="Seite {page} von {total}",
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="invoice",
        language="de",
        document_date=issued,
        sender=("Spreeland Energie GmbH", "company"),
        deadlines=[
            deadline(pages, "The balance is debited from the account", ["payment"], debit,
                     f"buchen wir am {de(debit)}", note="direct debit: the action is to keep enough money"),
            deadline(pages, "Last day to cancel because of the price increase", ["cancellation"], cancel_by,
                     f"bis zum {de(cancel_by)} in Textform"),
            deadline(pages, "First higher monthly instalment", ["payment"], next_instalment,
                     f"ab dem {de(next_instalment)}", required=False),
            deadline(pages, "New prices take effect", ["other", "renewal"], price_change,
                     f"zum {de(price_change)} die Preise", required=False),
        ],
        forbidden_items=[
            forbidden(None, "Den genauen Termin teilen wir Ihnen rechtzeitig mit",
                      "the next meter reading has no date yet (SPEC §7.4 rule 1)"),
        ],
        risks=[
            risk(pages, "The balance is debited automatically in under two weeks", ["high", "medium"],
                 "per SEPA-Lastschrift von Ihrem Konto ab"),
            risk(pages, "Electricity price goes up by about 15 %", ["medium", "high"], "neu 40,34 ct/kWh"),
            risk(pages, "Higher monthly instalment", ["medium", "low"], "Ihr neuer monatlicher Abschlag beträgt",
                 required=False),
            risk(pages, "Fee for a returned direct debit", ["low", "medium"], "Bearbeitungspauschale von 7,50 €",
                 required=False),
        ],
        key_facts=[
            fact(pages, "amount", eur_de(balance)),
            fact(pages, "amount", "98,00 €"),
            fact(pages, "reference", account),
            fact(pages, "contact", phone, required=False),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("01-electricity-annual-statement-de", pdf, ["ANL-5", "ANL-6", "DET-6"], expect)


def phone_bill(today):
    """Monthly mobile bill paid by direct debit, with a third-party premium subscription on it."""
    issued = today - 3 * DAY
    month_end = issued.replace(day=1) - DAY
    month_start = month_end.replace(day=1)
    debit = issued + 8 * DAY
    term_end = month_start_after(today + 50 * DAY) - DAY
    contract_start = add_months(term_end + DAY, -24)
    notice = add_months(term_end, -1)
    objection = issued + 56 * DAY
    lines = [
        ("Grundpreis Tarif „Funkwelle Allnet M“ (20 GB)", money("24.99")),
        ("Option „EU-Plus Roaming“", money("4.99")),
        ("3 SMS in Nicht-EU-Länder à 0,19 €", money("0.57")),
        ("Drittanbieter: Premium-Abo „GoldGames“ der PlayZone Media Ltd., 3 × 6,99 €", money("20.97")),
    ]
    total = sum((amount for _, amount in lines), money(0))
    vat = money(total - total / money("1.19"))
    invoice_no = f"{issued.year}{issued.month:02d}-7004118952"

    def story():
        return [
            *letterhead("funkwelle", "Funkwelle Mobilfunk GmbH", colors.HexColor("#6b2d8c"), size=20),
            *address_block(
                "Funkwelle Mobilfunk GmbH · Postfach 10 20 30 · 40011 Düsseldorf",
                ["Herrn", "Dmitri Sokolov", "Hermannstraße 120", "12051 Berlin"],
                [
                    ("Kundennummer", "7004 1189 52"),
                    ("Rechnungsnummer", invoice_no),
                    ("Rufnummer", "0157 ••• •• 1834"),
                    ("Rechnungsdatum", de(issued)),
                ],
            ),
            p(f"Ihre Rechnung für {de_month_year(month_start)}", "subject"),
            p("Guten Tag Herr Sokolov,", "sans"),
            p(f"hier ist Ihre Rechnung für den Zeitraum {de(month_start)} bis {de(month_end)}.", "sans"),
            boxed(
                [["Leistung", "Betrag"]] + [[name, eur_de(amount)] for name, amount in lines]
                + [["<b>Rechnungsbetrag</b>", f"<b>{eur_de(total)}</b>"],
                   ["darin enthaltene Umsatzsteuer 19 %", eur_de(vat)]],
                [130 * mm, 40 * mm],
                style="sans_cell",
                header=True,
                right_columns=(1,),
            ),  # fmt: skip
            Spacer(1, 8),
            p(f"Der Rechnungsbetrag von {eur_de(total)} wird am <b>{de(debit)}</b> von Ihrem Konto "
              "IBAN DE** **** **** **** **47 11 abgebucht. Sie müssen nichts weiter tun.", "sans"),  # fmt: skip
            p("Bei einer Rücklastschrift berechnen wir eine Gebühr von 9,50 €. Bei Zahlungsverzug von mindestens "
              "100 € können wir Ihren Anschluss nach vorheriger Ankündigung sperren.", "sans"),  # fmt: skip
            PageBreak(),
            p("Hinweise zu Ihrem Vertrag", "subject"),
            p("<b>Beträge von Drittanbietern.</b> Die Position „GoldGames“ ist ein Abonnement der PlayZone Media "
              "Ltd., das über Ihre Mobilfunkrechnung abgerechnet wird. Bei Fragen oder zur Kündigung des Abos "
              "wenden Sie sich bitte direkt an den Drittanbieter: support@playzone-media.example. Sie können "
              "Ihren Anschluss kostenlos für Drittanbieterdienste sperren lassen (Drittanbietersperre).", "sans"),  # fmt: skip
            p(f"<b>Vertragslaufzeit.</b> Ihr Vertrag läuft seit {de(contract_start)}. Die Mindestvertragslaufzeit "
              f"endet am <b>{de(term_end)}</b>. Die Kündigungsfrist beträgt einen Monat zum Ende der "
              "Mindestvertragslaufzeit. Ohne Kündigung verlängert sich der Vertrag auf unbestimmte Zeit und ist "
              "danach jederzeit mit einer Frist von einem Monat kündbar.", "sans"),  # fmt: skip
            p("<b>Einwendungen.</b> Einwendungen gegen die Höhe der in Rechnung gestellten Entgelte müssen Sie "
              "innerhalb von acht Wochen nach Zugang der Rechnung erheben. Gesetzliche Ansprüche bei späteren "
              "Einwendungen bleiben unberührt.", "sans"),  # fmt: skip
            p("Ihre Rechnungen und Einzelverbindungsnachweise finden Sie im Kundenportal. Kundenservice: "
              "service@funkwelle-mobil.example.", "sans"),  # fmt: skip
        ]

    pdf = build_pdf(
        story,
        title="Mobilfunkrechnung",
        author="Funkwelle Mobilfunk GmbH",
        decorate=page_decor(
            footer=["Funkwelle Mobilfunk GmbH · Kaistraße 8 · 40221 Düsseldorf · service@funkwelle-mobil.example"],
            numbering="Seite {page} von {total}",
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="invoice",
        language="de",
        document_date=issued,
        sender=("Funkwelle Mobilfunk GmbH", "company"),
        deadlines=[
            deadline(pages, "The bill is debited from the account", ["payment"], debit, f"wird am {de(debit)}",
                     note="direct debit: nothing to pay by hand"),
            deadline(pages, "Last day to cancel for the end of the minimum term", ["cancellation"], notice,
                     "einen Monat zum Ende der Mindestvertragslaufzeit", computed=True, tolerance=1),
            deadline(pages, "Contract continues indefinitely", ["renewal", "other"], term_end + DAY,
                     f"endet am {de(term_end)}", computed=True, tolerance=1, required=False),
            deadline(pages, "Last day to object to the bill", ["response"], objection,
                     "innerhalb von acht Wochen nach Zugang der Rechnung", computed=True, tolerance=5,
                     required=False),
        ],
        risks=[
            risk(pages, "Third-party subscription charged via the phone bill", ["medium", "high"],
                 "Drittanbieter: Premium-Abo"),
            risk(pages, "Contract continues after the minimum term", ["medium", "low"],
                 "verlängert sich der Vertrag auf unbestimmte Zeit", required=False),
            risk(pages, "Fee for a returned direct debit", ["low", "medium"], "Gebühr von 9,50 €", required=False),
            risk(pages, "Line can be blocked when 100 € are overdue", ["medium", "high", "low"],
                 "Anschluss nach vorheriger Ankündigung sperren", required=False),
        ],
        key_facts=[
            fact(pages, "amount", eur_de(total)),
            fact(pages, "reference", "7004 1189 52"),
            fact(pages, "reference", invoice_no, required=False),
            fact(pages, "contact", "support@playzone-media.example", required=False),
        ],
        fraud_signals=NO_FRAUD,
        note="the third-party charge is a risk, not a fraud signal: the bill itself is genuine",
    )  # fmt: skip
    return Doc("02-mobile-phone-bill-direct-debit-de", pdf, ["ANL-5", "ANL-6", "ANL-11"], expect)


def plumber_invoice(today):
    """A craftsman's invoice: pay within 14 days, 2 % discount within 7 days."""
    issued = today - 2 * DAY
    work_done = issued - 6 * DAY
    due = issued + 14 * DAY
    discount_due = issued + 7 * DAY
    number = f"{issued.year}-1187"
    items = [
        ("Anfahrtspauschale Leipzig", "1", money("45.00")),
        ("Arbeitszeit Monteur, 1,5 Std. à 68,00 €", "1,5", money("102.00")),
        ("Einhebelmischer Küche „Aqualux K2“", "1", money("129.90")),
        ("Siphon-Set 1 1/2″ mit Rohrbogen", "1", money("18.40")),
        ("Kleinmaterial, Dichtungen (pauschal)", "1", money("9.50")),
    ]
    net = sum((amount for *_, amount in items), money(0))
    vat = money(net * money("0.19"))
    gross = net + vat
    discounted = money(gross * money("0.98"))
    labour = money("147.00")
    account = iban("DE", "860555921234567890")

    def story():
        return [
            *letterhead("Sanitär Krüger GmbH", "Sanitär · Heizung · Notdienst — Meisterbetrieb seit 1994"),
            *address_block(
                "Sanitär Krüger GmbH · Zschochersche Straße 48 · 04229 Leipzig",
                ["Frau", "Anna Petrova", "Karl-Liebknecht-Straße 96", "04275 Leipzig"],
                [
                    ("Rechnung Nr.", number),
                    ("Rechnungsdatum", de(issued)),
                    ("Leistungsdatum", de(work_done)),
                    ("Steuernummer", "231/118/04471"),
                ],
            ),
            p(f"Rechnung Nr. {number}", "subject"),
            p("Sehr geehrte Frau Petrova,", "sans"),
            p("für die Reparatur des undichten Siphons und den Austausch des Einhebelmischers in Ihrer Küche "
              "berechnen wir Ihnen:", "sans"),  # fmt: skip
            boxed(
                [["Pos.", "Leistung", "Menge", "Betrag"]]
                + [[str(i), name, qty, eur_de(amount)] for i, (name, qty, amount) in enumerate(items, start=1)]
                + [["", "Summe netto", "", eur_de(net)], ["", "Umsatzsteuer 19 %", "", eur_de(vat)],
                   ["", "<b>Rechnungsbetrag</b>", "", f"<b>{eur_de(gross)}</b>"]],
                [12 * mm, 108 * mm, 16 * mm, 34 * mm],
                style="sans_cell",
                header=True,
                right_columns=(2, 3),
            ),  # fmt: skip
            Spacer(1, 8),
            p("Zahlbar innerhalb von 14 Tagen nach Rechnungsdatum ohne Abzug.", "sans"),
            p("Bei Zahlung innerhalb von 7 Tagen nach Rechnungsdatum gewähren wir 2 % Skonto "
              f"(Zahlbetrag {eur_de(discounted)}).", "sans"),  # fmt: skip
            p(f"Bitte überweisen Sie auf unser Konto IBAN {account} (Sparkasse Leipzig-Süd) unter Angabe der "
              "Rechnungsnummer.", "sans"),  # fmt: skip
            p(f"In diesem Betrag sind Arbeits- und Fahrtkosten von {eur_de(labour)} netto "
              f"({eur_de(money(labour * money('1.19')))} brutto) enthalten, die Sie als Handwerkerleistung nach "
              "§ 35a EStG in Ihrer Steuererklärung geltend machen können. Bewahren Sie die Rechnung und den "
              "Überweisungsbeleg auf.", "sans"),  # fmt: skip
            p("Ab dem 31. Tag nach Zugang der Rechnung geraten Sie auch ohne Mahnung in Verzug (§ 286 Abs. 3 BGB); "
              "wir berechnen dann Verzugszinsen in gesetzlicher Höhe.", "sans"),  # fmt: skip
            p("Auf das eingebaute Material gewähren wir die gesetzliche Gewährleistung von zwei Jahren.", "sans"),
            p("Vielen Dank für Ihren Auftrag!<br/>Thomas Krüger, Installateur- und Heizungsbauermeister", "sans"),
        ]

    pdf = build_pdf(
        story,
        title=f"Rechnung {number}",
        author="Sanitär Krüger GmbH",
        decorate=page_decor(
            footer=[
                "Sanitär Krüger GmbH · Zschochersche Straße 48 · 04229 Leipzig · Tel. 0341 5550 4810 · "
                "info@sanitaer-krueger.example",
                f"Geschäftsführer: Thomas Krüger · {account}",
            ],
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="invoice",
        language="de",
        document_date=issued,
        sender=("Sanitär Krüger GmbH", "company"),
        deadlines=[
            deadline(pages, "Pay the invoice", ["payment"], due, "innerhalb von 14 Tagen nach Rechnungsdatum",
                     computed=True, tolerance=1),
            deadline(pages, "Pay with a 2 % discount", ["payment"], discount_due,
                     "innerhalb von 7 Tagen nach Rechnungsdatum", computed=True, tolerance=1, required=False),
        ],
        risks=[
            risk(pages, "Default interest from day 31", ["medium", "low"], "auch ohne Mahnung in Verzug",
                 required=False),
            risk(pages, "Keep the invoice for the tax deduction", ["low"], "nach § 35a EStG", required=False),
        ],
        key_facts=[
            fact(pages, "amount", eur_de(gross)),
            fact(pages, "reference", number),
            fact(pages, "account", account),
            fact(pages, "amount", eur_de(discounted), required=False),
        ],
        fraud_signals=NO_FRAUD,
        note="a plain invoice: no required risks; high risks here would be invented",
    )  # fmt: skip
    return Doc("03-plumber-invoice-discount-de", pdf, ["ANL-5", "ANL-6"], expect)


def payment_reminder(today):
    """A genuine second reminder: urgency, blocking and collection threats, but the sender checks out."""
    issued = today - DAY
    invoiced = issued - 45 * DAY
    first_due = invoiced + 14 * DAY
    pay_by = issued + 8 * DAY
    block_from = issued + 15 * DAY
    invoice_no = f"R-{invoiced.year}-{invoiced.month:02d}12-4471"
    account = iban("DE", "200505501234567890")
    phone = "040 5550 7700"

    def story():
        return [
            *letterhead("NetzPlus Kabel GmbH", "Internet · TV · Telefon", colors.HexColor("#c0392b")),
            *address_block(
                "NetzPlus Kabel GmbH · Spaldingstraße 160 · 20097 Hamburg",
                ["Herrn", "Sergei Ivanov", "Osterstraße 77", "20259 Hamburg"],
                [
                    ("Kundennummer", "5501-338-27"),
                    ("Datum", de(issued)),
                    ("Ihr Ansprechpartner", "Forderungsmanagement"),
                    ("Telefon", phone),
                ],
            ),
            p("2. Zahlungserinnerung", "subject"),
            p("Sehr geehrter Herr Ivanov,", "sans"),
            p(f"für unsere Rechnung Nr. {invoice_no} vom {de(invoiced)}, fällig am {de(first_due)}, konnten wir "
              "trotz unserer Erinnerung noch keinen Zahlungseingang feststellen.", "sans"),  # fmt: skip
            boxed(
                [
                    ["Rechnungsbetrag Internet „NetzPlus 250“", "44,99 €"],
                    ["Mahngebühr", "2,50 €"],
                    ["<b>Offener Betrag</b>", "<b>47,49 €</b>"],
                ],
                [130 * mm, 40 * mm],
                style="sans_cell",
                right_columns=(1,),
            ),
            Spacer(1, 8),
            p(f"Bitte überweisen Sie den offenen Betrag von 47,49 € bis spätestens <b>{de(pay_by)}</b> auf unser "
              f"Konto bei der Hamburger Sparkasse, IBAN {account}, Kontoinhaber NetzPlus Kabel GmbH, "
              "Verwendungszweck: Kundennummer 5501-338-27.", "sans"),  # fmt: skip
            p(f"Geht der Betrag bis dahin nicht bei uns ein, sperren wir Ihren Internetanschluss ab dem "
              f"{de(block_from)} und übergeben die Forderung an ein Inkassounternehmen. Dadurch entstehen Ihnen "
              "weitere Kosten.", "sans"),  # fmt: skip
            p("Wir weisen darauf hin, dass wir Daten über eine unbestrittene, fällige Forderung an die SCHUFA "
              "Holding AG übermitteln dürfen, wenn die Voraussetzungen des § 31 BDSG vorliegen.", "sans"),  # fmt: skip
            p("Falls Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als "
              f"gegenstandslos. Bei Fragen erreichen Sie uns unter {phone} (Mo–Fr 8–20 Uhr) oder im Kundenportal "
              "mein.netzplus-kabel.example.", "sans"),  # fmt: skip
            p("Mit freundlichen Grüßen<br/>NetzPlus Kabel GmbH, Forderungsmanagement", "sans"),
        ]

    pdf = build_pdf(
        story,
        title="2. Zahlungserinnerung",
        author="NetzPlus Kabel GmbH",
        decorate=page_decor(
            footer=[
                "NetzPlus Kabel GmbH · Spaldingstraße 160 · 20097 Hamburg · www.netzplus-kabel.example",
                f"Hamburger Sparkasse · {account} · Gläubiger-ID DE98ZZZ09999999999",
            ],
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        language="de",
        document_date=issued,
        sender=("NetzPlus Kabel GmbH", "company"),
        deadlines=[
            deadline(pages, "Pay the overdue amount", ["payment"], pay_by, f"bis spätestens {de(pay_by)}"),
            deadline(pages, "Internet blocked from this day if unpaid", ["other"], block_from,
                     f"ab dem {de(block_from)}", required=False),
            deadline(pages, "Original due date, already passed", ["payment"], first_due, f"fällig am {de(first_due)}",
                     required=False, note="superseded by the new date"),
        ],
        risks=[
            risk(pages, "Internet blocked and the debt passed to collection", ["high"],
                 "an ein Inkassounternehmen"),
            risk(pages, "Entry at SCHUFA", ["high", "medium"], "SCHUFA Holding AG", required=False),
            risk(pages, "Reminder fee", ["low", "medium"], "Mahngebühr", required=False),
        ],
        key_facts=[
            fact(pages, "amount", "47,49 €"),
            fact(pages, "reference", "5501-338-27"),
            fact(pages, "account", account),
            fact(pages, "contact", phone, required=False),
        ],
        fraud_signals=NO_FRAUD,
        note="false-positive check: real urgency and threats, but the account holder, contacts and customer "
             "number match the sender; documentType is left out (invoice or letter)",
    )  # fmt: skip
    return Doc("04-payment-reminder-genuine-de", pdf, ["ANL-5", "ANL-11"], expect)


DOCUMENTS = [utility_statement, phone_bill, plumber_invoice, payment_reminder]


def generate(out, today, timezone):
    return pdf_kit(out, today, timezone, KIT, __file__, DOCUMENTS)


if __name__ == "__main__":
    run_kit(__doc__, KIT, generate)
