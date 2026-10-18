"""Synthetic documents in Russian and English for the test set (plan task 0.6, SPEC §7.6).

Four documents: a Russian contract with a Saturday school (instalments, automatic renewal, cancellation two
months before the end of the school year, photo consent), a genuine Russian letter from a bank about new fees
and a customer data update (it warns about "safe account" scams itself: no fraud signals expected), a Russian
translation agency invoice paid to the owner's personal account (a sole trader: not a fraud signal), and an
English letter from an expat health insurer about a premium increase with a right to cancel. All dates are
relative to --today; all names, addresses and accounts are fictitious.

Writes <out>/Download/DocNavigatorTest/*.pdf and <out>/labels.json (format: scripts/eval/README.md).

Usage: python scripts/eval/synthetic/languages_kit.py [--today YYYY-MM-DD] [--timezone Europe/Berlin] [--out DIR]
"""

from datetime import date

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Spacer, Table

from common import (
    DAY,
    NO_FRAUD,
    Doc,
    Pages,
    add_months,
    add_working_days,
    address_block,
    analysis,
    boxed,
    build_pdf,
    deadline,
    en,
    eur_ru,
    fact,
    iban,
    letterhead,
    money,
    month_start_after,
    next_day_where,
    p,
    page_decor,
    pdf_kit,
    risk,
    ru,
    run_kit,
)

KIT = "languages"


def school_contract(today):
    """A Russian Saturday school contract for a child, signed a week ago."""
    signed = today - 7 * DAY
    year_end = date(today.year + (1 if today.month >= 5 else 0), 6, 30)  # at least two months of classes
    first_class = next_day_where(today + 7 * DAY, lambda d: d.weekday() == 5)
    meeting = next_day_where(first_class + DAY, lambda d: d.weekday() == 2)
    fee_due = add_working_days(signed, 3)
    first_payment = today + 5 * DAY
    second_payment = add_months(first_payment, 4)
    cancel_by = add_months(year_end, -2)
    number = f"31/{signed.year}"
    account = iban("DE", "100205000003318720")

    def story():
        def clause(title, *texts):
            return [p(title, "heading")] + [p(t) for t in texts]

        return [
            p(f"ДОГОВОР № {number}", "title"),
            p("об оказании образовательных услуг", "subtitle"),
            p(f"г. Берлин, {ru(signed)}", "subtitle"),
            Spacer(1, 8),
            p("Русская субботняя школа «Радуга» e.V., Kiehlufer 11, 12059 Berlin, в лице председателя правления "
              "Карины Ланге (далее — «Школа»), и Иванова Мария Сергеевна, проживающая по адресу: "
              "Sonnenallee 210, 12059 Berlin (далее — «Заказчик»), заключили настоящий договор о нижеследующем."),  # fmt: skip
            *clause("1. Предмет договора",
                    "1.1. Школа проводит для ребёнка Заказчика, Иванова Михаила, 2017 г. р., занятия по русскому "
                    "языку, литературе и математике по субботам с 10:00 до 13:00 по адресу Школы."),
            *clause("2. Срок действия", f"2.1. Договор действует с {ru(first_class)} по {ru(year_end)}"),
            *clause("3. Стоимость и порядок оплаты",
                    "3.1. Стоимость обучения составляет 1 080,00 € за учебный год. Оплата производится двумя "
                    f"равными частями: 540,00 € — до {ru(first_payment)}, 540,00 € — до {ru(second_payment)}",
                    "3.2. Вступительный взнос 50,00 € оплачивается в течение трёх банковских дней с даты "
                    "подписания договора.",
                    "3.3. Учебные материалы (35,00 €) оплачиваются наличными на первом занятии.",
                    f"3.4. Реквизиты: получатель Russische Samstagsschule Raduga e.V., IBAN {account}, назначение "
                    f"платежа: «Договор {number}, Иванов Михаил»."),
            *clause("4. Пропуски занятий",
                    "4.1. Пропущенные занятия не компенсируются, плата за них не возвращается."),
            *clause("5. Изменение и расторжение договора",
                    "5.1. Заказчик может расторгнуть договор, уведомив Школу в письменной форме. При расторжении "
                    "договора по инициативе Заказчика плата за текущий семестр не возвращается.",
                    "5.2. Договор автоматически продлевается на следующий учебный год на тех же условиях, если ни "
                    "одна из сторон не заявит о его расторжении в письменной форме не позднее чем за два месяца "
                    "до окончания срока его действия.",
                    "5.3. Школа вправе изменить стоимость обучения на следующий учебный год, уведомив Заказчика "
                    "не позднее чем за один месяц."),
            *clause("6. Фото- и видеосъёмка",
                    "6.1. Заказчик даёт согласие на фото- и видеосъёмку ребёнка на мероприятиях Школы и на "
                    "публикацию этих материалов на сайте и в социальных сетях Школы. Отказ от согласия "
                    "оформляется письменно."),
            *clause("7. Прочие условия",
                    f"7.1. Первое родительское собрание состоится {ru(meeting)} в 18:30 в помещении Школы."),
            Spacer(1, 16),
            Table(
                [
                    [p("Школа", "cell"), p("Заказчик", "cell")],
                    [p("<br/>______________________ К. Ланге", "cell"), p("<br/>______________________ М. С. Иванова", "cell")],
                ],
                colWidths=[85 * mm, 85 * mm],
            ),  # fmt: skip
        ]

    pdf = build_pdf(
        story,
        title=f"Договор {number}",
        author="Русская субботняя школа «Радуга» e.V.",
        decorate=page_decor(numbering="Страница {page} из {total}"),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="contract",
        language="ru",
        document_date=signed,
        sender=("Русская субботняя школа «Радуга» e.V.", "company"),
        deadlines=[
            deadline(pages, "Pay the first half of the fee", ["payment"], first_payment,
                     f"540,00 € — до {ru(first_payment)}"),
            deadline(pages, "Pay the second half of the fee", ["payment"], second_payment,
                     f"540,00 € — до {ru(second_payment)}"),
            deadline(pages, "Enrolment fee within three banking days of signing", ["payment"], fee_due,
                     "в течение трёх банковских дней", computed=True, tolerance=2, note="already overdue"),
            deadline(pages, "Last day to cancel before automatic renewal", ["cancellation"], cancel_by,
                     "не позднее чем за два месяца", computed=True, tolerance=1),
            deadline(pages, "Contract renews for the next school year", ["renewal"], year_end + DAY,
                     f"по {ru(year_end)}", computed=True, tolerance=1, required=False),
            deadline(pages, "First class, bring 35 € for materials", ["payment", "appointment", "other"],
                     first_class, f"с {ru(first_class)}", required=False),
            deadline(pages, "Parents' meeting", ["appointment"], meeting, f"{ru(meeting)} в 18:30", time="18:30",
                     required=False),
        ],
        risks=[
            risk(pages, "Automatic renewal for another school year", ["medium", "high"],
                 "автоматически продлевается"),
            risk(pages, "No refund for the current term on cancellation", ["high", "medium"],
                 "плата за текущий семестр не возвращается"),
            risk(pages, "The school can raise the price for next year", ["medium", "low"],
                 "вправе изменить стоимость обучения", required=False),
            risk(pages, "Consent to publish photos of the child unless withdrawn", ["medium", "low"],
                 "публикацию этих материалов", required=False),
            risk(pages, "Missed classes are not refunded", ["low"], "Пропущенные занятия не компенсируются",
                 required=False),
        ],
        key_facts=[
            fact(pages, "reference", number),
            fact(pages, "amount", "540,00 €"),
            fact(pages, "account", account),
            fact(pages, "amount", "1 080,00 €", required=False),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("01-saturday-school-contract-ru", pdf, ["ANL-5", "ANL-6", "DET-6"], expect)


def bank_letter(today):
    """A genuine bank letter in Russian: higher fees unless the account is closed, a data update or restrictions."""
    sent = today - 5 * DAY
    fees_change = month_start_after(today + 45 * DAY)
    object_by = fees_change - DAY
    update_by = today + 20 * DAY

    def story():
        return [
            *letterhead("Baltic Pay Bank AS", "Brīvības iela 200, Rīga, LV-1039, Latvija · balticpay.example",
                        colors.HexColor("#00507a")),  # fmt: skip
            *address_block(
                "Baltic Pay Bank AS · Brīvības iela 200 · LV-1039 Rīga",
                ["Herrn", "Andrei Kowaljow", "Hauptstraße 5", "10827 Berlin", "Deutschland"],
                [("Номер клиента", "4471-0093"), ("Дата", ru(sent))],
            ),
            p("Об изменении тарифов и обновлении данных клиента", "subject"),
            p("Уважаемый Андрей Николаевич!", "sans"),
            p(f"С <b>{ru(fees_change)}</b> ежемесячная плата за обслуживание счёта «Базовый» составит 9,90 € "
              "(сейчас 4,90 €). Переводы SEPA в евро остаются бесплатными, мгновенные переводы будут стоить "
              "0,50 € за операцию.", "sans"),  # fmt: skip
            p(f"Если вы не согласны с новыми условиями, вы можете до <b>{ru(object_by)}</b> бесплатно расторгнуть "
              "договор и закрыть счёт. Если мы не получим от вас возражений до этой даты, новые условия будут "
              "считаться принятыми.", "sans"),  # fmt: skip
            p("Кроме того, по требованиям законодательства о предотвращении отмывания денег нам необходимо обновить "
              f"сведения о вас. Пожалуйста, до <b>{ru(update_by)}</b> заполните анкету клиента в интернет-банке и "
              "загрузите подтверждение адреса, выданное не ранее чем три месяца назад (например, Meldebescheinigung "
              "или счёт за коммунальные услуги).", "sans"),  # fmt: skip
            p("Если сведения не будут обновлены в срок, банк будет вынужден ограничить операции по счёту: входящие "
              "платежи будут зачисляться, а исходящие переводы и операции по карте будут приостановлены.", "sans"),  # fmt: skip
            p("Важно: сотрудники банка никогда не просят сообщать пароли, PIN-код или коды из SMS и не предлагают "
              "перевести деньги на «безопасный счёт». Если вам поступил такой звонок, прервите его и свяжитесь с "
              "нами по телефону, указанному на сайте balticpay.example.", "sans"),  # fmt: skip
            p("Подробнее о новых тарифах: balticpay.example/tarifi.", "sans"),
            p("С уважением,<br/>Baltic Pay Bank AS, отдел обслуживания клиентов", "sans"),
        ]

    pdf = build_pdf(
        story,
        title="Изменение тарифов",
        author="Baltic Pay Bank AS",
        decorate=page_decor(footer=["Baltic Pay Bank AS · reģ. Nr. 40000000000 · balticpay.example"]),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="bank",
        language="ru",
        document_date=sent,
        sender=("Baltic Pay Bank AS", "company"),
        deadlines=[
            deadline(pages, "Close the account free of charge if you disagree", ["cancellation", "response"],
                     object_by, f"до {ru(object_by)} бесплатно"),
            deadline(pages, "Update customer data and upload proof of address", ["submission"], update_by,
                     f"до {ru(update_by)} заполните"),
            deadline(pages, "New fees take effect", ["other"], fees_change, f"С {ru(fees_change)}", required=False),
        ],
        risks=[
            risk(pages, "Account restricted without the data update", ["high", "medium"],
                 "ограничить операции по счёту"),
            risk(pages, "Monthly fee doubles to 9,90 €", ["medium", "low"], "составит 9,90 €"),
            risk(pages, "Silence counts as consent", ["medium", "low"], "будут считаться принятыми", required=False),
        ],
        key_facts=[
            fact(pages, "amount", "9,90 €"),
            fact(pages, "reference", "4471-0093", required=False),
            fact(pages, "contact", "balticpay.example", required=False),
        ],
        fraud_signals=NO_FRAUD,
        note="false-positive check: pairs with fraud/04; the bank warns about safe-account scams itself",
    )  # fmt: skip
    return Doc("02-bank-fees-and-data-update-ru", pdf, ["ANL-5", "ANL-11"], expect)


def translation_invoice(today):
    """A translation agency invoice in Russian; the account is in the owner's name, as the letterhead says."""
    issued = today - DAY
    due = issued + 10 * DAY
    number = f"{issued.year}-0418"
    account = iban("DE", "120300000018840417")
    items = [
        ("Заверенный перевод свидетельства о рождении (ru → de), 1 стр.", money("45.00")),
        ("Заверенный перевод диплома с приложением (ru → de), 6 стр. × 18,00 €", money("108.00")),
        ("Апостиль: копия и перевод, 1 стр.", money("25.00")),
        ("Отправка заказным письмом", money("8.00")),
    ]
    total = sum((amount for _, amount in items), money(0))

    def story():
        return [
            *letterhead("Бюро переводов «Слово»", "Übersetzungsbüro Slovo · Inh. Elena Wolf · Kantstraße 152 · "
                        "10623 Berlin · info@slovo-uebersetzungen.example"),  # fmt: skip
            *address_block(
                "Übersetzungsbüro Slovo · Kantstraße 152 · 10623 Berlin",
                ["Сергеев Павел Игоревич", "Bornholmer Straße 12", "10439 Berlin"],
                [("Счёт №", number), ("Дата", ru(issued)), ("Steuernummer", "34/552/01873")],
            ),
            p(f"Счёт № {number}", "subject"),
            p("Уважаемый Павел Игоревич!", "sans"),
            p("Благодарим за заказ. За выполненные переводы выставляем вам счёт:", "sans"),
            boxed(
                [["Услуга", "Сумма"]] + [[name, eur_ru(amount)] for name, amount in items]
                + [["<b>Итого к оплате</b>", f"<b>{eur_ru(total)}</b>"]],
                [130 * mm, 40 * mm],
                style="sans_cell",
                header=True,
                right_columns=(1,),
            ),  # fmt: skip
            Spacer(1, 8),
            p("Согласно § 19 UStG НДС не начисляется (малое предприятие).", "sans"),
            p("Оплатите, пожалуйста, счёт в течение 10 дней с даты выставления.", "sans"),
            p(f"Получатель: Elena Wolf, IBAN {account}, назначение платежа: «Счёт {number}».", "sans"),
            p("Готовые переводы будут отправлены заказным письмом после поступления оплаты.", "sans"),
            p("При просрочке оплаты более 30 дней мы вправе начислить проценты за просрочку в размере 5 процентных "
              "пунктов выше базовой ставки (§ 288 BGB).", "sans"),  # fmt: skip
            p("С уважением,<br/>Елена Вольф, присяжный переводчик", "sans"),
        ]

    pdf = build_pdf(story, title=f"Счёт {number}", author="Übersetzungsbüro Slovo")
    pages = Pages(pdf)
    expect = analysis(
        document_type="invoice",
        language="ru",
        document_date=issued,
        sender=("Бюро переводов «Слово»", "company"),
        deadlines=[
            deadline(pages, "Pay the invoice", ["payment"], due, "в течение 10 дней с даты выставления",
                     computed=True, tolerance=1),
        ],
        risks=[
            risk(pages, "Translations are sent only after payment", ["low", "medium"],
                 "после поступления оплаты", required=False),
            risk(pages, "Late payment interest after 30 days", ["medium", "low"], "проценты за просрочку",
                 required=False),
        ],
        key_facts=[
            fact(pages, "amount", eur_ru(total)),
            fact(pages, "reference", number),
            fact(pages, "account", account),
        ],
        fraud_signals=NO_FRAUD,
        note="false-positive check: a personal-name account is normal for a sole trader (Inh. Elena Wolf)",
    )  # fmt: skip
    return Doc("03-translation-invoice-ru", pdf, ["ANL-5", "ANL-11"], expect)


def insurance_letter(today):
    """An English letter from an expat health insurer: premium increase, right to cancel, student discount."""
    sent = today - 3 * DAY
    effective = month_start_after(today + 40 * DAY)
    cancel_by = add_months(sent, 1)
    certificate_by = today + 30 * DAY
    policy = "MXH-7741-2209"
    email = "members@meridian-expat.example"

    def story():
        return [
            *letterhead("Meridian Expat Health", "Meridian Expat Health Ltd · 1 Harbour Square · Dublin 2 · Ireland",
                        colors.HexColor("#2b4c7e")),  # fmt: skip
            *address_block(
                "Meridian Expat Health Ltd · 1 Harbour Square · Dublin 2",
                ["Ms Priya Raman", "Boxhagener Straße 33", "10245 Berlin", "Germany"],
                [("Policy number", policy), ("Date", en(sent))],
            ),
            p(f"Important changes to your policy from {en(effective)}", "subject"),
            p("Dear Ms Raman,", "sans"),
            p(f"medical costs have risen across our markets. From <b>{en(effective)}</b>, your monthly premium "
              "will increase from €142.00 to €168.50, and your annual excess (the part of your medical bills you "
              "pay yourself) will increase from €500 to €750.", "sans"),  # fmt: skip
            p("<b>Your right to cancel.</b> Because of this change, you may cancel your policy with effect from "
              f"{en(effective)} by writing to us within one month of receiving this letter.", "sans"),  # fmt: skip
            p("If you keep your cover, you do not need to do anything. The new premium will be collected by direct "
              f"debit on {en(effective)}.", "sans"),  # fmt: skip
            p("<b>Student discount.</b> Your policy includes a student discount of €25.00 per month. To keep it, "
              f"please upload your current certificate of enrolment in the member portal by <b>{en(certificate_by)}"
              f"</b>. Without it, the discount will end on {en(effective)}.", "sans"),  # fmt: skip
            p("Please note: health insurance is compulsory in Germany. If you cancel, make sure your new cover starts "
              "without a gap, and inform your residence authority if your residence permit depends on this "
              "policy.", "sans"),  # fmt: skip
            p(f"Questions? Write to {email} or use the chat in the member portal.", "sans"),
            p("Kind regards,<br/>Member Services<br/>Meridian Expat Health", "sans"),
        ]

    pdf = build_pdf(
        story,
        title="Changes to your policy",
        author="Meridian Expat Health Ltd",
        decorate=page_decor(footer=["Meridian Expat Health Ltd · registered in Ireland · meridian-expat.example"]),
    )
    pages = Pages(pdf)
    expect = analysis(
        document_type="insurance",
        language="en",
        document_date=sent,
        sender=("Meridian Expat Health Ltd", "company"),
        deadlines=[
            deadline(pages, "Last day to cancel because of the premium increase", ["cancellation"], cancel_by,
                     "within one month of receiving this letter", computed=True, tolerance=5,
                     note="counted from the document date; receipt is a few days later"),
            deadline(pages, "Upload the enrolment certificate to keep the discount", ["submission"], certificate_by,
                     f"by {en(certificate_by)}"),
            deadline(pages, "New premium debited", ["payment", "other"], effective, f"debit on {en(effective)}",
                     required=False),
        ],
        risks=[
            risk(pages, "Premium rises to €168.50 and the excess to €750", ["medium", "high"],
                 "will increase from €142.00 to €168.50"),
            risk(pages, "Student discount of €25 ends without the certificate", ["medium", "low"],
                 "the discount will end"),
            risk(pages, "Health insurance is compulsory: no gap when cancelling", ["medium", "high"],
                 "health insurance is compulsory in Germany", required=False),
        ],
        key_facts=[
            fact(pages, "reference", policy),
            fact(pages, "amount", "€168.50"),
            fact(pages, "contact", email, required=False),
        ],
        fraud_signals=NO_FRAUD,
    )  # fmt: skip
    return Doc("04-health-insurance-premium-increase-en", pdf, ["ANL-5", "ANL-6"], expect)


DOCUMENTS = [school_contract, bank_letter, translation_invoice, insurance_letter]


def generate(out, today, timezone):
    return pdf_kit(out, today, timezone, KIT, __file__, DOCUMENTS)


if __name__ == "__main__":
    run_kit(__doc__, KIT, generate)
