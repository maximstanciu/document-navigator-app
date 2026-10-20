// The legal memo for documents from Germany (SPEC §7.4, rule 11; task 3.9). It opens the system
// prompt, so a provider can cache it. It helps the model explain terms and choose `kind` and
// `rule.from`; it never adds a deadline the document doesn't state. Law as of the version date.
//
// Every change gets a new version (the date of the change). It is a draft until a lawyer who knows
// German law has reviewed it (SPEC §11.2, question 13); after that, `reviewed` names the review.
// It is checked again when the law changes and at least once a year. Budget: 20k tokens.

export const LEGAL_MEMO_DE = {
  version: '2026-10-20',
  /** Who reviewed this version and when; `null` while it is a draft. */
  reviewed: null as string | null,
  text: `LEGAL MEMO: GERMANY

How to use this memo:
- Use it only for documents from Germany: German authorities, courts, landlords, employers, companies. For other countries, ignore it.
- It helps you explain terms in plain language (rule 6) and choose "kind" and "rule.from". It never replaces the document: a deadline comes only from the text of the document. Do not add a deadline because this memo calls a period typical; if the document gives no period, there is no deadline. You may mention what usually applies in a risk's explanation, saying it is the usual rule, without a date.
- The periods below are the law as it stands; when the document says something else, the document wins.
- Section numbers (§) are here so you understand the term; do not cite laws to the user unless the document does.

1. WHEN A PERIOD STARTS (rule.from)
- "nach Bekanntgabe" (after notification): decisions of authorities (Bescheid). A Bescheid sent by ordinary post counts as notified on the 4th day after it was posted (§ 122 AO for taxes, § 41 VwVfG, § 37 SGB X; it was the 3rd day until 2024), so the real deadline is a few days later than one counted from the date of the letter. Use "receipt". In "computation", say that the period runs from notification and that the app counts from the date of the letter, which is earlier.
- "nach Zustellung" (after formal delivery): court papers, Bußgeldbescheid, Mahnbescheid, Strafbefehl, some Bescheide. Delivered with a Postzustellungsurkunde in a yellow envelope; the postal worker writes the delivery date on the envelope, and the period starts that day. Use "receipt". In "computation", tell the reader to check and keep the date on the envelope.
- "nach Zugang", "nach Erhalt", "nach Eingang" (after it reaches you): "receipt".
- "ab Rechnungsdatum", "nach Rechnungsstellung", "ab Datum dieses Schreibens": "document_date".
- A period before or after a date the text gives (end of the contract, start of the tenancy, expiry of a permit): "date_in_text" with that date. "zum Monatsende", "zum Quartalsende", "zum Jahresende" after a period: "endOf".
- "Werktage" (working days; in German law Saturday usually counts as a Werktag, Sunday and public holidays do not) and "Arbeitstage" (Monday to Friday): give them as days, as the schema says; the date comes out earlier.
- How the law counts (for the words in "computation" only; the server counts the date): the day of the event is not counted; a period of weeks or months ends on the day with the same weekday or number, or on the last day of a shorter month (§§ 187, 188 BGB). When the last day is a Saturday, Sunday or public holiday, the period usually ends on the next working day (§ 193 BGB, § 222 ZPO, § 108 AO), but the app keeps the earlier date. Never present that shift as a reason to wait.

2. OBJECTIONS AND OTHER TERMS PEOPLE CONFUSE
- Bescheid: a formal decision of an authority (tax, benefits, fees, fines). It usually ends with a Rechtsbehelfsbelehrung.
- Rechtsbehelfsbelehrung (or Rechtsmittelbelehrung): the part that says how, where and by when to object. If it is missing or wrong, the period is usually one year instead of one month (§ 58 VwGO, § 356 AO, § 66 SGG). Explain this as a risk; do not make a deadline of it.
- Widerspruch: an objection to a Bescheid of an authority, e.g. Jobcenter, Agentur für Arbeit, Sozialamt, Krankenkasse, Rentenversicherung, Elterngeldstelle, Beitragsservice, many decisions of a city or district. Usually within one month after Bekanntgabe, in writing to the authority that issued it (§ 70 VwGO, § 84 SGG). In some federal states and for some decisions there is no Widerspruch, only a Klage: the Rechtsbehelfsbelehrung says which. The same word also names the objection to a Mahnbescheid (section 3) and the hardship objection of a tenant (section 5).
- Einspruch: an objection to a tax Bescheid, including Kindergeld decisions of the Familienkasse: one month after Bekanntgabe (§ 355 AO). To a Bußgeldbescheid: two weeks after Zustellung (§ 67 OWiG). To a Strafbefehl: two weeks after Zustellung (§ 410 StPO). To a Vollstreckungsbescheid or a Versäumnisurteil: two weeks after Zustellung (§ 339 ZPO).
- Klage: a lawsuit at a court, when there is no Widerspruch or after a Widerspruchsbescheid (the decision on the objection): usually one month after Bekanntgabe or Zustellung (§ 74 VwGO, § 87 SGG, § 47 FGO). Kündigungsschutzklage against a dismissal by an employer: three weeks after receiving it (§ 4 KSchG).
- Notfrist: a court deadline that cannot be extended.
- Widerruf: cancelling a contract within the withdrawal period, 14 days for contracts made online, by phone or at the door (§ 355 BGB); for goods it starts on delivery, and not before the person was told about the right (at the latest after 12 months and 14 days, § 356 BGB). Not the same as Widerspruch.
- Kündigung: ending a contract with notice; Kündigungsfrist: the notice period. Sonderkündigungsrecht: a special right to cancel, e.g. after a price increase.
- Anhörung: a hearing before a decision; the authority asks for a statement by a date. A chance to respond, not a decision yet.
- Mitwirkung: the duty to cooperate, e.g. send documents to a benefits office. Without it, benefits can be refused or stopped (§§ 60, 66 SGB I).
- An objection does not always postpone a payment: an Einspruch against a tax Bescheid does not (§ 361 AO); the tax stays due on its date unless the Finanzamt grants Aussetzung der Vollziehung. An Einspruch against a Bußgeldbescheid does: the fine is not due while it is open.
- Kinds: an objection or a reply (Widerspruch, Einspruch, Klage, Anhörung, consent) is "response"; sending documents, applying, registering is "submission"; paying is "payment"; a Termin is "appointment"; the last day to give notice or withdraw is "cancellation"; the day a contract renews by itself is "renewal"; an expiry date the document only mentions is "other".

3. COURTS AND DEBT COLLECTION
- Mahnbescheid: a payment order from a court (Mahngericht, an Amtsgericht) at a creditor's request, delivered in a yellow envelope with an objection form. The court has not checked whether the claim is right. Within two weeks after Zustellung the person can pay or object (Widerspruch); without an objection the creditor can get a Vollstreckungsbescheid (§§ 692, 694 ZPO). Risk: high.
- Vollstreckungsbescheid: an enforceable title. Einspruch within two weeks after Zustellung (Notfrist); after that the creditor can enforce: Gerichtsvollzieher (bailiff), Pfändung (seizure) of the bank account or wages. Risk: high.
- Gerichtsvollzieher: a Zahlungsaufforderung usually gives two weeks to pay before the Vermögensauskunft, a sworn statement of assets (§ 802f ZPO).
- Inkasso: a debt collection agency, not a court and not an authority. The deadline in its letter is its own demand ("payment"). Worth checking: is the claim real and known, is it time-barred, are the fees reasonable. Collection agencies must be registered (Rechtsdienstleistungsregister).
- Verjährung: the usual limitation period for claims is three years, counted from the end of the year the claim arose (§§ 195, 199 BGB). Explain it if relevant; it is not a deadline.
- Schufa: a credit agency; unpaid undisputed debts can be reported to it after reminders.

4. PAYMENTS, REMINDERS, FEES
- Rechnung (invoice): the payment period is what the invoice says ("zahlbar innerhalb von 14 Tagen nach Rechnungsdatum": "document_date"). No period, no deadline: "sofort zahlbar" (due at once) without a date goes into the summary, not into "deadlines". Skonto: a discount for paying early ("2 % Skonto bei Zahlung innerhalb von 10 Tagen"), a separate "payment" deadline.
- Verzug (default): the debtor is late after a reminder or after the due date. A consumer is in default 30 days after the due date and receiving the invoice only if the invoice says so (§ 286 BGB). Then Verzugszinsen (interest; for consumers 5 percentage points above the base rate, § 288 BGB) and reasonable Mahngebühren (reminder fees, a few euros) can be added.
- Zahlungserinnerung, Mahnung, letzte Mahnung: reminders from the creditor. The law does not require three reminders; after the last one, a Mahnbescheid or Inkasso may follow.
- Lastschrift, SEPA-Lastschriftmandat: the amount is taken from the account on the stated date ("payment"; the person needs enough money in the account). An authorised SEPA direct debit can be refunded through the bank within eight weeks (§ 675x BGB). Gläubiger-ID and Mandatsreferenz are key facts ("reference").
- Abschlag (monthly instalment), Nachzahlung (back payment), Guthaben (credit), Jahresabrechnung (annual statement for electricity, gas, heating, water).
- Säumniszuschlag: a late fee on taxes, 1 % of the rounded-down tax for every started month (§ 240 AO).
- Stundung (deferral) and Ratenzahlung (instalments): can be requested; an option to mention, not a deadline.
- Kassenzeichen, Aktenzeichen, Steuernummer, Steuer-ID, Kundennummer, Vertragsnummer, Verwendungszweck (payment reference): key facts "reference"; IBAN and BIC: "account". The payment reference must be copied exactly, or the payment may not be matched.

5. TYPICAL DOCUMENTS (use only the periods the document itself states)
- Steuerbescheid, e.g. Einkommensteuerbescheid (Finanzamt): Einspruch one month after Bekanntgabe ("response", "receipt"). A Nachzahlung (back tax) has its own due date ("payment"). Vorauszahlungen (prepayments of income tax) fall on 10 March, 10 June, 10 September and 10 December. "Vorläufig" or "unter Vorbehalt der Nachprüfung": the Finanzamt can still change it. Erstattung: a refund, nothing to do.
- Familienkasse (Kindergeld): a request to send proof, e.g. a Schulbescheinigung, by a date ("submission"); without it, Kindergeld can be stopped and paid-out money reclaimed (Rückforderung). Decisions: Einspruch, one month.
- Jobcenter, Agentur für Arbeit: an Einladung to a Termin ("appointment"); missing it without an important reason can reduce benefits (Leistungsminderung). Mitwirkung requests ("submission"). Bescheide: Widerspruch, one month.
- Bußgeldbescheid (fine, e.g. for speeding, from a Bußgeldstelle): Einspruch two weeks after Zustellung ("response", "receipt"). The fine is due two weeks after the decision becomes final (Rechtskraft), which happens when the Einspruch period ends without an Einspruch: that is four weeks after receipt ("payment", "receipt", 4 weeks; say so in "computation"). Punkte in Flensburg: points in the driving register. Fahrverbot (driving ban): the licence is handed in; someone without a ban in the last two years may choose to start it within four months after the decision becomes final (§ 25 StVG).
- Anhörungsbogen (questionnaire before a fine): the accused does not have to say anything about the accusation, but must give personal details (§ 111 OWiG). Verwarnungsgeld (warning fine, up to 55 euros): paying within the stated week ends the matter; otherwise a Bußgeldbescheid with fees may follow.
- Beitragsservice (Rundfunkbeitrag, the broadcasting fee): one fee per home, regardless of devices, due every three months in the middle of the period. A Festsetzungsbescheid sets unpaid fees with a late fee: Widerspruch, one month; it can be enforced.
- Ausländerbehörde (foreigners' authority): a residence permit (Aufenthaltstitel) must be renewed before it expires. If the application is made before the expiry date, the stay remains lawful until the decision (Fiktionsbescheinigung, § 81 AufenthG); after the expiry date it does not. The expiry date the document only mentions is "other"; a date to apply by is "submission"; a Termin is "appointment". Risk: high (right to stay and work).
- Bürgeramt, Meldebehörde: register a new address within two weeks after moving in (§ 17 BMG).
- Mietvertrag (tenancy agreement): rent is due in advance by the third Werktag of each month (§ 556b BGB). A tenant's notice: three months; it must reach the landlord by the third Werktag of a month to end the tenancy at the end of the month after next (§ 573c BGB). A landlord needs a reason (e.g. Eigenbedarf, own use) and a longer notice the longer the tenancy lasted; the tenant can object for hardship (Widerspruch, § 574 BGB) up to two months before the end, if the landlord's letter says so. Kaution (deposit): at most three months' rent without heating and other costs, payable in three instalments (§ 551 BGB). Mieterhöhung (rent increase to the local level, § 558 BGB): the tenant has until the end of the second month after receiving it to agree ("response", "receipt", 2 months, endOf "month"); the new rent applies from the third month. Nebenkostenabrechnung (statement of service charges): due from the landlord within 12 months after the end of the period; the tenant can object within 12 months after receiving it (§ 556 BGB). Staffelmiete and Indexmiete: rent that rises by steps or with inflation.
- Arbeitsvertrag, Kündigung by an employer: Kündigungsschutzklage within three weeks after receiving the dismissal ("response", "receipt"); risk: high. Basic notice: four weeks to the 15th or the end of a month, longer for employers after years of employment, two weeks in the Probezeit (probation) (§ 622 BGB). The person must register as arbeitsuchend (job-seeking) with the Agentur für Arbeit within three days of learning about the end of the job, or three months before it if that is later; otherwise unemployment benefit can be blocked for a week (§§ 38, 159 SGB III).
- Mobile phone, internet, gym, streaming and other consumer contracts: the first term is at most two years; contracts made since March 2022 renew only for an indefinite time and can then be cancelled at any time with one month's notice (§ 309 BGB, § 56 TKG). A price increase usually gives a Sonderkündigungsrecht.
- Electricity and gas: price changes are announced in advance, and the customer can cancel without notice by the date they take effect (§ 41 EnWG). Grundversorgung: the default supply contract, can be cancelled with two weeks' notice.
- Versicherung (insurance): contracts often run a year and renew by themselves; cancel by the notice period before the end (car insurance usually one month before 1 January). A premium increase gives a right to cancel within one month after receiving the notice (§ 40 VVG). Gesetzliche Krankenkasse (statutory health insurance): can be changed after 12 months with two months' notice to the end of a month; when it raises the Zusatzbeitrag, the member can leave by the end of the month the increase starts (§ 175 SGB V).

6. FAKE OR DUBIOUS LETTERS (signs for "fraudSignals")
- Payments to authorities go to an official account (Finanzamt, Bundeskasse, Landeshauptkasse, Stadtkasse, Amtskasse) with a Kassenzeichen or Steuernummer, never to a private person, by gift cards or in cryptocurrency.
- The Finanzamt, the Bundeszentralamt für Steuern, the Familienkasse, the police and banks do not ask by email or SMS for bank details, passwords, PINs or TANs, and a tax refund never costs a fee.
- Court letters (Mahnbescheid, Vollstreckungsbescheid) come by post from a court with an Aktenzeichen, not by email, and a Mahnbescheid names an Amtsgericht as Mahngericht.
- An Inkasso letter for a claim the person does not know, with a foreign IBAN, a very short deadline or threats of arrest or Schufa entries for a disputed claim.
- Offers that look like invoices: an "Eintragungsofferte" for a register or directory (e.g. "Gewerbeauskunft", "Handelsregister" lookalikes) is an offer, not a bill, and nothing is owed unless the person signs.
- An Abmahnung (cease-and-desist letter, e.g. for file sharing) demanding quick payment: real ones exist; check the law firm before paying.

7. WORDS THAT ARE NOT DEADLINES
- Datum, Bescheiddatum, Ausstellungsdatum, Ausfertigungsdatum: the date of the document.
- Veranlagungszeitraum (the tax year), Abrechnungszeitraum (the billing period), Leistungszeitraum, Bewilligungszeitraum (the period benefits are granted for): periods, not deadlines.
- "gültig bis" on an ID or permit: an expiry date; a deadline only if the document asks to act by it.
- Stichtag: a reference date; a deadline only if something must be done by it.`,
} as const;
