import { useState, useEffect, Fragment } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PASS = 48060; // 2026: €4,005/month × 12
const CAP_PER_HALF_PART = 1807; // 2026 plafonnement QF

const IR_BRACKETS = [
  { min: 0,      max: 11600,    rate: 0.00 },
  { min: 11600,  max: 29579,    rate: 0.11 },
  { min: 29579,  max: 84577,    rate: 0.30 },
  { min: 84577,  max: 181917,   rate: 0.41 },
  { min: 181917, max: Infinity, rate: 0.45 },
];

// Auto-entrepreneur rates 2025
const AE_RATES = {
  commerce:     { social: 0.123, abattement: 0.71, label: { fr: "Vente de marchandises (BIC)", en: "Goods / retail (BIC)" } },
  services_bic: { social: 0.212, abattement: 0.50, label: { fr: "Prestations de services (BIC)", en: "Services (BIC)" } },
  liberal:      { social: 0.231, abattement: 0.34, label: { fr: "Profession libérale (BNC)", en: "Liberal profession (BNC)" } },
};

// ─── EXPAT COUNTRY DATA ───────────────────────────────────────────────────────
// calcNet(grossEUR): returns net monthly in EUR after income tax + employee social
// Gulf group: 0% tax, 0% employee social

const COST_LABELS = {
  housing:   { fr: "Logement", en: "Housing" },
  health:    { fr: "Assurance santé", en: "Health insurance" },
  school:    { fr: "École (par enfant)", en: "School (per child)" },
  transport: { fr: "Transport", en: "Transport" },
  food:      { fr: "Alimentation / vie courante", en: "Food / daily living" },
};

function applyBrackets(taxable, brackets) {
  let tax = 0;
  for (const b of brackets) {
    if (taxable <= b.min) break;
    tax += (Math.min(taxable, b.max) - b.min) * b.rate;
  }
  return tax;
}

const EXPAT_COUNTRIES = {
  kw: {
    flag: "🇰🇼",
    label: { fr: "Koweït", en: "Kuwait" },
    calcNet: (grossEUR) => grossEUR,
    taxNote: { fr: "0% impôt sur le revenu · 0% cotisations salariales pour les expatriés", en: "0% income tax · 0% employee social contributions for expats" },
    costHints: {
      housing:   { fr: "1 500–3 000 €/mois (appt. 2–3 pièces à Koweït City)", en: "1,500–3,000 €/month (2–3 bed flat in Kuwait City)" },
      health:    { fr: "100–300 €/mois (assurance privée recommandée)", en: "100–300 €/month (private insurance recommended)" },
      school:    { fr: "800–1 500 €/mois par enfant (école internationale)", en: "800–1,500 €/month per child (international school)" },
      transport: { fr: "150–300 €/mois (voiture quasi-indispensable)", en: "150–300 €/month (car almost essential)" },
      food:      { fr: "500–900 €/mois (courses + restaurants)", en: "500–900 €/month (groceries + dining)" },
    },
  },
  sa: {
    flag: "🇸🇦",
    label: { fr: "Arabie Saoudite", en: "Saudi Arabia" },
    calcNet: (grossEUR) => grossEUR,
    taxNote: { fr: "0% impôt sur le revenu · 0% cotisations salariales pour les expatriés", en: "0% income tax · 0% employee social contributions for expats" },
    costHints: {
      housing:   { fr: "800–2 000 €/mois (souvent pris en charge par l'employeur)", en: "800–2,000 €/month (often covered by employer)" },
      health:    { fr: "80–250 €/mois (assurance obligatoire fournie par l'employeur)", en: "80–250 €/month (mandatory — usually employer-provided)" },
      school:    { fr: "700–1 400 €/mois par enfant (école française ou internationale)", en: "700–1,400 €/month per child (French or international school)" },
      transport: { fr: "150–250 €/mois (voiture indispensable à Riyad)", en: "150–250 €/month (car essential in Riyadh)" },
      food:      { fr: "400–800 €/mois (pas d'alcool en vente libre)", en: "400–800 €/month (no alcohol available)" },
    },
  },
  td: {
    flag: "🇹🇩",
    label: { fr: "Tchad", en: "Chad" },
    calcNet: (grossEUR, detachement = false) => {
      if (detachement) {
        const social = grossEUR * 12 * 0.23;
        const net_avant_ir = grossEUR * 12 - social;
        return net_avant_ir / 12;
      }
      const grossXAF = grossEUR * 12 * 655.957;
      const cnpsBase = Math.min(grossXAF, 6000000);
      const social = cnpsBase * 0.035;
      const profDeduction = grossXAF * 0.15;
      const taxable = Math.max(0, grossXAF - social - profDeduction);
      const brackets = [
        { min: 0,         max: 800000,    rate: 0.00 },
        { min: 800000,    max: 2000000,   rate: 0.08 },
        { min: 2000000,   max: 5000000,   rate: 0.20 },
        { min: 5000000,   max: 10000000,  rate: 0.30 },
        { min: 10000000,  max: Infinity,  rate: 0.40 },
      ];
      const incomeTax = applyBrackets(taxable, brackets);
      const netXAF = grossXAF - social - incomeTax;
      return (netXAF / 655.957) / 12;
    },
    taxNote: { fr: "ITS progressif 0–40% + CNPS salarié 3,5% (plaf. 500 000 XAF/mois). Taux fixe : 1 € = 655,957 XAF", en: "Progressive ITS 0–40% + CNPS employee 3.5% (cap 500,000 XAF/month). Fixed rate: 1 € = 655.957 XAF" },
    detachementNote: { fr: "En détachement : cotisations françaises maintenues (~23%), ITS local non appliqué. Net estimé avant IR (exonéré si +183 jours hors France).", en: "On détachement: French social contributions maintained (~23%), local ITS not applied. Net estimated before IR (exempt if +183 days outside France)." },
    costHints: {
      housing:   { fr: "600–1 500 €/mois (souvent logement de fonction fourni par l'employeur)", en: "600–1,500 €/month (company housing often provided)" },
      health:    { fr: "150–400 €/mois (assurance rapatriement indispensable)", en: "150–400 €/month (repatriation insurance essential)" },
      school:    { fr: "500–1 200 €/mois par enfant (école française de N'Djaména)", en: "500–1,200 €/month per child (French school in N'Djamena)" },
      transport: { fr: "200–400 €/mois (4x4 indispensable)", en: "200–400 €/month (4x4 vehicle essential)" },
      food:      { fr: "400–700 €/mois (courses importées plus chères)", en: "400–700 €/month (imported goods more expensive)" },
    },
  },
};
// parts: number of fiscal parts
// extra_half_parts: half-parts above the base (1 for single, 2 for couple)
//   used for plafonnement cap calculation
// décote thresholds 2026: single €1,982 → coeff 0.4525 → base €897
//                         couple €3,277 → coeff 0.4525 → base €1,483
const QF_SITUATIONS = [
  { key: "single",   parts: 1,   extra: 0, decote_threshold: 1982, decote_base: 897,  label: { fr: "Célibataire, divorcé(e), veuf/veuve", en: "Single / divorced / widowed" } },
  { key: "single_1", parts: 1.5, extra: 1, decote_threshold: 1982, decote_base: 897,  label: { fr: "Parent isolé, 1 enfant à charge", en: "Single parent, 1 dependent child" } },
  { key: "single_2", parts: 2,   extra: 2, decote_threshold: 1982, decote_base: 897,  label: { fr: "Parent isolé, 2 enfants à charge", en: "Single parent, 2 dependent children" } },
  { key: "couple",   parts: 2,   extra: 0, decote_threshold: 3277, decote_base: 1483, label: { fr: "Marié(e) / Pacsé(e), sans enfant", en: "Married / civil partnership, no children" } },
  { key: "couple_1", parts: 2.5, extra: 1, decote_threshold: 3277, decote_base: 1483, label: { fr: "Marié(e) / Pacsé(e), 1 enfant", en: "Married / civil partnership, 1 child" } },
  { key: "couple_2", parts: 3,   extra: 2, decote_threshold: 3277, decote_base: 1483, label: { fr: "Marié(e) / Pacsé(e), 2 enfants", en: "Married / civil partnership, 2 children" } },
  { key: "couple_3", parts: 4,   extra: 4, decote_threshold: 3277, decote_base: 1483, label: { fr: "Marié(e) / Pacsé(e), 3 enfants", en: "Married / civil partnership, 3 children" } },
  { key: "couple_4", parts: 5,   extra: 6, decote_threshold: 3277, decote_base: 1483, label: { fr: "Marié(e) / Pacsé(e), 4 enfants ou plus", en: "Married / civil partnership, 4+ children" } },
];

// ─── IR CALCULATION WITH QUOTIENT FAMILIAL ───────────────────────────────────
function calcIR(revenu_imposable, situation) {
  const { parts, extra, decote_threshold, decote_base } = situation;

  // Step 1: apply brackets to income per part
  const income_per_part = revenu_imposable / parts;
  let ir_per_part = 0;
  for (const b of IR_BRACKETS) {
    if (income_per_part <= b.min) break;
    ir_per_part += (Math.min(income_per_part, b.max) - b.min) * b.rate;
  }
  const ir_with_qf = ir_per_part * parts;

  // Step 2: plafonnement — cap the benefit of extra half-parts
  // Compare against IR computed with base parts only (1 for single, 2 for couple)
  const base_parts = parts - extra * 0.5; // remove extra half-parts
  const income_per_base_part = revenu_imposable / base_parts;
  let ir_per_base_part = 0;
  for (const b of IR_BRACKETS) {
    if (income_per_base_part <= b.min) break;
    ir_per_base_part += (Math.min(income_per_base_part, b.max) - b.min) * b.rate;
  }
  const ir_without_qf = ir_per_base_part * base_parts;

  // Max reduction = extra_half_parts × CAP_PER_HALF_PART
  const max_reduction = extra * CAP_PER_HALF_PART;
  const actual_reduction = ir_without_qf - ir_with_qf;
  const ir_after_plaf = extra > 0
    ? ir_without_qf - Math.min(actual_reduction, max_reduction)
    : ir_with_qf;

  // Step 3: décote
  let decote = 0;
  if (ir_after_plaf > 0 && ir_after_plaf < decote_threshold) {
    decote = Math.max(0, decote_base - ir_after_plaf * 0.4525);
  }

  return Math.max(0, ir_after_plaf - decote);
}

// ─── SALARY CALCULATOR ────────────────────────────────────────────────────────
function calcSalarie(brut, period, situation) {
  const brut_annual = period === "month" ? brut * 12 : brut;
  const brut_monthly = brut_annual / 12;

  // Social contributions
  const assiette_csg = brut_annual * 0.9825;
  const csg           = assiette_csg * 0.092;
  const crds          = assiette_csg * 0.005;
  const csg_deductible = assiette_csg * 0.068;
  const retraite_plaf  = Math.min(brut_annual, PASS) * 0.069;
  const retraite_deplaf = brut_annual * 0.004;
  const agirc_t1      = Math.min(brut_annual, PASS) * 0.0315;
  const agirc_t2_base = Math.max(0, Math.min(brut_annual, PASS * 8) - PASS);
  const agirc_t2      = agirc_t2_base * 0.0864;

  const total_cotisations = csg + crds + retraite_plaf + retraite_deplaf + agirc_t1 + agirc_t2;
  const net_avant_ir = brut_annual - total_cotisations;

  // Taxable income
  const abattement_frais = Math.min(Math.max(net_avant_ir * 0.10, 509), 14555);
  const non_deductible_csg = assiette_csg * 0.024;
  const revenu_imposable = Math.max(0, net_avant_ir - abattement_frais - csg_deductible + non_deductible_csg);

  const ir_net = calcIR(revenu_imposable, situation);
  const net_annual = net_avant_ir - ir_net;

  return {
    brut_annual, brut_monthly,
    cotisations_annual: total_cotisations,
    cotisations_monthly: total_cotisations / 12,
    net_avant_ir_annual: net_avant_ir,
    net_avant_ir_monthly: net_avant_ir / 12,
    ir_annual: ir_net,
    ir_monthly: ir_net / 12,
    net_annual,
    net_monthly: net_annual / 12,
    taux_effectif: brut_annual > 0 ? (ir_net / brut_annual) * 100 : 0,
    parts: situation.parts,
    detail: {
      csg: csg / 12,
      crds: crds / 12,
      retraite_base: (retraite_plaf + retraite_deplaf) / 12,
      retraite_comp: (agirc_t1 + agirc_t2) / 12,
    },
  };
}

function calcAutoEntrepreneur(ca_annual, activity, situation) {
  const rate = AE_RATES[activity];
  const cotisations = ca_annual * rate.social;
  const revenu_imposable = ca_annual * (1 - rate.abattement);
  const ir_net = calcIR(revenu_imposable, situation);
  const net_annual = ca_annual - cotisations - ir_net;

  return {
    ca_annual,
    ca_monthly: ca_annual / 12,
    cotisations_annual: cotisations,
    cotisations_monthly: cotisations / 12,
    ir_annual: ir_net,
    ir_monthly: ir_net / 12,
    net_annual,
    net_monthly: net_annual / 12,
    taux_social: rate.social * 100,
    parts: situation.parts,
  };
}

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const T = {
  fr: {
    subtitle: "Calculez votre salaire net à partir du brut, ou estimez vos revenus en tant qu'auto-entrepreneur. Taux officiels 2026.",
    modeSalarie: "Salarié",
    modeAE: "Auto-entrepreneur",
    inputLabel: "Salaire brut",
    inputLabelAE: "Chiffre d'affaires",
    monthly: "par mois",
    annual: "par an",
    calculate: "Calculer",
    activity: "Type d'activité",
    situationLabel: "Situation fiscale",
    partsInfo: (p) => `${p} part${p > 1 ? "s" : ""} fiscale${p > 1 ? "s" : ""}`,
    resultTitle: "Résultat",
    grossLabel: "Salaire brut",
    caLabel: "Chiffre d'affaires",
    cotisLabel: "Cotisations sociales",
    netBeforeIR: "Net avant impôt",
    irLabel: "Impôt sur le revenu (estimé)",
    netLabel: "Net en poche",
    perMonth: "/mois",
    perYear: "/an",
    detailTitle: "Détail des cotisations",
    csg: "CSG / CRDS",
    retraiteBase: "Retraite de base",
    retraiteComp: "Retraite complémentaire",
    tauxEffectif: "Taux effectif IR",
    tauxSocial: "Taux cotisations sociales",
    disclaimer: "Estimation indicative basée sur les taux 2026. Ne tient pas compte de tous les crédits d'impôt, déductions spécifiques ou revenus du conjoint. Consultez un expert-comptable pour une simulation précise.",
    footerTagline: "Calculez votre net en quelques secondes",
    newCalc: "Nouveau calcul",
    errorInvalid: "Veuillez saisir un montant valide.",
    errorTooHigh: "Montant trop élevé.",
    // Top-level tabs
    tabFrance: "Salaire France",
    tabExpat: "Comparaison expatrié",
    // Expat section
    expatTitle: "Comparer avec l'étranger",
    expatSubtitle: "Entrez votre salaire brut français et le pays de destination. Comparez votre net disponible après coût de la vie.",
    expatStep1: "Votre situation en France",
    expatStep2: "Pays de destination",
    expatStep3: "Résultat comparatif",
    expatCountryLabel: "Pays",
    expatFamilyLabel: "Situation familiale",
    expatFamilySingle: "Célibataire (sans enfants)",
    expatFamilyFamily1: "Famille (1 enfant)",
    expatFamilyFamily2: "Famille (2 enfants)",
    expatGrossAbroad: "Salaire brut à l'étranger (optionnel)",
    expatGrossAbroadHint: "Laissez vide pour calculer le brut équivalent",
    expatCompare: "Comparer",
    expatColFrance: "En France",
    expatColAbroad: "À l'étranger",
    expatGrossRow: "Salaire brut",
    expatNetRow: "Net fiscal (sans charges vie)",
    expatCostRow: "Coût de la vie estimé",
    expatDispoRow: "Net disponible",
    expatBreakdown: "Détail des coûts",
    expatEquivLabel: "Pour maintenir votre niveau de vie, il vous faut un brut de",
    expatNoTax: "Aucun impôt sur le revenu ni cotisations salariales",
    expatCostsNote: "Ajouter le coût de la vie (optionnel)",
    expatDisclaimer: "Estimations basées sur des données 2026. Les coûts réels varient selon le logement, le style de vie et les avantages négociés avec l'employeur. Source : Numbeo, Expatica, données terrain 2026.",
    expatChildrenLabel: "Nombre d'enfants à charge",
    // Package complet
    packageTitle: "Package complet (optionnel)",
    packageHint: "Ajoutez les éléments hors salaire de base pour un calcul plus précis.",
    pkg13month: "13ème mois",
    pkgHousing: "Indemnité logement",
    pkgPerDiem: "Per diem / indemnité de vie",
    pkgFlights: "Vols domicile/poste (valeur annuelle)",
    pkgHardship: "Prime de poste / hardship",
    pkgTotal: "Total package mensuel",
    // Pension warning
    pensionWarning: "⚠ Droits retraite : vous n'accumulez pas de points retraite en France pendant cette période, sauf si votre employeur maintient le régime français. Cela peut représenter une perte de 400–800 €/mois à la retraite.",
    // Detachement
    detachementLabel: "Statut d'expatriation (Tchad)",
    detachementLocal: "Expatriation locale (ITS + CNPS Tchad)",
    detachementFr: "Détachement (cotisations françaises maintenues)",
  },
  en: {
    subtitle: "Calculate your take-home pay from gross salary, or estimate your self-employed income. Based on official 2026 French rates.",
    modeSalarie: "Employee",
    modeAE: "Self-employed",
    inputLabel: "Gross salary",
    inputLabelAE: "Annual revenue",
    monthly: "per month",
    annual: "per year",
    calculate: "Calculate",
    activity: "Activity type",
    situationLabel: "Tax situation",
    partsInfo: (p) => `${p} fiscal part${p > 1 ? "s" : ""}`,
    resultTitle: "Result",
    grossLabel: "Gross salary",
    caLabel: "Revenue",
    cotisLabel: "Social contributions",
    netBeforeIR: "Net before income tax",
    irLabel: "Income tax (estimated)",
    netLabel: "Take-home pay",
    perMonth: "/month",
    perYear: "/year",
    detailTitle: "Contribution breakdown",
    csg: "CSG / CRDS",
    retraiteBase: "Basic pension",
    retraiteComp: "Supplementary pension",
    tauxEffectif: "Effective income tax rate",
    tauxSocial: "Social contribution rate",
    disclaimer: "Indicative estimate based on 2026 rates. Does not account for all tax credits, specific deductions, or spouse income. Consult an accountant for a precise calculation.",
    footerTagline: "Calculate your net pay in seconds",
    newCalc: "New calculation",
    errorInvalid: "Please enter a valid amount.",
    errorTooHigh: "Amount too high.",
    // Top-level tabs
    tabFrance: "French salary",
    tabExpat: "Expat comparison",
    // Expat section
    expatTitle: "Compare with abroad",
    expatSubtitle: "Enter your French gross salary and destination country. Compare your disposable income after cost of living.",
    expatStep1: "Your situation in France",
    expatStep2: "Destination country",
    expatStep3: "Comparison result",
    expatCountryLabel: "Country",
    expatFamilyLabel: "Family situation",
    expatFamilySingle: "Single (no children)",
    expatFamilyFamily1: "Family (1 child)",
    expatFamilyFamily2: "Family (2 children)",
    expatGrossAbroad: "Gross salary abroad (optional)",
    expatGrossAbroadHint: "Leave blank to calculate the equivalent gross needed",
    expatCompare: "Compare",
    expatColFrance: "In France",
    expatColAbroad: "Abroad",
    expatGrossRow: "Gross salary",
    expatNetRow: "Net (before living costs)",
    expatCostRow: "Estimated living costs",
    expatDispoRow: "Disposable income",
    expatBreakdown: "Cost breakdown",
    expatEquivLabel: "To match your standard of living, you need a gross salary of",
    expatNoTax: "No income tax or employee social contributions",
    expatCostsNote: "Add cost of living (optional)",
    expatDisclaimer: "Estimates based on 2026 data. Actual costs vary by housing choice, lifestyle, and employer package. Sources: Numbeo, Expatica, field data 2026.",
    expatChildrenLabel: "Number of dependent children",
    // Package complet
    packageTitle: "Full package (optional)",
    packageHint: "Add non-salary items for a more accurate calculation.",
    pkg13month: "13th month bonus",
    pkgHousing: "Housing allowance",
    pkgPerDiem: "Per diem / living allowance",
    pkgFlights: "Home flights (annual value)",
    pkgHardship: "Hardship / posting allowance",
    pkgTotal: "Total monthly package",
    // Pension warning
    pensionWarning: "⚠ Pension impact: you do not accumulate French pension rights during this period, unless your employer maintains the French scheme. This could mean €400–800/month less at retirement.",
    // Detachement
    detachementLabel: "Expatriation status (Chad)",
    detachementLocal: "Local expatriation (ITS + CNPS Chad)",
    detachementFr: "Détachement (French contributions maintained)",
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n) => n.toFixed(1) + " %";

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function ResultRow({ label, monthly, annual, highlight, t }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <span style={{ fontSize: 13, color: highlight ? "#f0ece8" : "rgba(240,236,232,0.48)", fontWeight: highlight ? 500 : 300 }}>{label}</span>
      <div style={{ display: "flex", gap: 20, textAlign: "right" }}>
        <span style={{ fontSize: 13, color: highlight ? "#fff" : "rgba(240,236,232,0.5)", fontWeight: highlight ? 700 : 400, fontFamily: "'Syne', sans-serif", minWidth: 86 }}>{fmt(monthly)}<span style={{ fontSize: 10, opacity: 0.5 }}>{t.perMonth}</span></span>
        <span style={{ fontSize: 11, color: "rgba(240,236,232,0.28)", fontFamily: "'Syne', sans-serif", minWidth: 96 }}>{fmt(annual)}<span style={{ fontSize: 9 }}>{t.perYear}</span></span>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState("fr");
  const [topTab, setTopTab] = useState("france"); // france | expat
  const [mode, setMode] = useState("salarie");
  const [inputValue, setInputValue] = useState("");
  const [period, setPeriod] = useState("month");
  const [activity, setActivity] = useState("services_bic");
  const [situationKey, setSituationKey] = useState("single");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const t = T[lang];
  const situation = QF_SITUATIONS.find(s => s.key === situationKey);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("salairenet_lang");
      if (saved && ["fr","en"].includes(saved)) setLang(saved);
    } catch {}
    // Inject Google Fonts
    if (!document.getElementById("salairenet-fonts")) {
      const link = document.createElement("link");
      link.id = "salairenet-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap";
      document.head.appendChild(link);
    }
    // Init AdSense slots
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch(e) {}
  }, []);

  const switchLang = (l) => {
    setLang(l);
    try { localStorage.setItem("salairenet_lang", l); } catch {}
  };

  const handleCalculate = () => {
    const val = parseFloat(String(inputValue).replace(/[^\d.,]/g, "").replace(",", "."));
    if (!val || val <= 0) { setError(t.errorInvalid); return; }
    if (val > 2000000) { setError(t.errorTooHigh); return; }
    setError("");
    if (mode === "salarie") {
      setResult({ type: "salarie", data: calcSalarie(val, period, situation) });
    } else {
      const ca = period === "month" ? val * 12 : val;
      setResult({ type: "ae", data: calcAutoEntrepreneur(ca, activity, situation) });
    }
  };

  const reset = () => { setResult(null); setInputValue(""); setError(""); };

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c10", fontFamily: "'DM Sans', sans-serif", color: "#f0ece8", position: "relative", overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a32; border-radius: 2px; }
        .container { max-width: 680px; margin: 0 auto; padding: 0 24px 80px; position: relative; z-index: 1; }
        .header { padding: 52px 0 36px; animation: fadeUp 0.5s ease both; }
        .header-row { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .logo-mark { display: inline-flex; align-items: center; gap: 8px; background: #0e1631; color: #fff; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(79,142,255,0.2); }
        h1 { font-family: 'Syne', sans-serif; font-size: clamp(28px, 5vw, 44px); font-weight: 800; line-height: 1.05; letter-spacing: -0.03em; margin-bottom: 12px; }
        h1 em { font-style: normal; color: #4f8eff; }
        .subtitle { color: rgba(240,236,232,0.45); font-size: 14px; font-weight: 300; line-height: 1.65; max-width: 500px; }
        .card { background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 28px; margin-bottom: 16px; animation: fadeUp 0.5s ease both; }
        .mode-toggle { display: flex; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden; margin-bottom: 24px; }
        .mode-btn { flex: 1; padding: 11px 16px; background: transparent; border: none; color: rgba(240,236,232,0.45); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.18s; }
        .mode-btn.active { background: #4f8eff; color: #fff; }
        .input-group { margin-bottom: 16px; }
        .input-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(240,236,232,0.32); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
        .parts-badge { font-size: 10px; font-weight: 600; background: rgba(79,142,255,0.12); border: 1px solid rgba(79,142,255,0.25); color: #4f8eff; padding: 2px 8px; border-radius: 100px; letter-spacing: 0; text-transform: none; }
        .input-row { display: flex; gap: 8px; }
        .input-field { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #f0ece8; font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 400; padding: 14px 16px; outline: none; transition: border-color 0.2s; }
        .input-field:focus { border-color: rgba(79,142,255,0.4); background: rgba(79,142,255,0.04); }
        .input-field::placeholder { color: rgba(240,236,232,0.18); }
        .period-toggle { display: flex; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
        .period-btn { padding: 0 12px; background: transparent; border: none; color: rgba(240,236,232,0.38); font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.18s; white-space: nowrap; }
        .period-btn.active { background: rgba(79,142,255,0.15); color: #4f8eff; }
        .select-field { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #f0ece8; font-family: 'DM Sans', sans-serif; font-size: 14px; padding: 13px 16px; outline: none; cursor: pointer; appearance: none; -webkit-appearance: none; }
        .select-field option { background: #1a1a22; color: #f0ece8; }
        .select-wrap { position: relative; }
        .select-wrap::after { content: '▾'; position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: rgba(240,236,232,0.3); pointer-events: none; font-size: 12px; }
        .btn-calc { width: 100%; background: #4f8eff; color: #fff; border: none; border-radius: 10px; padding: 15px; font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
        .btn-calc:hover { background: #6fa3ff; transform: translateY(-1px); }
        .error { color: #ff7070; font-size: 12px; margin-top: 8px; }
        .result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .result-title { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(240,236,232,0.35); }
        .net-highlight { text-align: center; background: rgba(79,142,255,0.08); border: 1px solid rgba(79,142,255,0.2); border-radius: 12px; padding: 24px; margin-bottom: 20px; }
        .net-label { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(79,142,255,0.7); margin-bottom: 6px; }
        .net-amount { font-family: 'Syne', sans-serif; font-size: clamp(30px, 6vw, 46px); font-weight: 800; color: #fff; letter-spacing: -0.02em; }
        .net-annual { font-size: 13px; color: rgba(240,236,232,0.32); margin-top: 4px; }
        .detail-toggle { display: flex; align-items: center; gap: 6px; background: transparent; border: none; color: rgba(240,236,232,0.32); font-family: 'DM Sans', sans-serif; font-size: 12px; cursor: pointer; padding: 8px 0; margin-top: 8px; transition: color 0.15s; }
        .detail-toggle:hover { color: rgba(240,236,232,0.6); }
        .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .stat-label { font-size: 12px; color: rgba(240,236,232,0.38); }
        .stat-val { font-size: 12px; color: rgba(240,236,232,0.7); font-family: 'Syne', sans-serif; font-weight: 700; }
        .disclaimer { margin-top: 20px; padding: 12px 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; font-size: 11px; color: rgba(240,236,232,0.28); line-height: 1.6; }
        .reset-btn { display: flex; align-items: center; gap: 6px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: rgba(240,236,232,0.38); border-radius: 8px; padding: 10px 16px; font-family: 'DM Sans', sans-serif; font-size: 13px; cursor: pointer; transition: all 0.2s; margin-top: 16px; }
        .reset-btn:hover { color: rgba(240,236,232,0.7); border-color: rgba(255,255,255,0.15); }
        .footer { text-align: center; padding-top: 40px; color: rgba(240,236,232,0.18); font-size: 12px; font-weight: 300; }
        .footer a { color: rgba(240,236,232,0.22); text-decoration: none; }
        .footer a:hover { color: rgba(240,236,232,0.5); }
        .lang-toggle { display: flex; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; overflow: hidden; }
        .lang-btn { padding: 5px 12px; background: transparent; border: none; color: rgba(240,236,232,0.32); font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500; cursor: pointer; border-right: 1px solid rgba(255,255,255,0.07); transition: all 0.15s; }
        .lang-btn:last-child { border-right: none; }
        .lang-btn.active { background: rgba(79,142,255,0.15); color: #4f8eff; }
        .glow { position: fixed; border-radius: 50%; filter: blur(120px); pointer-events: none; z-index: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @media(max-width:520px) { .input-row { flex-direction: column; } .net-amount { font-size: 26px; } }
      `}</style>

      <div className="glow" style={{ width: 500, height: 400, background: "rgba(79,142,255,0.05)", top: -100, left: "50%", transform: "translateX(-50%)" }} />

      <div className="container">
        <div className="header">
          <div className="header-row">
            <div className="logo-mark">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="7" fill="#0e1631"/>
                <rect x="6" y="6" width="5" height="20" rx="1.4" fill="white"/>
                <rect x="21" y="6" width="5" height="20" rx="1.4" fill="white"/>
                <polygon points="11,6 16,6 26,26 21,26" fill="#4f8eff"/>
              </svg>
              SalaireNet
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div className="lang-toggle">
                <button className={`lang-btn${lang === "fr" ? " active" : ""}`} onClick={() => switchLang("fr")}>🇫🇷 FR</button>
                <button className={`lang-btn${lang === "en" ? " active" : ""}`} onClick={() => switchLang("en")}>🇬🇧 EN</button>
              </div>
            </div>
          </div>
          <h1>{topTab === "expat"
            ? (lang === "fr" ? <>Comparer votre salaire <em>à l'étranger</em></> : <>Compare your salary <em>abroad</em></>)
            : <>Salaire <em>brut → net</em></>
          }</h1>
          <p className="subtitle">{topTab === "france" ? t.subtitle : t.expatSubtitle}</p>
        </div>

        {/* Top-level tab toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <button onClick={() => { setTopTab("france"); setResult(null); setError(""); }} style={{
            flex: 1, padding: "13px 16px", background: topTab === "france" ? "#4f8eff" : "transparent",
            border: "none", color: topTab === "france" ? "#fff" : "rgba(240,236,232,0.45)",
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.18s"
          }}>{t.tabFrance}</button>
          <button onClick={() => { setTopTab("expat"); setResult(null); setError(""); }} style={{
            flex: 1, padding: "13px 16px", background: topTab === "expat" ? "#4f8eff" : "transparent",
            border: "none", color: topTab === "expat" ? "#fff" : "rgba(240,236,232,0.45)",
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.18s"
          }}>✈ {t.tabExpat}</button>
        </div>

        {topTab === "expat" && <ExpatComparison lang={lang} t={t} situation={situation} situationKey={situationKey} setSituationKey={setSituationKey} />}

        {topTab === "france" && (
          <div className="card" style={{ animationDelay: "0.1s" }}>
            {/* Mode toggle */}
            <div className="mode-toggle">
              <button className={`mode-btn${mode === "salarie" ? " active" : ""}`} onClick={() => { setMode("salarie"); setError(""); }}>
                {t.modeSalarie}
              </button>
              <button className={`mode-btn${mode === "ae" ? " active" : ""}`} onClick={() => { setMode("ae"); setError(""); }}>
                {t.modeAE}
              </button>
            </div>

            {/* Activity selector for AE */}
            {mode === "ae" && (
              <div className="input-group">
                <div className="input-label">{t.activity}</div>
                <div className="select-wrap">
                  <select className="select-field" value={activity} onChange={e => setActivity(e.target.value)}>
                    {Object.entries(AE_RATES).map(([key, val]) => (
                      <option key={key} value={key}>{val.label[lang]}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Fiscal situation */}
            <div className="input-group">
              <div className="input-label">
                {t.situationLabel}
                <span className="parts-badge">{t.partsInfo(situation.parts)}</span>
              </div>
              <div className="select-wrap">
                <select className="select-field" value={situationKey} onChange={e => setSituationKey(e.target.value)}>
                  {QF_SITUATIONS.map(s => (
                    <option key={s.key} value={s.key}>{s.label[lang]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount input */}
            <div className="input-group">
              <div className="input-label">{mode === "salarie" ? t.inputLabel : t.inputLabelAE}</div>
              <div className="input-row">
                <input
                  className="input-field"
                  type="number"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCalculate()}
                  placeholder="3 500"
                  min="0"
                />
                <div className="period-toggle">
                  <button className={`period-btn${period === "month" ? " active" : ""}`} onClick={() => setPeriod("month")}>{t.monthly}</button>
                  <button className={`period-btn${period === "year" ? " active" : ""}`} onClick={() => setPeriod("year")}>{t.annual}</button>
                </div>
              </div>
              {error && <div className="error">{error}</div>}
            </div>

            <button className="btn-calc" onClick={handleCalculate}>{t.calculate}</button>
          </div>
        )}

        {topTab === "france" && result && (
          <ResultCard result={result} t={t} onReset={reset} lang={lang} situation={situation} />
        )}

        {/* Ad slot 1 — below result */}
        <div className="ad-slot" style={{ margin: "16px 0", minHeight: 90, background: "transparent" }}
          dangerouslySetInnerHTML={{ __html: '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins>' }}
        />

        <div className="footer">
          <p>SalaireNet par <a href="https://nexiotools.nl" target="_blank" rel="noopener noreferrer">nexiotools.nl</a> — {t.footerTagline}</p>

          {/* Ad slot 2 — above footer links */}
          <div className="ad-slot" style={{ margin: "16px 0", minHeight: 90, background: "transparent" }}
            dangerouslySetInnerHTML={{ __html: '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins>' }}
          />

          <p style={{ marginTop: 6, fontSize: 11, color: "rgba(240,236,232,0.12)" }}>
            <a href="https://nexiotools.nl/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            &nbsp;·&nbsp;
            <a href="https://nexiotools.nl/terms.html" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, t, onReset, lang, situation }) {
  const [showDetail, setShowDetail] = useState(false);
  const { type, data } = result;

  const grossMonthly = type === "salarie" ? data.brut_monthly : data.ca_monthly;
  const grossAnnual  = type === "salarie" ? data.brut_annual  : data.ca_annual;

  return (
    <>
      <div className="card" style={{ animationDelay: "0s" }}>
        <div className="result-header">
          <span className="result-title">{t.resultTitle}</span>
          <span style={{ fontSize: 11, color: "rgba(79,142,255,0.7)", background: "rgba(79,142,255,0.1)", border: "1px solid rgba(79,142,255,0.2)", borderRadius: 100, padding: "3px 10px" }}>
            {t.partsInfo(situation.parts)}
          </span>
        </div>

        {/* Net highlight */}
        <div className="net-highlight">
          <div className="net-label">{t.netLabel}</div>
          <div className="net-amount">
            {fmt(data.net_monthly)}
            <span style={{ fontSize: "0.38em", color: "rgba(240,236,232,0.35)", marginLeft: 4 }}>{t.perMonth}</span>
          </div>
          <div className="net-annual">{fmt(data.net_annual)}{t.perYear}</div>
        </div>

        {/* Breakdown */}
        <ResultRow label={type === "salarie" ? t.grossLabel : t.caLabel} monthly={grossMonthly} annual={grossAnnual} t={t} />
        <ResultRow label={t.cotisLabel} monthly={-data.cotisations_monthly} annual={-data.cotisations_annual} t={t} />
        {type === "salarie" && (
          <ResultRow label={t.netBeforeIR} monthly={data.net_avant_ir_monthly} annual={data.net_avant_ir_annual} t={t} />
        )}
        <ResultRow label={t.irLabel} monthly={-data.ir_monthly} annual={-data.ir_annual} t={t} />
        <ResultRow label={t.netLabel} monthly={data.net_monthly} annual={data.net_annual} highlight t={t} />

        {/* Stats */}
        <div style={{ marginTop: 14 }}>
          <div className="stat-row">
            <span className="stat-label">{type === "salarie" ? t.tauxEffectif : t.tauxSocial}</span>
            <span className="stat-val" style={{ color: "#4f8eff" }}>
              {type === "salarie" ? fmtPct(data.taux_effectif) : fmtPct(data.taux_social)}
            </span>
          </div>
        </div>

        {/* Cotisation detail for salariés */}
        {type === "salarie" && (
          <>
            <button className="detail-toggle" onClick={() => setShowDetail(s => !s)}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: showDetail ? "rotate(90deg)" : "none", transition: "transform 0.18s" }}>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t.detailTitle}
            </button>
            {showDetail && (
              <div style={{ marginTop: 4 }}>
                <div className="stat-row"><span className="stat-label">{t.csg}</span><span className="stat-val">{fmt(data.detail.csg + data.detail.crds)}</span></div>
                <div className="stat-row"><span className="stat-label">{t.retraiteBase}</span><span className="stat-val">{fmt(data.detail.retraite_base)}</span></div>
                <div className="stat-row"><span className="stat-label">{t.retraiteComp}</span><span className="stat-val">{fmt(data.detail.retraite_comp)}</span></div>
              </div>
            )}
          </>
        )}

        <div className="disclaimer">{t.disclaimer}</div>
      </div>

      <button className="reset-btn" onClick={onReset}>← {t.newCalc}</button>
    </>
  );
}

// ─── EXPAT COMPARISON COMPONENT ───────────────────────────────────────────────
function ExpatComparison({ lang, t, situation, situationKey, setSituationKey }) {
  const [frenchGross, setFrenchGross] = useState("");
  const [countryKey, setCountryKey] = useState("kw");
  const [expatGross, setExpatGross] = useState("");
  const [showCosts, setShowCosts] = useState(false);
  const [showPackage, setShowPackage] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [costs, setCosts] = useState({ housing: 0, health: 0, school: 0, transport: 0, food: 0 });
  const [pkg, setPkg] = useState({ month13: 0, housing: 0, perDiem: 0, flights: 0, hardship: 0 });
  const [detachement, setDetachement] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const country = EXPAT_COUNTRIES[countryKey];
  const totalCosts = Object.values(costs).reduce((a, b) => a + b, 0);
  // Package total as monthly equivalent
  const pkgMonthly = pkg.month13 + pkg.housing + pkg.perDiem + pkg.flights + pkg.hardship;

  const calcResult = (fg, ck, eg, det) => {
    const c = EXPAT_COUNTRIES[ck];
    const frData = calcSalarie(fg, "month", situation);
    const frNet = frData.net_monthly;
    const calcNetFn = (gross) => c.calcNet ? c.calcNet(gross, ck === "td" ? det : false) : gross;
    // Target: French net (what they need to at least match)
    const target = frNet + totalCosts - pkgMonthly;
    let abroadGross, abroadNet, abroadDisposable;
    if (eg && eg > 0) {
      abroadGross = eg;
      abroadNet = calcNetFn(eg) + pkgMonthly;
      abroadDisposable = abroadNet - totalCosts;
    } else {
      // Binary search for gross needed so that net + package - costs = frNet
      let lo = Math.max(100, target * 0.3), hi = target * 8, mid = target;
      for (let i = 0; i < 60; i++) {
        mid = (lo + hi) / 2;
        const disp = calcNetFn(mid) + pkgMonthly - totalCosts;
        disp < frNet ? lo = mid : hi = mid;
      }
      abroadGross = mid;
      abroadNet = calcNetFn(abroadGross) + pkgMonthly;
      abroadDisposable = abroadNet - totalCosts;
      // Round to avoid floating point noise making disposable appear < frNet
      if (Math.abs(abroadDisposable - frNet) < 0.01) abroadDisposable = frNet;
    }
    return { frData, frNet, abroadGross, abroadNet, abroadDisposable, totalCosts, pkgMonthly, eg: eg || null, detachement: det };
  };

  const handleCompare = () => {
    const fg = parseFloat(String(frenchGross).replace(/[^\d.,]/g, "").replace(",", "."));
    if (!fg || fg <= 0) { setError(t.errorInvalid); return; }
    const eg = parseFloat(String(expatGross).replace(/[^\d.,]/g, "").replace(",", "."));
    setError("");
    setResult(calcResult(fg, countryKey, eg, detachement));
  };

  const switchCountry = (key) => {
    setCountryKey(key);
    if (!result) return;
    const fg = parseFloat(String(frenchGross).replace(/[^\d.,]/g, "").replace(",", "."));
    setResult(calcResult(fg, key, result.eg, key === "td" ? detachement : false));
  };

  const reset = () => { setResult(null); setFrenchGross(""); setExpatGross(""); setError(""); };

  const CollapseSection = ({ title, open, onToggle, accent, children }) => (
    <div style={{ marginBottom: 16 }}>
      <button onClick={onToggle} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: accent ? "rgba(79,142,255,0.06)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${accent ? "rgba(79,142,255,0.2)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: open ? "10px 10px 0 0" : 10, padding: "12px 16px",
        color: accent ? "rgba(79,142,255,0.8)" : "rgba(240,236,232,0.6)",
        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.18s"
      }}>
        <span>{title}</span>
        <span style={{ fontSize: 11, color: "rgba(240,236,232,0.35)", display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>▾</span>
      </button>
      {open && (
        <div style={{ background: accent ? "rgba(79,142,255,0.03)" : "rgba(255,255,255,0.02)", border: `1px solid ${accent ? "rgba(79,142,255,0.15)" : "rgba(255,255,255,0.08)"}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px" }}>
          {children}
        </div>
      )}
    </div>
  );

  const NumberRow = ({ label, value, onChange, hint }) => {
    const [localVal, setLocalVal] = useState(value === 0 ? "" : String(value));
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, color: "rgba(240,236,232,0.45)" }}>{label}</span>
          {hint && <span style={{ fontSize: 10, color: "rgba(240,236,232,0.25)", marginLeft: 6 }}>{hint}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "rgba(240,236,232,0.3)" }}>€</span>
          <input
            type="text"
            inputMode="numeric"
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={() => { const n = parseFloat(String(localVal).replace(",", ".")) || 0; onChange(n); setLocalVal(n === 0 ? "" : String(n)); }}
            placeholder="0"
            style={{ width: 80, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#f0ece8", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "6px 10px", outline: "none", textAlign: "right" }}
          />
          <span style={{ fontSize: 11, color: "rgba(240,236,232,0.3)" }}>/mois</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {!result ? (
        <div className="card" style={{ animationDelay: "0.1s" }}>
          {/* Step 1 */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4f8eff", marginBottom: 12 }}>
            01 — {t.expatStep1}
          </div>

          <div className="input-group">
            <div className="input-label">{t.inputLabel}</div>
            <input className="input-field" type="number" value={frenchGross}
              onChange={e => setFrenchGross(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCompare()}
              placeholder="5 000" />
          </div>

          <CollapseSection
            title={lang === "fr" ? `Affiner le calcul · ${t.partsInfo(situation.parts)}` : `Refine calculation · ${t.partsInfo(situation.parts)}`}
            open={showRefine}
            onToggle={() => setShowRefine(s => !s)}
          >
            <p style={{ fontSize: 11, color: "rgba(240,236,232,0.35)", marginBottom: 10, lineHeight: 1.5 }}>
              {lang === "fr" ? "Affecte uniquement le calcul du net français utilisé comme référence." : "Only affects the French net used as the benchmark."}
            </p>
            <div className="select-wrap">
              <select className="select-field" value={situationKey} onChange={e => setSituationKey(e.target.value)}>
                {QF_SITUATIONS.map(s => (
                  <option key={s.key} value={s.key}>{s.label[lang]}</option>
                ))}
              </select>
            </div>
          </CollapseSection>

          {/* Step 2 */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4f8eff", marginBottom: 12, marginTop: 4 }}>
            02 — {t.expatStep2}
          </div>

          <div className="input-group">
            <div className="input-label">{t.expatCountryLabel}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(EXPAT_COUNTRIES).map(([key, c]) => (
                <button key={key} onClick={() => setCountryKey(key)} style={{
                  flex: "1 1 calc(33.33% - 4px)", padding: "10px 12px",
                  background: countryKey === key ? "rgba(79,142,255,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${countryKey === key ? "rgba(79,142,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 8, color: countryKey === key ? "#4f8eff" : "rgba(240,236,232,0.5)",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: countryKey === key ? 600 : 400,
                  cursor: "pointer", transition: "all 0.15s", textAlign: "left"
                }}>{c.flag} {c.label[lang]}</button>
              ))}
            </div>
          </div>

          {/* Chad détachement toggle */}
          {countryKey === "td" && (
            <div style={{ marginBottom: 16, padding: "12px 14px", background: "rgba(255,200,80,0.06)", border: "1px solid rgba(255,200,80,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,200,80,0.7)", marginBottom: 10 }}>{t.detachementLabel}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { val: false, label: t.detachementLocal },
                  { val: true,  label: t.detachementFr },
                ].map(opt => (
                  <button key={String(opt.val)} onClick={() => setDetachement(opt.val)} style={{
                    flex: 1, padding: "9px 10px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: detachement === opt.val ? 600 : 400,
                    background: detachement === opt.val ? "rgba(255,200,80,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${detachement === opt.val ? "rgba(255,200,80,0.4)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 8, color: detachement === opt.val ? "#ffc850" : "rgba(240,236,232,0.45)", cursor: "pointer", transition: "all 0.15s", textAlign: "left"
                  }}>{opt.label}</button>
                ))}
              </div>
              {detachement && (
                <p style={{ fontSize: 11, color: "rgba(255,200,80,0.6)", marginTop: 8, lineHeight: 1.5 }}>
                  {EXPAT_COUNTRIES.td.detachementNote[lang]}
                </p>
              )}
            </div>
          )}

          {/* Package complet */}
          <CollapseSection title={`✦ ${t.packageTitle}`} open={showPackage} onToggle={() => setShowPackage(s => !s)} accent>
            <p style={{ fontSize: 11, color: "rgba(240,236,232,0.35)", marginBottom: 12, lineHeight: 1.5 }}>{t.packageHint}</p>
            <NumberRow label={t.pkg13month} value={pkg.month13} onChange={v => setPkg(p => ({ ...p, month13: v }))} />
            <NumberRow label={t.pkgHousing} value={pkg.housing} onChange={v => setPkg(p => ({ ...p, housing: v }))} />
            <NumberRow label={t.pkgPerDiem} value={pkg.perDiem} onChange={v => setPkg(p => ({ ...p, perDiem: v }))} />
            <NumberRow label={t.pkgFlights} value={pkg.flights} onChange={v => setPkg(p => ({ ...p, flights: v }))} />
            <NumberRow label={t.pkgHardship} value={pkg.hardship} onChange={v => setPkg(p => ({ ...p, hardship: v }))} />
            {pkgMonthly > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(79,142,255,0.15)", marginTop: 4 }}>
                <span style={{ fontSize: 12, color: "rgba(79,142,255,0.7)" }}>{t.pkgTotal}</span>
                <span style={{ fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#4f8eff" }}>+{fmt(pkgMonthly)}/mois</span>
              </div>
            )}
          </CollapseSection>

          {/* Cost of living */}
          <CollapseSection title={t.expatCostsNote} open={showCosts} onToggle={() => setShowCosts(s => !s)}>
            <p style={{ fontSize: 11, color: "rgba(240,236,232,0.3)", marginBottom: 12, lineHeight: 1.6 }}>
              {lang === "fr" ? "Estimations indicatives pour vous aider." : "Indicative estimates to help you."}
            </p>
            {Object.entries(costs).map(([key, val]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <NumberRow label={COST_LABELS[key]?.[lang]} value={val} onChange={v => setCosts(c => ({ ...c, [key]: v }))} />
                {country.costHints?.[key] && (
                  <div style={{ fontSize: 10, color: "rgba(240,236,232,0.25)", marginTop: -6, marginBottom: 4, paddingLeft: 0, lineHeight: 1.5 }}>
                    💡 {country.costHints[key][lang]}
                  </div>
                )}
              </div>
            ))}
            {totalCosts > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 12, color: "rgba(240,236,232,0.45)" }}>Total</span>
                <span style={{ fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#f0ece8" }}>{fmt(totalCosts)}/mois</span>
              </div>
            )}
          </CollapseSection>

          {/* Foreign gross (optional) */}
          <div className="input-group">
            <div className="input-label">{t.expatGrossAbroad}</div>
            <p style={{ fontSize: 11, color: "rgba(240,236,232,0.3)", marginBottom: 8 }}>{t.expatGrossAbroadHint}</p>
            <input className="input-field" type="number" value={expatGross}
              onChange={e => setExpatGross(e.target.value)}
              placeholder="0" />
          </div>

          {error && <div className="error">{error}</div>}
          <button className="btn-calc" onClick={handleCompare}>{t.expatCompare}</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ animationDelay: "0s" }}>

            {/* Country switcher */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {Object.entries(EXPAT_COUNTRIES).map(([key, c]) => (
                <button key={key} onClick={() => switchCountry(key)} style={{
                  flex: "1 1 calc(33.33% - 4px)",
                  padding: "7px 12px",
                  background: countryKey === key ? "#4f8eff" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${countryKey === key ? "#4f8eff" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 8, color: countryKey === key ? "#fff" : "rgba(240,236,232,0.45)",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: countryKey === key ? 600 : 400,
                  cursor: "pointer", transition: "all 0.15s"
                }}>{c.flag} {c.label[lang]}</button>
              ))}
            </div>

            <div className="result-header">
              <span className="result-title">{country.flag} {country.label[lang]}</span>
              <span style={{ fontSize: 11, color: "rgba(79,142,255,0.7)", background: "rgba(79,142,255,0.1)", border: "1px solid rgba(79,142,255,0.2)", borderRadius: 100, padding: "3px 10px" }}>
                {t.partsInfo(situation.parts)}
              </span>
            </div>

            {/* Equivalent gross callout — when no foreign gross entered */}
            {!result.eg && (
              <div style={{ background: "rgba(79,142,255,0.08)", border: "1px solid rgba(79,142,255,0.2)", borderRadius: 12, padding: "18px 20px", marginBottom: 20, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(79,142,255,0.7)", marginBottom: 6 }}>
                  {t.expatEquivLabel}
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(28px,5vw,40px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
                  {fmt(result.abroadGross)}<span style={{ fontSize: "0.35em", color: "rgba(240,236,232,0.35)", marginLeft: 4 }}>/mois</span>
                </div>
                {result.pkgMonthly > 0 && (
                  <div style={{ fontSize: 12, color: "rgba(79,142,255,0.5)", marginTop: 4 }}>
                    {lang === "fr" ? `dont ${fmt(result.pkgMonthly)}/mois de package` : `incl. ${fmt(result.pkgMonthly)}/month package`}
                  </div>
                )}
              </div>
            )}

            {/* Verdict banner — when specific foreign gross is entered */}
            {result.eg && (() => {
              const diff = result.abroadDisposable - result.frNet;
              const isEnough = diff >= -0.5;
              return (
                <div style={{
                  background: isEnough ? "rgba(80,200,120,0.08)" : "rgba(255,100,100,0.08)",
                  border: `1px solid ${isEnough ? "rgba(80,200,120,0.25)" : "rgba(255,100,100,0.25)"}`,
                  borderRadius: 12, padding: "18px 20px", marginBottom: 20, textAlign: "center"
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: isEnough ? "rgba(80,200,120,0.7)" : "rgba(255,140,140,0.7)", marginBottom: 6 }}>
                    {isEnough
                      ? (lang === "fr" ? "✓ Ce salaire couvre votre niveau de vie" : "✓ This salary covers your standard of living")
                      : (lang === "fr" ? "✗ Ce salaire ne couvre pas votre niveau de vie" : "✗ This salary doesn't cover your standard of living")
                    }
                  </div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: isEnough ? "#50c878" : "#ff7070", letterSpacing: "-0.02em" }}>
                    {isEnough ? "+" : ""}{fmt(diff)}<span style={{ fontSize: "0.4em", color: isEnough ? "rgba(80,200,120,0.5)" : "rgba(255,140,140,0.5)", marginLeft: 4 }}>/mois</span>
                  </div>
                  {!isEnough && (
                    <div style={{ fontSize: 12, color: "rgba(255,140,140,0.6)", marginTop: 6 }}>
                      {lang === "fr"
                        ? `Il vous manque ${fmt(Math.abs(diff))}/mois par rapport à votre net en France`
                        : `You are ${fmt(Math.abs(diff))}/month short of your French take-home`}
                    </div>
                  )}
                  {isEnough && diff > 0.5 && (
                    <div style={{ fontSize: 12, color: "rgba(80,200,120,0.6)", marginTop: 6 }}>
                      {lang === "fr"
                        ? `Vous gagnez ${fmt(diff)}/mois de plus qu'en France`
                        : `You earn ${fmt(diff)}/month more than in France`}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Comparison table */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(240,236,232,0.3)", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}></div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(240,236,232,0.3)", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right" }}>🇫🇷 France</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f8eff", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right" }}>{country.flag} {country.label[lang]}</div>

              {[
                { label: t.expatGrossRow, fr: result.frData.brut_monthly, ab: result.abroadGross },
                { label: t.expatNetRow,   fr: result.frNet,               ab: result.abroadNet - (result.pkgMonthly || 0) },
                ...(result.pkgMonthly > 0 ? [{ label: t.pkgTotal, fr: null, ab: result.pkgMonthly }] : []),
                { label: t.expatCostRow,  fr: null, ab: result.totalCosts > 0 ? -result.totalCosts : null },
                { label: t.expatDispoRow, fr: result.frNet, ab: result.abroadDisposable, highlight: true },
              ].map((row, i) => (
                <Fragment key={i}>
                  <div style={{ fontSize: 12, color: row.highlight ? "#f0ece8" : "rgba(240,236,232,0.45)", fontWeight: row.highlight ? 500 : 300, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: row.highlight ? "#fff" : "rgba(240,236,232,0.5)", fontWeight: row.highlight ? 700 : 400, fontFamily: "'Syne', sans-serif", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "right" }}>
                    {row.fr !== null ? fmt(row.fr) : "—"}
                  </div>
                  <div style={{ fontSize: 12, color: row.highlight ? (result.abroadDisposable > result.frNet + 0.5 ? "#50c878" : result.abroadDisposable < result.frNet - 0.5 ? "#ff7070" : "#fff") : "rgba(240,236,232,0.5)", fontWeight: row.highlight ? 700 : 400, fontFamily: "'Syne', sans-serif", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "right" }}>
                    {row.ab !== null ? fmt(row.ab) : "—"}
                  </div>
                </Fragment>
              ))}
            </div>

            {/* Tax note */}
            <div style={{ padding: "8px 12px", background: "rgba(80,200,120,0.06)", border: "1px solid rgba(80,200,120,0.15)", borderRadius: 8, fontSize: 11, color: "rgba(80,200,120,0.7)", marginBottom: 12 }}>
              ✓ {country.taxNote[lang]}
            </div>

            {/* Chad détachement note on result */}
            {countryKey === "td" && result.detachement && (
              <div style={{ padding: "8px 12px", background: "rgba(255,200,80,0.06)", border: "1px solid rgba(255,200,80,0.2)", borderRadius: 8, fontSize: 11, color: "rgba(255,200,80,0.7)", marginBottom: 12 }}>
                🇫🇷 {EXPAT_COUNTRIES.td.detachementNote[lang]}
              </div>
            )}

            {/* Pension warning */}
            <div style={{ padding: "10px 14px", background: "rgba(255,100,100,0.06)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 8, fontSize: 11, color: "rgba(255,140,140,0.8)", marginBottom: result.totalCosts > 0 ? 12 : 0, lineHeight: 1.6 }}>
              {t.pensionWarning}
            </div>

            {/* Package breakdown */}
            {result.pkgMonthly > 0 && (<>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(240,236,232,0.3)", marginBottom: 8, marginTop: 16 }}>✦ {t.packageTitle}</div>
              {pkg.month13 > 0 && <div className="stat-row"><span className="stat-label">{t.pkg13month}</span><span className="stat-val">+{fmt(pkg.month13)}</span></div>}
              {pkg.housing > 0 && <div className="stat-row"><span className="stat-label">{t.pkgHousing}</span><span className="stat-val">+{fmt(pkg.housing)}</span></div>}
              {pkg.perDiem > 0 && <div className="stat-row"><span className="stat-label">{t.pkgPerDiem}</span><span className="stat-val">+{fmt(pkg.perDiem)}</span></div>}
              {pkg.flights > 0 && <div className="stat-row"><span className="stat-label">{t.pkgFlights}</span><span className="stat-val">+{fmt(pkg.flights)}</span></div>}
              {pkg.hardship > 0 && <div className="stat-row"><span className="stat-label">{t.pkgHardship}</span><span className="stat-val">+{fmt(pkg.hardship)}</span></div>}
              <div className="stat-row">
                <span className="stat-label" style={{ fontWeight: 600, color: "rgba(79,142,255,0.7)" }}>{t.pkgTotal}</span>
                <span className="stat-val" style={{ color: "#4f8eff" }}>+{fmt(result.pkgMonthly)}</span>
              </div>
            </>)}

            {/* Cost breakdown */}
            {result.totalCosts > 0 && (<>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(240,236,232,0.3)", marginBottom: 8, marginTop: 16 }}>{t.expatBreakdown}</div>
              {Object.entries(costs).map(([key, val]) => val > 0 && (
                <div key={key} className="stat-row">
                  <span className="stat-label">{COST_LABELS[key]?.[lang]}</span>
                  <span className="stat-val">{fmt(val)}</span>
                </div>
              ))}
              <div className="stat-row">
                <span className="stat-label" style={{ fontWeight: 600, color: "rgba(240,236,232,0.6)" }}>Total</span>
                <span className="stat-val" style={{ color: "#4f8eff" }}>{fmt(result.totalCosts)}</span>
              </div>
            </>)}

            <div className="disclaimer" style={{ marginTop: 16 }}>{t.expatDisclaimer}</div>
          </div>
          <button className="reset-btn" onClick={reset}>← {t.newCalc}</button>
        </>
      )}
    </>
  );
}
