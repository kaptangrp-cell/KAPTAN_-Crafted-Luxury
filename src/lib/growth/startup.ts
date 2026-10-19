import type { Action, Plan, Stock } from "./model.ts";
import { addDays } from "./model.ts";

// Editorial starting workloads, not measured conversion rates or promised outcomes.
const stages = [
  [
    "Choose your first buyer and offer",
    "Erste Zielgruppe und Angebot wählen",
    "Interview 5 potential buyers about their use case, buying objections and price expectations. Choose one audience and one hero product; write a one-sentence promise using verified product facts. Record objections before changing prices.",
    "5 potenzielle Käufer zu Nutzung, Kaufhindernissen und Preisvorstellungen befragen. Eine Zielgruppe und ein Leitprodukt wählen; ein Nutzenversprechen mit belegten Produkteigenschaften formulieren. Einwände vor Preisänderungen dokumentieren.",
    "5 conversations; one audience, offer and objection list",
    "5 Gespräche; eine Zielgruppe, ein Angebot und eine Einwandliste",
  ],
  [
    "Make the product page ready to sell",
    "Produktseite verkaufsbereit machen",
    "Create front, back, detail and in-use photos. Explain dimensions, materials, colours, delivery and returns in German and English. Ask 3 people to find a variant and complete a test checkout without charging a real payment. Fix their blockers.",
    "Vorder-, Rück-, Detail- und Anwendungsbilder erstellen. Maße, Material, Farben, Lieferung und Rückgabe auf Deutsch und Englisch erklären. 3 Personen eine Variante finden und einen Test-Checkout ohne echte Zahlung durchführen lassen. Hindernisse beheben.",
    "Complete product facts; 3 usability checks; unresolved blockers",
    "Vollständige Produktdaten; 3 Nutzertests; offene Hindernisse",
  ],
  [
    "Launch a repeatable content routine",
    "Wiederholbare Content-Routine starten",
    "Film 3 short videos: a use case, a close-up quality demonstration and an answer to a buyer objection. Publish with a clear product-page link. Record native platform reach and link clicks after 7 days; repeat the topic with the strongest useful response.",
    "3 kurze Videos drehen: Anwendung, Qualitätsdetail und Antwort auf einen Käufereinwand. Mit eindeutigem Produktlink veröffentlichen. Reichweite und Link-Klicks nach 7 Tagen aus der Plattform erfassen; das Thema mit der nützlichsten Resonanz wiederholen.",
    "3 videos; recorded reach, link clicks and buyer questions",
    "3 Videos; erfasste Reichweite, Link-Klicks und Käuferfragen",
  ],
  [
    "Build search discovery",
    "Auffindbarkeit in der Suche aufbauen",
    "List 5 purchase-intent questions for the chosen product category. Answer them on the product or category page with descriptive titles and original photos. Review Google Merchant Center free-listing eligibility and product-data accuracy; record submissions and any errors. Do not buy ads to complete this task.",
    "5 kaufnahe Fragen zur Produktkategorie sammeln und auf Produkt- oder Kategorieseite mit klaren Titeln und eigenen Fotos beantworten. Eignung für kostenlose Google-Merchant-Center-Einträge und Produktdaten prüfen; Einreichung und Fehler dokumentieren. Dafür keine Anzeigen kaufen.",
    "5 useful answers; listing readiness; available search impressions/clicks",
    "5 hilfreiche Antworten; Listing-Bereitschaft; verfügbare Suchimpressionen/Klicks",
  ],
  [
    "Test one acquisition channel",
    "Einen Akquisekanal testen",
    "Compare two messages for the same audience and product. Choose one channel and one measurable question. Calculate contribution after product cost, fulfilment, payment fees and discounts before setting any acquisition-cost limit. Review halfway through the spend cap; stop if measurement is missing or the limit is exceeded.",
    "Zwei Botschaften für dieselbe Zielgruppe und dasselbe Produkt vergleichen. Einen Kanal und eine messbare Frage wählen. Deckungsbeitrag nach Warenkosten, Versandabwicklung, Zahlungsgebühren und Rabatten vor Festlegung eines Akquisekostenlimits kalkulieren. Bei halbem Ausgabenlimit prüfen; ohne Messung oder bei Limitüberschreitung stoppen.",
    "Spend, attributable orders and cost/order; documented stop/continue decision",
    "Ausgaben, zuordenbare Bestellungen und Kosten/Bestellung; Stoppen/Fortsetzen dokumentiert",
  ],
  [
    "Develop local and creator partnerships",
    "Lokale und Creator-Partnerschaften entwickeln",
    "Shortlist 5 relevant Marburg retailers, exhibitions or small creators whose audience fits the product. Discuss a demonstration or collaboration through an appropriate business enquiry channel. Agree deliverables, disclosure, sample costs and tracking before sending products. Start with one collaboration, not a large commitment.",
    "5 passende Marburger Händler, Ausstellungen oder kleine Creator mit geeigneter Zielgruppe auswählen. Vorführung oder Zusammenarbeit über einen geeigneten Geschäftsanfragekanal besprechen. Leistungen, Kennzeichnung, Musterkosten und Messung vor Versand vereinbaren. Mit einer Kooperation beginnen.",
    "5 qualified prospects; one scoped proposal; costs and referred enquiries",
    "5 passende Kontakte; ein abgegrenztes Angebot; Kosten und vermittelte Anfragen",
  ],
  [
    "Improve the offer without blanket discounts",
    "Angebot ohne pauschale Rabatte verbessern",
    "Use buyer questions to propose one complementary bundle or gift option using available variants. Calculate its contribution and packing effort. Show the offer on one product page and record take-up. Keep the individual product available; reject a bundle that cannot meet the margin goal.",
    "Aus Käuferfragen ein ergänzendes Bundle oder Geschenkangebot mit verfügbaren Varianten ableiten. Deckungsbeitrag und Verpackungsaufwand kalkulieren. Angebot auf einer Produktseite zeigen und Nachfrage erfassen. Einzelprodukt weiterhin anbieten; Bundle unter Margenziel verwerfen.",
    "One costed offer; take-up, order value and contribution",
    "Ein kalkuliertes Angebot; Nachfrage, Bestellwert und Deckungsbeitrag",
  ],
  [
    "Build trust and repeat purchases",
    "Vertrauen und Wiederkäufe aufbauen",
    "After fulfilled orders, use permitted customer communication to invite honest feedback without requiring a positive rating. Prepare product-care content and an optional referral message for customers to share themselves. Send promotional email only where permission is documented; with no customers, prepare the materials instead.",
    "Nach erfüllten Bestellungen über zulässige Kundenkommunikation ehrliches Feedback erfragen, ohne positive Bewertung zu verlangen. Pflegehinweise und freiwillig selbst teilbare Empfehlung vorbereiten. Werbe-E-Mails nur bei dokumentierter Erlaubnis senden; ohne Kunden zunächst Materialien vorbereiten.",
    "Genuine reviews, repeat orders and customer-reported referrals",
    "Echte Bewertungen, Wiederkäufe und von Kunden genannte Empfehlungen",
  ],
  [
    "Review the launch and choose the next focus",
    "Start auswerten und nächsten Schwerpunkt wählen",
    "Compare achieved orders and revenue with the goal. Separate lack of visits from lack of purchases only where both are measured. Interview recent buyers or non-buyers, keep one useful channel, stop an unproductive experiment and write the next month's single priority. If evidence is thin, extend the test rather than claiming a winner.",
    "Bestellungen und Umsatz mit dem Ziel vergleichen. Fehlende Besuche nur bei vorhandenen Messwerten von fehlenden Käufen unterscheiden. Käufer oder Nichtkäufer befragen, einen nützlichen Kanal behalten, erfolglosen Versuch stoppen und eine Priorität für den nächsten Monat festlegen. Bei wenig Evidenz weiter testen statt einen Sieger behaupten.",
    "Goal gap; documented learning; one next priority and spending decision",
    "Ziellücke; dokumentierte Erkenntnisse; nächste Priorität und Ausgabenentscheidung",
  ],
  [
    "Prepare seasonal and corporate gifts",
    "Saisonale und Firmengeschenke vorbereiten",
    "Check the actual calendar and supplier lead times. Create one costed gift proposal with quantity options, packaging, delivery cutoff and payment terms. Discuss it with relevant local business contacts through suitable enquiry channels. Confirm stock before accepting commitments; if the season does not fit, focus on evergreen employee or client gifts.",
    "Tatsächlichen Kalender und Lieferzeiten prüfen. Ein kalkuliertes Geschenkangebot mit Mengenoptionen, Verpackung, Bestellschluss und Zahlungsbedingungen erstellen. Mit passenden lokalen Geschäftskontakten über geeignete Anfragekanäle besprechen. Bestand vor Zusagen prüfen; außerhalb passender Saison zeitlose Mitarbeiter-/Kundengeschenke anbieten.",
    "One costed proposal; qualified enquiries, quotes and confirmed orders",
    "Ein kalkuliertes Angebot; passende Anfragen, Angebote und bestätigte Bestellungen",
  ],
  [
    "Scale only what has earned it",
    "Nur nachweislich erfolgreiche Maßnahmen ausbauen",
    "Review contribution, stock, fulfilment capacity and results from the last two periods. Increase effort only for a channel with repeatable profitable orders. Keep the period spending cap; otherwise improve creative and offer at the current scale. Plan replenishment before increasing promotion.",
    "Deckungsbeitrag, Bestand, Abwicklungskapazität und Ergebnisse der letzten zwei Perioden prüfen. Aufwand nur für einen Kanal mit wiederholbaren profitablen Bestellungen erhöhen. Periodenlimit einhalten; sonst Inhalt und Angebot im bisherigen Umfang verbessern. Vor mehr Werbung Nachschub planen.",
    "Contribution after acquisition cost; repeatability; fulfilment and stock readiness",
    "Deckungsbeitrag nach Akquisekosten; Wiederholbarkeit; Liefer- und Bestandsbereitschaft",
  ],
  [
    "Plan year two from evidence",
    "Zweites Jahr auf Evidenz planen",
    "Review each product, channel and customer cohort using available records. Keep profitable offers, document missing cost or attribution data, and estimate supplier needs. Set next-year goals with explicit order-value and conversion assumptions; choose three experiments and a cash limit for each.",
    "Produkte, Kanäle und Kundengruppen anhand verfügbarer Aufzeichnungen prüfen. Profitable Angebote behalten, fehlende Kosten-/Zuordnungsdaten dokumentieren und Lieferbedarf schätzen. Folgejahresziele mit ausdrücklichen Bestellwert-/Conversion-Annahmen setzen; drei Experimente mit jeweils einem Ausgabenlimit wählen.",
    "Annual review; three prioritised experiments with budgets and assumptions",
    "Jahresauswertung; drei priorisierte Experimente mit Budget und Annahmen",
  ],
] as const;

export function launchRequirements(plan: Plan) {
  const aov = plan.launch.aov;
  const orders =
    plan.targets.orders ||
    (aov && plan.targets.revenue ? Math.ceil(plan.targets.revenue / aov) : null);
  const visits =
    orders && plan.launch.conversion ? Math.ceil(orders / (plan.launch.conversion / 100)) : null;
  return { orders, visits, revenue: orders && aov ? orders * aov : null };
}

export function suggestActions(plan: Plan, stock: Stock[], de = false): Action[] {
  const l = (en: string, ger: string) => (de ? ger : en);
  const catalogue = stock.filter((p) => p.active).sort((a, b) => b.stock - a.stock);
  return plan.buckets.flatMap((b, i) => {
    const p = plan.launch.productId
      ? catalogue.find((p) => p.id === plan.launch.productId)
      : catalogue[0];
    const product = p?.name ?? l("your first product", "Ihr erstes Produkt");
    const category = p?.category || l("your selected category", "Ihre gewählte Kategorie");
    const ready = !!p && p.stock > 0;
    const stage = stages[i];
    const prefix = l(
      plan.period === "60days" ? `Week ${i + 1}` : `Month ${i + 1}`,
      plan.period === "60days" ? `Woche ${i + 1}` : `Monat ${i + 1}`,
    );
    const context = l(
      `Focus: ${product} (${category}). Audience: ${plan.launch.audience || "choose after buyer interviews"}. Period goal: EUR ${b.targets.revenue}, ${b.targets.orders} orders, ${b.targets.customers} new buyers.`,
      `Fokus: ${product} (${category}). Zielgruppe: ${plan.launch.audience || "nach Käufergesprächen wählen"}. Periodenziel: ${b.targets.revenue} EUR, ${b.targets.orders} Bestellungen, ${b.targets.customers} neue Käufer.`,
    );
    const gate = ready
      ? l(
          `Verify the ${p.stock} recorded units and exact variants before promoting.`,
          `Die ${p.stock} erfassten Einheiten und genauen Varianten vor Werbung prüfen.`,
        )
      : l(
          "Pre-launch only: confirm supplier, receive and inspect stock, and complete product information before publishing availability or running acquisition. Do not accept orders for unavailable units.",
          "Nur Vorbereitung: Lieferant bestätigen, Bestand empfangen und prüfen, Produktdaten vervollständigen, bevor Verfügbarkeit beworben oder Akquise gestartet wird. Keine Bestellungen für nicht verfügbare Einheiten annehmen.",
        );
    const paid = ready && i === 4 && b.targets.budget > 0;
    const budget = paid ? Math.round(b.targets.budget * 100) / 100 : 0;
    const execution =
      i === 4
        ? paid
          ? l(
              `Optional paid test cap: EUR ${budget}; no spend is initiated here.`,
              `Optionaler bezahlter Test: höchstens ${budget} EUR; hier wird nichts ausgegeben.`,
            )
          : l(
              "Use two organic posts or demonstrations; no paid advertising budget is assigned.",
              "Zwei organische Beiträge oder Vorführungen nutzen; kein Anzeigenbudget zugewiesen.",
            )
        : "";
    const benefit = l(
      "Hypothesis: this step may improve buyer understanding, discovery or purchase confidence. Validate it against the period goal; no sales are guaranteed.",
      "Hypothese: Dieser Schritt kann Käuferverständnis, Auffindbarkeit oder Kaufvertrauen verbessern. Gegen das Periodenziel prüfen; keine Umsatzgarantie.",
    );
    return [
      {
        title: `${prefix}: ${stage[de ? 1 : 0]} — ${product}`.slice(0, 200),
        steps: `${context}\n${gate}\n${stage[de ? 3 : 2]}\n${execution}`,
        benefit,
        budget,
        deadline: addDays(b.end, -1),
        kpi: stage[de ? 5 : 4],
        status: "todo" as const,
      },
      {
        title:
          `${prefix}: ${l("Publish, listen and review", "Veröffentlichen, zuhören und prüfen")} — ${product}`.slice(
            0,
            200,
          ),
        steps: l(
          `Suggested workload (editable): prepare 2 useful product posts and 1 demonstration video each week; answer buyer questions on two scheduled days. ${ready ? "Publish with the correct product link." : "Keep drafts unpublished until stock and product facts are confirmed."} At period end, record orders, revenue, actual spend, available clicks and the top objection. Compare with ${b.targets.orders} orders and EUR ${b.targets.revenue}; choose one change for next period. No guessed traffic or conversion figures.`,
          `Vorgeschlagener Aufwand (editierbar): jede Woche 2 hilfreiche Produktbeiträge und 1 Anwendungsvideo vorbereiten; an zwei festen Tagen Käuferfragen beantworten. ${ready ? "Mit richtigem Produktlink veröffentlichen." : "Entwürfe erst nach Bestands- und Produktprüfung veröffentlichen."} Am Periodenende Bestellungen, Umsatz, tatsächliche Ausgaben, verfügbare Klicks und häufigsten Einwand erfassen. Mit ${b.targets.orders} Bestellungen und ${b.targets.revenue} EUR vergleichen; eine Änderung für die nächste Periode wählen. Keine erfundenen Traffic-/Conversion-Werte.`,
        ),
        benefit,
        budget: 0,
        deadline: addDays(b.end, -1),
        kpi: l(
          "Content completed; buyer questions; verified orders/revenue; one recorded learning",
          "Erstellte Inhalte; Käuferfragen; geprüfte Bestellungen/Umsatz; eine dokumentierte Erkenntnis",
        ),
        status: "todo" as const,
      },
    ];
  });
}
