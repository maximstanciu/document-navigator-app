"""Synthetic letters from German authorities for the test set (plan task 0.6, SPEC §7.6).

Five documents: an income tax assessment (back payment, prepayments, appeal within a month of the deemed
notification), a residents' registration office appointment, a speeding fine with a two-week appeal period,
a child benefit office asking for documents, and a foreigners' authority letter about extending a residence
permit. Deadlines here are mostly counted from the notification, so many are computed with a tolerance.
All dates are relative to --today; offices, names and accounts are fictitious.

Writes <out>/Download/DocNavigatorTest/*.pdf and <out>/labels.json (format: scripts/eval/README.md).

Usage: python scripts/eval/synthetic/authorities_kit.py [--today YYYY-MM-DD] [--timezone Europe/Berlin] [--out DIR]
"""

from datetime import date

from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Spacer

from common import (
    DAY,
    NO_FRAUD,
    WEEKDAYS_DE,
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
    fact,
    forbidden,
    iban,
    letterhead,
    next_working_day,
    p,
    page_decor,
    pdf_kit,
    risk,
    run_kit,
)

KIT = "authorities"


def authority_head(name, unit):
    return letterhead(name, unit, size=14)


def tax_assessment(today):
    """Income tax assessment: back payment and appeal both one month after the deemed notification."""
    issued = today - 5 * DAY
    notified = issued + 4 * DAY  # § 122 Abs. 2 AO: the fourth day after posting
    due = next_working_day(add_months(notified, 1))
    tax_year = today.year - 1
    quarters = sorted(date(y, m, 10) for y in range(today.year, today.year + 3) for m in (3, 6, 9, 12))
    prepayments = [q for q in quarters if q > due][:4]
    tax_number = "21/345/67890"
    account = iban("DE", "100000000010001520")

    def story():
        return [
            *authority_head("Finanzamt Berlin-Wiesengrund", "Kanalufer 21 · 10963 Berlin · Telefon 030 5550 6100"),
            *address_block(
                "Finanzamt Berlin-Wiesengrund · Kanalufer 21 · 10963 Berlin",
                ["Herrn", "Pavel Moroz", "Weserstraße 18", "12047 Berlin"],
                [("Steuernummer", tax_number), ("Datum", de(issued)), ("Bearbeitung", "Arbeitsbereich 4, Zi. 312")],
            ),
            p(f"Bescheid für {tax_year} über Einkommensteuer und Solidaritätszuschlag", "subject"),
            p("Festsetzung", "sans_heading"),
            boxed(
                [
                    ["", "Einkommensteuer", "Solidaritätszuschlag"],
                    ["Festgesetzt werden", "6.482,00 €", "0,00 €"],
                    ["ab Steuerabzug vom Lohn", "5.298,00 €", "0,00 €"],
                    ["<b>verbleibende Beträge</b>", "<b>1.184,00 €</b>", "<b>0,00 €</b>"],
                ],
                [70 * mm, 50 * mm, 50 * mm],
                style="sans_cell",
                header=True,
                right_columns=(1, 2),
            ),
            Spacer(1, 6),
            p(f"Bitte zahlen Sie den Betrag von <b>1.184,00 €</b> spätestens am <b>{de(due)}</b>. Die Zahlung "
              "ist an die Kasse des Finanzamts zu leisten: Deutsche Bundesbank, Filiale Berlin, "
              f"IBAN {account}. Geben Sie bei der Zahlung bitte die Steuernummer an.", "sans"),  # fmt: skip
            p("Wird die Steuer nicht bis zum Ablauf des Fälligkeitstages entrichtet, entstehen Säumniszuschläge "
              "von 1 % des abgerundeten rückständigen Betrags für jeden angefangenen Monat der Säumnis "
              "(§ 240 AO).", "sans"),  # fmt: skip
            p("Vorauszahlungen", "sans_heading"),
            p("Die Vorauszahlungen an Einkommensteuer werden wie folgt festgesetzt:", "sans"),
            boxed([["Fälligkeit", "Betrag"]] + [[de(q), "296,00 €"] for q in prepayments],
                  [85 * mm, 85 * mm], style="sans_cell", header=True, right_columns=(1,)),  # fmt: skip
            Spacer(1, 4),
            p("Die Vorauszahlungen sind auch ohne weitere Aufforderung zu den genannten Terminen zu leisten.", "sans"),
            PageBreak(),
            p("Erläuterungen", "sans_heading"),
            p("Die Aufwendungen für das häusliche Arbeitszimmer (1.260,00 €) wurden nicht anerkannt, da das "
              "Arbeitszimmer nach Ihren Angaben nicht den Mittelpunkt Ihrer gesamten beruflichen Tätigkeit "
              "bildet. Berücksichtigt wurde stattdessen die Tagespauschale für 120 Tage (720,00 €).", "sans"),  # fmt: skip
            p("Die Festsetzung der Einkommensteuer ist gemäß § 165 Abs. 1 Satz 2 Nr. 3 AO vorläufig hinsichtlich "
              "der beschränkten Abziehbarkeit von Vorsorgeaufwendungen. Insoweit ist kein Einspruch "
              "erforderlich.", "sans"),  # fmt: skip
            p("Rechtsbehelfsbelehrung", "sans_heading"),
            p("Der Bescheid kann mit dem Einspruch angefochten werden. Der Einspruch ist beim oben genannten "
              "Finanzamt schriftlich einzureichen, diesem elektronisch zu übermitteln oder dort zur Niederschrift "
              "zu erklären. Die Frist für die Einlegung des Einspruchs beträgt einen Monat. Sie beginnt mit Ablauf "
              "des Tages, an dem Ihnen dieser Bescheid bekannt gegeben worden ist. Der Einspruch ist also "
              "innerhalb eines Monats nach Bekanntgabe dieses Bescheids einzulegen.", "sans"),  # fmt: skip
            p("Ein mit einfachem Brief übermittelter Bescheid gilt am vierten Tag nach der Aufgabe zur Post als "
              "bekannt gegeben (§ 122 Abs. 2 Nr. 1 AO). Fällt das Ende der Frist auf einen Samstag, Sonntag oder "
              "gesetzlichen Feiertag, endet sie mit dem nächstfolgenden Werktag (§ 108 Abs. 3 AO).", "sans"),  # fmt: skip
            p("Durch das Einlegen eines Einspruchs wird die Vollziehung des angefochtenen Bescheids nicht "
              "gehemmt; der festgesetzte Betrag ist trotzdem fristgerecht zu zahlen.", "sans"),  # fmt: skip
        ]

    pdf = build_pdf(
        story,
        title="Einkommensteuerbescheid",
        author="Finanzamt Berlin-Wiesengrund",
        decorate=page_decor(
            footer=[f"Steuernummer {tax_number} · Öffnungszeiten: Mo, Di, Fr 8–13 Uhr, Do 11–18 Uhr"],
            numbering="Seite {page} von {total}",
        ),
    )
    pages = Pages(pdf)
    quarterly = [
        deadline(pages, f"Income tax prepayment {i}", ["payment"], q, de(q), required=i == 1)
        for i, q in enumerate(prepayments, start=1)
    ]
    expect = analysis(
        document_type="tax",
        language="de",
        document_date=issued,
        sender=("Finanzamt Berlin-Wiesengrund", "government"),
        deadlines=[
            deadline(pages, "Pay the back tax", ["payment"], due, f"spätestens am {de(due)}"),
            deadline(pages, "Last day to appeal", ["response"], due,
                     "innerhalb eines Monats nach Bekanntgabe dieses Bescheids", computed=True, tolerance=4,
                     note="one month after the deemed notification on the 4th day after posting"),
            *quarterly,
        ],
        risks=[
            risk(pages, "Late payment surcharge of 1 % a month", ["high", "medium"], "Säumniszuschläge von 1 %"),
            risk(pages, "New quarterly prepayments", ["medium", "high", "low"], "werden wie folgt festgesetzt"),
            risk(pages, "Home office costs were not accepted: a reason to check and maybe appeal",
                 ["medium", "low"], "wurden nicht anerkannt", required=False),
            risk(pages, "The assessment becomes final without an appeal", ["high", "medium"],
                 "Die Frist für die Einlegung des Einspruchs beträgt einen Monat", required=False),
            risk(pages, "An appeal doesn't postpone the payment", ["medium", "high"],
                 "trotzdem fristgerecht zu zahlen", required=False),
        ],
        key_facts=[
            fact(pages, "amount", "1.184,00 €"),
            fact(pages, "reference", tax_number),
            fact(pages, "account", account),
            fact(pages, "amount", "296,00 €", required=False),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("01-income-tax-assessment-de", pdf, ["ANL-5", "ANL-6", "DET-6"], expect)


def registration_appointment(today):
    """Appointment confirmation at the residents' registration office, printed from the email."""
    sent = today - DAY
    moved_in = today - 4 * DAY
    register_by = moved_in + 14 * DAY
    visit = next_working_day(today + 8 * DAY)
    case_no = "81 442 907"

    def story():
        return [
            *authority_head("Bezirksamt Spreetal von Berlin", "Abteilung Bürgerdienste · Bürgeramt Rathausplatz"),
            p(f"Von: noreply-termine@spreetal.example · Gesendet: {de(sent)}, 16:02 Uhr", "sans_small"),
            p("An: m.hrytsenko@mail.example · Betreff: Terminbestätigung – Anmeldung einer Wohnung", "sans_small"),
            p("Terminbestätigung", "subject"),
            p("Sehr geehrte Frau Hrytsenko,", "sans"),
            p("hiermit bestätigen wir Ihren Termin im Bürgeramt:", "sans"),
            boxed(
                [
                    ["Dienstleistung", "Anmeldung einer Wohnung"],
                    ["Termin", f"{WEEKDAYS_DE[visit.weekday()]}, {de(visit)}, 09:40 Uhr"],
                    ["Ort", "Bürgeramt Rathausplatz, Rathausplatz 1, 10999 Berlin, Wartebereich 0.14"],
                    ["Vorgangsnummer", case_no],
                ],
                [45 * mm, 125 * mm],
                style="sans_cell",
            ),
            Spacer(1, 8),
            p("Bitte bringen Sie mit:", "sans_heading"),
            p("• Personalausweis oder Reisepass (bei Reisepass zusätzlich Ihren Aufenthaltstitel)<br/>"
              "• das ausgefüllte und unterschriebene Anmeldeformular<br/>"
              "• die Wohnungsgeberbestätigung Ihres Vermieters (§ 19 BMG)", "sans"),  # fmt: skip
            p("Ohne Wohnungsgeberbestätigung kann die Anmeldung nicht vorgenommen werden.", "sans"),
            p("Bitte erscheinen Sie pünktlich. Bei einer Verspätung von mehr als 10 Minuten verfällt der Termin.",
              "sans"),  # fmt: skip
            p("Sollten Sie den Termin nicht wahrnehmen können, sagen Sie ihn bitte spätestens 24 Stunden vorher "
              f"über diesen Link ab: termine.spreetal.example/absage/{case_no.replace(' ', '')}", "sans"),  # fmt: skip
            p("Gemäß § 17 Abs. 1 BMG müssen Sie sich innerhalb von zwei Wochen nach dem Einzug anmelden. "
              f"Einzugsdatum laut Ihrer Angabe: {de(moved_in)}. Wer sich nicht oder nicht rechtzeitig anmeldet, "
              "handelt ordnungswidrig; das kann mit einer Geldbuße bis zu 1.000 Euro geahndet werden.", "sans"),  # fmt: skip
            p("Die Anmeldung ist gebührenfrei. Die Meldebestätigung erhalten Sie direkt beim Termin.", "sans"),
            p("Mit freundlichen Grüßen<br/>Ihr Bürgeramt Rathausplatz<br/>Behördennummer 115", "sans"),
            p("Diese E-Mail wurde automatisch erstellt. Bitte antworten Sie nicht auf diese Nachricht.", "sans_small"),
        ]

    pdf = build_pdf(story, title="Terminbestätigung", author="Bezirksamt Spreetal von Berlin")
    pages = Pages(pdf)
    expect = analysis(
        document_type="official_notice",
        language="de",
        document_date=sent,
        sender=("Bezirksamt Spreetal von Berlin", "government"),
        deadlines=[
            deadline(pages, "Appointment at the registration office", ["appointment"], visit, f"{de(visit)}, 09:40 Uhr",
                     time="09:40"),
            deadline(pages, "Last moment to cancel the appointment", ["other", "response"], visit - DAY,
                     "spätestens 24 Stunden vorher", time="09:40", computed=True, tolerance=1, required=False),
            deadline(pages, "Register within two weeks of moving in", ["submission"], register_by,
                     "innerhalb von zwei Wochen nach dem Einzug", computed=True, tolerance=1, required=False,
                     note="the appointment itself is the registration"),
        ],
        risks=[
            risk(pages, "No registration without the landlord's confirmation", ["medium", "high"],
                 "Ohne Wohnungsgeberbestätigung kann die Anmeldung nicht vorgenommen werden"),
            risk(pages, "Fine of up to 1,000 € for late registration", ["medium", "high", "low"],
                 "Geldbuße bis zu 1.000 Euro", required=False),
            risk(pages, "The appointment is lost after 10 minutes of delay", ["medium", "low"],
                 "verfällt der Termin", required=False),
        ],
        key_facts=[
            fact(pages, "reference", case_no),
            fact(pages, "other", "Rathausplatz 1, 10999 Berlin", required=False),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("02-registration-office-appointment-de", pdf, ["ANL-5", "ANL-6"], expect)


def speeding_fine(today):
    """Speeding fine: appeal within two weeks of service, payment two weeks after it becomes final."""
    issued = today - 6 * DAY
    offence = today - 41 * DAY
    appeal = issued + 14 * DAY
    pay = issued + 28 * DAY
    file_no = "702.31.448812.6"
    account = iban("DE", "160500000003304471")

    def story():
        return [
            *authority_head("Landkreis Kranichsee", "Der Landrat · Zentrale Bußgeldstelle"),
            *address_block(
                "Landkreis Kranichsee · Bußgeldstelle · Am Markt 5 · 15999 Kranichsee",
                ["Herrn", "Andriy Bondarenko", "Lindenstraße 9", "14467 Potsdam"],
                [("Aktenzeichen", file_no), ("Datum", de(issued)), ("Sprechzeiten", "Di 9–12, Do 13–17 Uhr")],
            ),
            p("Bußgeldbescheid", "subject"),
            p("Sehr geehrter Herr Bondarenko,", "sans"),
            p(f"Ihnen wird vorgeworfen, am {de(offence)} um 14:52 Uhr in Kranichsee, Bundesstraße 246, Höhe "
              "Seestraße 17, Fahrtrichtung Nord, als Führer des PKW mit dem amtlichen Kennzeichen P-XY 2047 "
              "folgende Ordnungswidrigkeit begangen zu haben:", "sans"),  # fmt: skip
            p("Sie überschritten die zulässige Höchstgeschwindigkeit innerhalb geschlossener Ortschaften um "
              "23 km/h. Zulässige Geschwindigkeit: 50 km/h. Festgestellte Geschwindigkeit (nach Toleranzabzug): "
              "73 km/h. § 41 Abs. 1 i. V. m. Anlage 2, § 49 StVO; § 24 StVG; 11.3.4 BKat.", "sans"),  # fmt: skip
            p("Beweismittel: Messung mit Lasermessgerät, Messprotokoll, Lichtbild.", "sans"),
            p("Sie haben sich im Anhörungsverfahren nicht geäußert. Gegen Sie wird deshalb festgesetzt:", "sans"),
            boxed(
                [
                    ["Geldbuße", "125,00 €"],
                    ["Gebühr (§ 107 Abs. 1 OWiG)", "28,50 €"],
                    ["Auslagen (§ 107 Abs. 3 OWiG)", "3,50 €"],
                    ["<b>Gesamtbetrag</b>", "<b>157,00 €</b>"],
                ],
                [120 * mm, 50 * mm],
                style="sans_cell",
                right_columns=(1,),
            ),
            Spacer(1, 6),
            p("Im Fahreignungsregister beim Kraftfahrt-Bundesamt wird diese Entscheidung mit 1 Punkt eingetragen.",
              "sans"),  # fmt: skip
            p("Zahlungshinweise", "sans_heading"),
            p("Zahlen Sie den Gesamtbetrag spätestens zwei Wochen nach Rechtskraft dieses Bescheids an die "
              f"Kreiskasse Kranichsee, IBAN {account}. Geben Sie als Verwendungszweck unbedingt das Aktenzeichen "
              f"{file_no} an, sonst kann die Zahlung nicht zugeordnet werden.", "sans"),  # fmt: skip
            PageBreak(),
            p("Rechtsbehelfsbelehrung", "sans_heading"),
            p("Dieser Bußgeldbescheid wird rechtskräftig und vollstreckbar, wenn Sie nicht innerhalb von zwei "
              "Wochen nach Zustellung bei der oben bezeichneten Behörde schriftlich oder zur Niederschrift "
              "Einspruch einlegen. Der Tag der Zustellung ist auf dem Umschlag vermerkt.", "sans"),  # fmt: skip
            p("Bei einem Einspruch kann auch eine für Sie nachteiligere Entscheidung getroffen werden. Legen Sie "
              "keinen Einspruch ein, können Sie die Geldbuße nur in Raten zahlen, wenn Sie dies vor Ablauf der "
              "Zahlungsfrist schriftlich beantragen.", "sans"),  # fmt: skip
            p("Hinweise", "sans_heading"),
            p("Zahlen Sie nicht rechtzeitig und legen auch nicht dar, warum Ihnen die Zahlung nicht möglich ist, "
              "kann das Gericht Erzwingungshaft anordnen (§ 96 OWiG). Die Vollstreckung verursacht weitere "
              "Kosten.", "sans"),  # fmt: skip
            p("Akteneinsicht kann nur über einen Rechtsanwalt gewährt werden. Bitte geben Sie bei jeder "
              "Rückfrage das Aktenzeichen an.", "sans"),  # fmt: skip
        ]

    pdf = build_pdf(
        story,
        title="Bußgeldbescheid",
        author="Landkreis Kranichsee",
        decorate=page_decor(
            footer=[f"Landkreis Kranichsee · Bußgeldstelle · Aktenzeichen {file_no} · bussgeld@kranichsee.example"],
            numbering="Seite {page} von {total}",
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="fine",
        language="de",
        document_date=issued,
        sender=("Landkreis Kranichsee", "government"),
        deadlines=[
            deadline(pages, "Last day to appeal", ["response"], appeal,
                     "innerhalb von zwei Wochen nach Zustellung", computed=True, tolerance=4,
                     note="the service date is on the envelope; counted from the document date it is 2–4 days early"),
            deadline(pages, "Pay the fine", ["payment"], pay, "spätestens zwei Wochen nach Rechtskraft",
                     computed=True, tolerance=6, note="service + 2 weeks to become final + 2 weeks"),
        ],
        risks=[
            risk(pages, "The fine becomes final and enforceable without an appeal", ["high", "medium"],
                 "wird rechtskräftig und vollstreckbar"),
            risk(pages, "One point in the driving register", ["medium", "high"], "mit 1 Punkt eingetragen"),
            risk(pages, "Coercive detention if unpaid", ["high"], "Erzwingungshaft", required=False),
            risk(pages, "An appeal can end worse", ["medium", "low"], "nachteiligere Entscheidung", required=False),
        ],
        key_facts=[
            fact(pages, "amount", "157,00 €"),
            fact(pages, "reference", file_no),
            fact(pages, "account", account),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("03-speeding-fine-de", pdf, ["ANL-5", "ANL-6", "DET-6"], expect)


def child_benefit_request(today):
    """The child benefit office asks for school documents before the child turns 18."""
    issued = today - 3 * DAY
    born = add_months(today + 40 * DAY, -18 * 12)
    turns_18 = add_months(born, 18 * 12)
    submit_by = today + 21 * DAY
    stops_from = add_months(turns_18.replace(day=1), 1)
    benefit_no = "155FK123456"

    def story():
        return [
            *authority_head("Familienkasse Wiesengrund", "Bundesagentur für Arbeit"),
            *address_block(
                "Familienkasse Wiesengrund · 10969 Berlin",
                ["Frau", "Iryna Melnyk", "Bergmannstraße 5", "10961 Berlin"],
                [("Kindergeld-Nr.", benefit_no), ("Datum", de(issued)), ("Ihr Zeichen", "—")],
            ),
            p("Überprüfung Ihres Kindergeldanspruchs", "subject"),
            p("Sehr geehrte Frau Melnyk,", "sans"),
            p(f"Ihr Kind Sofia Melnyk, geboren am {de(born)}, vollendet am <b>{de(turns_18)}</b> das 18. "
              "Lebensjahr. Für die Zeit danach kann Kindergeld nur gezahlt werden, wenn Ihr Kind zum Beispiel eine "
              "Schule besucht oder eine Berufsausbildung macht (§ 32 Abs. 4 EStG).", "sans"),  # fmt: skip
            p(f"Bitte senden Sie uns bis zum <b>{de(submit_by)}</b> folgende Unterlagen:", "sans"),
            p("• den ausgefüllten und unterschriebenen Vordruck „Erklärung zum Kind“ (Anlage)<br/>"
              "• eine aktuelle Schulbescheinigung oder den Ausbildungsvertrag", "sans"),  # fmt: skip
            p("Sie können die Unterlagen per Post schicken oder online hochladen: "
              "familienkasse.example/upload. Geben Sie dabei immer Ihre Kindergeld-Nummer an.", "sans"),  # fmt: skip
            p("Wenn die Unterlagen nicht rechtzeitig eingehen, muss die Familienkasse die Festsetzung des "
              f"Kindergeldes ab {de_month_year(stops_from)} aufheben. Zu Unrecht erhaltenes Kindergeld müssen "
              "Sie zurückzahlen.", "sans"),  # fmt: skip
            p("Bitte beachten Sie: Sie sind verpflichtet, uns alle Änderungen, die für den Anspruch auf "
              "Kindergeld von Bedeutung sind, unverzüglich mitzuteilen (§ 68 Abs. 1 EStG), zum Beispiel einen "
              "Abbruch der Schule oder der Ausbildung.", "sans"),  # fmt: skip
            p("Mit freundlichen Grüßen<br/>Ihre Familienkasse", "sans"),
            PageBreak(),
            p(f"Anlage: Erklärung zum Kind · Kindergeld-Nr. {benefit_no}", "subject"),
            boxed(
                [
                    ["Name, Vorname des Kindes", "Melnyk, Sofia"],
                    ["Geburtsdatum", de(born)],
                    ["Das Kind besucht eine Schule / macht eine Ausbildung", "☐ ja, voraussichtlich bis: ________"],
                    ["Name und Anschrift der Schule / des Ausbildungsbetriebs", "<br/><br/>"],
                    ["Das Kind ist arbeitsuchend gemeldet", "☐ ja ☐ nein"],
                    ["Ort, Datum, Unterschrift", "<br/><br/>"],
                ],
                [85 * mm, 85 * mm],
                style="sans_cell",
            ),
        ]

    pdf = build_pdf(
        story,
        title="Überprüfung Kindergeldanspruch",
        author="Familienkasse Wiesengrund",
        decorate=page_decor(
            footer=["Familienkasse Wiesengrund · familienkasse-wiesengrund@arbeitsagentur.example"],
            numbering="Seite {page} von {total}",
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="official_notice",
        language="de",
        document_date=issued,
        sender=("Familienkasse Wiesengrund", "government"),
        deadlines=[
            deadline(pages, "Send the school certificate and the declaration", ["submission"], submit_by,
                     f"bis zum {de(submit_by)}"),
            deadline(pages, "The child turns 18", ["other"], turns_18, f"vollendet am {de(turns_18)}",
                     required=False),
        ],
        forbidden_items=[
            forbidden(born, f"geboren am {de(born)}",
                      "a birth date, more than a year before the document date: the server drops it (SPEC §7.4)"),
        ],
        risks=[
            risk(pages, "Child benefit stops and has to be paid back", ["high"], "Zu Unrecht erhaltenes Kindergeld"),
            risk(pages, "Duty to report changes", ["medium", "low"], "unverzüglich mitzuteilen", required=False),
        ],
        key_facts=[fact(pages, "reference", benefit_no)],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("04-child-benefit-request-de", pdf, ["ANL-5", "ANL-6"], expect)


def residence_permit_letter(today):
    """The foreigners' authority reminds to extend a residence permit and reserves an appointment."""
    issued = today - 4 * DAY
    expires = today + 75 * DAY
    apply_by = expires - 42 * DAY
    visit = next_working_day(today + 27 * DAY)
    confirm_by = today + 6 * DAY
    file_no = "32.4-AB-0815/26"
    email = "auslaenderbehoerde@neuhafen.example"

    def story():
        return [
            *authority_head("Stadt Neuhafen", "Der Oberbürgermeister · Ausländerbehörde"),
            *address_block(
                "Stadt Neuhafen · Ausländerbehörde · Hafenplatz 2 · 26999 Neuhafen",
                ["Herrn", "Timur Abdullaev", "Hafenstraße 31", "26999 Neuhafen"],
                [("Aktenzeichen", file_no), ("Datum", de(issued)), ("Zimmer", "2.07")],
            ),
            p("Verlängerung Ihres Aufenthaltstitels", "subject"),
            p("Sehr geehrter Herr Abdullaev,", "sans"),
            p("Ihre Aufenthaltserlaubnis nach § 18b Abs. 1 AufenthG ist gültig bis zum "
              f"<b>{de(expires)}</b>. Bitte stellen Sie den Antrag auf Verlängerung rechtzeitig, spätestens "
              "sechs Wochen vor Ablauf.", "sans"),  # fmt: skip
            p("Für die Vorsprache haben wir für Sie folgenden Termin reserviert: "
              f"<b>{WEEKDAYS_DE[visit.weekday()]}, {de(visit)}, 08:15 Uhr</b>, Zimmer 2.07.", "sans"),  # fmt: skip
            p(f"Bitte bestätigen Sie den Termin bis zum <b>{de(confirm_by)}</b> per E-Mail an {email}. Ohne "
              "Bestätigung wird der Termin anderweitig vergeben.", "sans"),  # fmt: skip
            p("Wichtig: Beantragen Sie die Verlängerung vor Ablauf Ihres Aufenthaltstitels, gilt dieser bis zur "
              "Entscheidung als fortbestehend (§ 81 Abs. 4 AufenthG). Ein nach Ablauf gestellter Antrag hat diese "
              "Wirkung nicht; Ihr Aufenthalt wäre dann unerlaubt.", "sans"),  # fmt: skip
            p("Unvollständige Unterlagen können dazu führen, dass Ihr Antrag am Termin nicht bearbeitet werden "
              "kann. Eine Liste der benötigten Unterlagen finden Sie auf Seite 2.", "sans"),  # fmt: skip
            p("Mit freundlichen Grüßen<br/>Im Auftrag<br/>K. Hoffmann", "sans"),
            PageBreak(),
            p("Benötigte Unterlagen für die Verlängerung", "subject"),
            p("• gültiger Reisepass<br/>"
              "• ein aktuelles biometrisches Lichtbild (35 × 45 mm)<br/>"
              "• Arbeitsvertrag und Bescheinigung des Arbeitgebers über das bestehende Arbeitsverhältnis "
              "(nicht älter als vier Wochen)<br/>"
              "• die letzten drei Gehaltsabrechnungen<br/>"
              "• Mietvertrag und Meldebescheinigung<br/>"
              "• Nachweis über Ihre Krankenversicherung", "sans"),  # fmt: skip
            p("Gebühr für die Verlängerung: 98,00 € (zahlbar bei der Vorsprache, nur Kartenzahlung).", "sans"),
            p("Bei Rückfragen schreiben Sie bitte unter Angabe des Aktenzeichens an " + email + ".", "sans"),
        ]

    pdf = build_pdf(
        story,
        title="Verlängerung Aufenthaltstitel",
        author="Stadt Neuhafen",
        decorate=page_decor(
            footer=[f"Stadt Neuhafen · Ausländerbehörde · Hafenplatz 2 · 26999 Neuhafen · {email}"],
            numbering="Seite {page} von {total}",
        ),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="official_notice",
        language="de",
        document_date=issued,
        sender=("Stadt Neuhafen", "government"),
        deadlines=[
            deadline(pages, "Confirm the appointment by email", ["response"], confirm_by, f"bis zum {de(confirm_by)}"),
            deadline(pages, "Appointment at the foreigners' authority", ["appointment"], visit,
                     f"{de(visit)}, 08:15 Uhr", time="08:15"),
            deadline(pages, "Apply for the extension six weeks before expiry", ["submission"], apply_by,
                     "spätestens sechs Wochen vor Ablauf", computed=True, tolerance=2),
            deadline(pages, "Residence permit expires", ["other"], expires, f"gültig bis zum {de(expires)}",
                     required=False),
        ],
        risks=[
            risk(pages, "Applying after expiry makes the stay unlawful", ["high"], "Ihr Aufenthalt wäre dann unerlaubt"),
            risk(pages, "The appointment is given away without confirmation", ["high", "medium"],
                 "wird der Termin anderweitig vergeben"),
            risk(pages, "Missing documents: no decision at the appointment", ["medium", "high"],
                 "Unvollständige Unterlagen", required=False),
        ],
        key_facts=[
            fact(pages, "reference", file_no),
            fact(pages, "contact", email),
            fact(pages, "amount", "98,00 €", required=False),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("05-residence-permit-extension-de", pdf, ["ANL-5", "ANL-6"], expect)


DOCUMENTS = [tax_assessment, registration_appointment, speeding_fine, child_benefit_request, residence_permit_letter]


def generate(out, today, timezone):
    return pdf_kit(out, today, timezone, KIT, __file__, DOCUMENTS)


if __name__ == "__main__":
    run_kit(__doc__, KIT, generate)
