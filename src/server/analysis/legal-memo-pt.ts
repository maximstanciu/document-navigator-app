// The legal memo for documents from Portugal (SPEC §7.4, rule 11; task 3.9). It opens the system
// prompt, so a provider can cache it. It helps the model explain terms and choose `kind` and
// `rule.from`; it never adds a deadline the document doesn't state. Law as of the version date.
//
// Every change gets a new version (the date of the change). It is a draft until a lawyer who knows
// Portuguese law has reviewed it (SPEC §11.2, question 13); after that, `reviewed` names the review.
// It is checked again when the law changes and at least once a year. Budget: 20k tokens.

export const LEGAL_MEMO_PT = {
  country: 'PT',
  /** The country's name in English, for rule 11 of the prompt. */
  countryName: 'Portugal',
  version: '2026-11-03',
  /** Who reviewed this version and when; `null` while it is a draft. */
  reviewed: null as string | null,
  text: `LEGAL MEMO: PORTUGAL

How to use this memo:
- Use it only for documents from Portugal: Portuguese authorities, courts, landlords, employers, companies. For other countries, ignore it.
- It helps you explain terms in plain language (rule 6) and choose "kind" and "rule.from". It never replaces the document: a deadline comes only from the text of the document. Do not add a deadline because this memo calls a period typical; if the document gives no period, there is no deadline. You may mention what usually applies in a risk's explanation, saying it is the usual rule, without a date.
- The periods below are the law as it stands; when the document says something else, the document wins.
- Article numbers (art.) are here so you understand the term; do not cite laws to the user unless the document does.

1. WHEN A PERIOD STARTS (rule.from)
- "a contar da notificação", "após a notificação" (after notification): decisions of authorities. A letter sent by carta registada (registered mail) counts as notified on the 3rd working day after it was registered at the post office (art. 113 CPA); a tax letter on the 3rd day (art. 39 CPPT). So the real deadline is a few days later than one counted from the date of the letter. Use "receipt". In "computation", say that the date of receipt is unknown, so the date is counted from the date of the letter and the real deadline may be a few days later.
- "carta registada com aviso de receção" (registered mail with a signed receipt) and "citação" (formal service that opens a court case or a tax enforcement): the period starts on the day the receipt is signed. Use "receipt". Electronic notifications (the Via CTT mailbox, the Portal das Finanças, Segurança Social Direta) count from the moment the document names; use "receipt" too.
- "a contar da receção", "após a receção", "a contar da entrega" (after it reaches you or is delivered): "receipt".
- "a contar da data da fatura", "da data de emissão", "da data desta carta": "document_date".
- A period before or after a date the text gives (end of the contract, start of the tenancy, the end of the period to pay a tax, expiry of a residence permit): "date_in_text" with that date. "até ao final do mês", "até ao fim do mês seguinte" after a period: "endOf".
- "dias úteis" (working days: Monday to Friday except public holidays): give them as days, as the schema says; the date comes out earlier. In administrative procedure, periods count in working days even where the text does not say úteis (art. 87 CPA). Periods under the Código Civil, in tax procedure (art. 20 CPPT) and in most contracts are calendar days ("dias seguidos", "dias de calendário").
- How the law counts (for the words in "computation" only; the server counts the date): the day of the event is not counted; a period of weeks, months or years ends on the day with the same weekday or number, or on the last day of a shorter month; a period that ends on a Sunday or public holiday moves to the next working day (art. 279 Código Civil). Most court periods stop during the férias judiciais (court holidays: 22 December to 3 January, Palm Sunday to Easter Monday, 16 July to 31 August), which makes them longer. The server moves no date for weekends, holidays or court holidays: the app keeps the earlier date.

2. OBJECTIONS AND OTHER TERMS PEOPLE CONFUSE
- Notificação: a formal communication from an authority or a court. Citação: the first formal notice that a court case or a tax enforcement has been started against the person; it opens the period to respond.
- Audiência prévia (audiência dos interessados, in tax matters direito de audição): before deciding against someone, an authority sends a projeto de decisão (draft decision) and gives a period to comment in writing, at least 10 working days in administrative procedure (art. 121, 122 CPA), 15 days at most in tax procedure (art. 60 LGT). It is a chance to respond, not a decision yet.
- Reclamação: a complaint to the body that decided, usually 15 working days (art. 191 CPA). Recurso hierárquico: an appeal to its superior, usually 30 working days when the law requires it before going to court (art. 193 CPA). Ação administrativa: a challenge to an administrative decision at the administrative court, usually 3 months (art. 58 CPTA).
- Reclamação graciosa: a complaint about a tax to the Autoridade Tributária e Aduaneira (AT, "as Finanças"), within 120 days after the end of the period to pay the tax voluntarily (art. 70 CPPT). Impugnação judicial: a challenge at the tax court, within 3 months after the end of that period, or 15 days after a reclamação graciosa is rejected (art. 102 CPPT). The end of the period to pay is a date in the text: "date_in_text".
- Oposição à execução fiscal: a defence against a tax enforcement, within 30 days after the citação (art. 203 CPPT).
- Contestação: the defence in a civil court case, 30 days after the citação in the common procedure (art. 569 CPC); a few extra days (dilação) may apply. Risk: high.
- Direito de livre resolução: cancelling a contract made online, by phone or at the door within 14 days, without giving a reason (art. 10 DL 24/2014); for goods it starts on delivery, and up to 12 months longer if the person was not told about the right. Not the same as a reclamação.
- Denúncia: ending a contract with notice (pré-aviso). Oposição à renovação: stopping a fixed-term contract from renewing by itself. Resolução: ending a contract because the other side broke it.
- An objection does not always postpone a payment: a reclamação graciosa or an impugnação judicial does not stop a tax from being due. Without payment, a guarantee or an agreed plan, the tax goes to execução fiscal with juros de mora (late interest).
- Kinds: a reclamação, recurso, impugnação, oposição, contestação, an answer in an audiência prévia or a consent is "response"; sending documents, applying, registering is "submission"; paying is "payment"; an agendamento or convocatória (appointment) is "appointment"; the last day to give notice or withdraw is "cancellation"; the day a contract renews by itself is "renewal"; an expiry date the document only mentions is "other".

3. COURTS AND DEBT COLLECTION
- Injunção: a payment demand for a debt that a creditor files at the Balcão Nacional de Injunções (BNI); no judge has checked whether the claim is right. Within 15 days after the notificação the person can pay or file an oposição (DL 269/98). Without an oposição the creditor gets an enforceable title (fórmula executória) and can enforce it. Risk: high.
- Execução (ação executiva): enforcement of a debt through an agente de execução (an enforcement agent, a private professional, not the police). After the citação, the debtor can object by embargos de executado within 20 days (art. 728 CPC). Penhora (seizure): part of the wages or pension, bank accounts, a car, a home. Risk: high.
- Execução fiscal: enforcement of tax or Segurança Social debts by the AT or the Secção de Processo Executivo of the Segurança Social. After the citação, 30 days to pay, to ask for pagamento em prestações (instalments) or to file an oposição; then penhora can follow. Risk: high.
- Cobrança (debt collection) by a company or a law firm: not a court and not an authority. The deadline in its letter is its own demand ("payment"). Worth checking: is the claim real and known, is it time-barred, are the fees reasonable.
- Prescrição (limitation): electricity, gas, water, phone and internet bills must be claimed within 6 months after the service (art. 10 Lei 23/96); periodic payments such as rent and interest within 5 years, other claims usually within 20 years (art. 309, 310 Código Civil). Explain it if relevant; it is not a deadline.

4. PAYMENTS, REMINDERS, FEES
- Fatura (invoice), fatura-recibo, nota de débito: the payment period is what the invoice says ("data limite de pagamento", "pagar até"; "30 dias a contar da data da fatura": "document_date"). No period, no deadline: "pronto pagamento" (due at once) without a date goes into the summary, not into "deadlines". A discount for paying early (desconto de pronto pagamento) is a separate "payment" deadline.
- Referência Multibanco: Entidade (5 digits), Referência (9 digits) and Montante, paid at a cash machine or in a banking app. Key facts ("reference"); they must be copied exactly, or the payment goes elsewhere. MB WAY: a phone payment app.
- Débito direto (SEPA direct debit): the amount is taken from the account on the stated date ("payment"; the person needs enough money in the account). An authorised SEPA direct debit can be refunded through the bank within eight weeks. The authorisation number (ADC) and the creditor's identifier are key facts ("reference").
- Mora (default): the debtor is late after the due date or a reminder; juros de mora (late interest) and reasonable collection costs can be added. Lembrete, aviso de pagamento, último aviso: reminders from the creditor.
- Aviso de suspensão or aviso de corte: an essential service (electricity, gas, water, phone, internet) may be cut for an unpaid bill only after a written notice at least 20 days before the cut (art. 5 Lei 23/96). The date to pay before the cut is a "payment" deadline; risk: high.
- Fatura de acerto (balancing bill after a meter reading), leitura (meter reading), tarifa social (reduced rate for low incomes).
- NIF (tax number), NISS (Segurança Social number), número de cliente, número de contrato, CPE and CUI (codes of the electricity and gas supply point), número de processo, referência: key facts "reference"; IBAN (PT50 …) and BIC/SWIFT: "account".
- Pagamento em prestações (instalments) and prorrogação (extension): can be requested; an option to mention, not a deadline.

5. TYPICAL DOCUMENTS (use only the periods the document itself states)
- Nota de liquidação de IRS (income tax assessment from the AT): if tax is owed, it gives a data limite de pagamento ("payment"). Reclamação graciosa within 120 days and impugnação judicial within 3 months, both counted from the end of the period to pay ("response", "date_in_text"). Reembolso: a refund, nothing to do. IMI (municipal property tax) comes with a nota de cobrança and is paid in one, two or three instalments by the dates it gives; IUC (vehicle tax) is paid every year by the date it gives.
- Segurança Social: a pedido de elementos (request to send documents or confirm a situation) by a date ("submission"); without an answer, a benefit (subsídio de desemprego, abono de família, other prestações) can be suspended or refused. Decisions: reclamação or recurso as the letter says. Unpaid contributions go to execução fiscal.
- AIMA (Agência para a Integração, Migrações e Asilo, which replaced SEF in 2023): autorização de residência (residence permit), título de residência (the card), renovação (renewal), agendamento (appointment, e.g. for biometric data). A permit is renewed by applying before it expires; a date to apply or send documents by is "submission"; an appointment is "appointment"; an expiry date the document only mentions is "other". Missing an appointment can close the case. Do not assume an extension of validity the document does not mention. Risk: high (right to stay and work).
- Loja do Cidadão, Espaço Cidadão, conservatória (registry office), câmara municipal (city hall), junta de freguesia (parish council), centro de saúde (health centre): appointments ("appointment"), certificates such as atestado de residência.
- Auto de contraordenação (notice of a road traffic offence) from the ANSR or the police: within 15 working days after the notificação the person can pay the minimum fine (pagamento voluntário), send a defesa (defence) or name the driver (Código da Estrada). Use "receipt"; paying is "payment", a defesa is "response". Coima: a fine. Inibição de conduzir: a driving ban. Carta por pontos: points on the driving licence. Portagens (tolls): unpaid tolls first come as a notice from the toll operator; unpaid, they become a debt with fines collected by the AT.
- Contrato de arrendamento (tenancy agreement): rent is paid in advance, by the date the contract sets. If the rent is late, the landlord can demand 20 % more as compensation; this right ends if the tenant pays within 8 days after the due date (art. 1041 Código Civil). A fixed-term contract renews by itself for the same period, or 3 years if the term is shorter, unless one side sends an oposição à renovação in time (art. 1096). The tenant's notice before the end of the term: 120 days for a term of 6 years or more, 90 days for 1 to 6 years, 60 days for 6 months to 1 year, a third of the term below that (art. 1098); the landlord's: 240, 120, 60 days or a third (art. 1097). After a third of the term, the tenant can end the contract with 120 days' notice (60 days for a term under one year). These are "cancellation" deadlines counted "before" the end date: "date_in_text". Rent can be updated once a year by the official coefficient, with written notice at least 30 days before (art. 1077 Código Civil). Notices between landlord and tenant go by carta registada com aviso de receção (art. 9 NRAU). Caução: the deposit.
- Contrato de trabalho, despedimento (dismissal by an employer): a court challenge within 60 days after receiving the dismissal (art. 387 Código do Trabalho) ("response", "receipt"); risk: high. An employee who resigns gives 30 days' notice with up to 2 years of service, 60 days after that (art. 400). Período experimental: probation. Subsídio de desemprego (unemployment benefit) is requested from the Segurança Social within 90 days after the job ends.
- Mobile phone, internet and TV contracts: a período de fidelização (lock-in period), usually up to 24 months; leaving earlier costs the fee the contract states. A change of the terms or the price must be announced in advance and gives the right to cancel without that fee within the period the letter states.
- Electricity and gas: price changes are announced in advance; outside a lock-in, the customer can change supplier without a fee.
- Seguros (insurance): contracts usually run a year and renew by themselves; the contract or the letter states the notice to stop the renewal. Car insurance is compulsory; driving without it is a serious offence.
- Condomínio (building owners' association): quotas (fees) and the assembleia de condóminos (owners' meeting); the meeting date is "appointment".

6. FAKE OR DUBIOUS LETTERS (signs for "fraudSignals")
- Taxes and contributions are paid to the State with an official payment reference (a referência para pagamento or a DUC from the Portal das Finanças or Segurança Social Direta, or a Multibanco reference on the official letter), never to a private person's IBAN, by MB WAY to a phone number, by gift cards or in cryptocurrency.
- The AT, the Segurança Social, the CTT (post), toll operators and banks do not ask by email or SMS for card details, passwords, access codes or SMS codes, and a tax refund never costs a fee. SMS about a parcel held for a customs fee, an unpaid toll or a blocked tax refund with a payment link are common scams.
- Anyone asking for an MB WAY code, or to confirm a payment in MB WAY in order to receive money, is a scammer.
- Court and enforcement papers (citação, injunção, penhora) come by registered mail from a court, the BNI or an agente de execução with a número de processo, not by email or SMS with a payment link.
- A collection letter for a debt the person does not know, with a foreign IBAN, a very short deadline or threats of arrest.
- Offers that look like invoices: a registration in a business directory or a trademark register lookalike is an offer, not a bill, and nothing is owed unless the person signs.

7. WORDS THAT ARE NOT DEADLINES
- Data, data de emissão, data do documento: the date of the document.
- Período de faturação (billing period), ano fiscal or período de tributação (the tax year), período de referência: periods, not deadlines.
- "Válido até" on an ID card, a permit or a quote (orçamento): an expiry date; a deadline only if the document asks to act by it.
- Data-valor and data de movimento in a bank statement: booking dates, not deadlines. Data de vencimento of an invoice is a payment deadline.
- A window to send a meter reading ("comunique a leitura entre os dias 20 e 23"): an option, a deadline only if the document says what happens otherwise.`,
} as const;
