import type { EmailName } from "@/lib/nylas/types";

export type ThreadClassification = {
  kind: string;
  confidence: number;
  reason: string;
};

type ClassificationInput = {
  subject?: string | null;
  latestSnippet?: string | null;
  participants?: EmailName[];
  samples?: Array<{
    subject?: string | null;
    snippet?: string | null;
  }>;
};

const purchaseOrderPatterns = [
  /\bpo\b/i,
  /\bp\.o\.\b/i,
  /purchase order/i,
  /order confirmation/i,
  /invoice/i,
  /payment terms/i,
];

const sourcingPatterns = [
  /\brfq\b/i,
  /request for quote/i,
  /\bquote\b/i,
  /\bquotation\b/i,
  /\bsourcing\b/i,
  /\bsupplier\b/i,
  /\bvendor\b/i,
  /\bmanufacturer\b/i,
  /\bmoq\b/i,
  /lead time/i,
];

const logisticsPatterns = [/shipment/i, /tracking/i, /delivery/i, /freight/i, /warehouse/i, /bill of lading/i];

export function classifyThread(input: ClassificationInput): ThreadClassification {
  const haystack = [
    input.subject,
    input.latestSnippet,
    ...(input.samples ?? []).flatMap((sample) => [sample.subject, sample.snippet]),
    ...(input.participants ?? []).flatMap((participant) => [participant.name, participant.email]),
  ]
    .filter(Boolean)
    .join("\n");

  const poMatches = countMatches(haystack, purchaseOrderPatterns);
  const sourcingMatches = countMatches(haystack, sourcingPatterns);
  const logisticsMatches = countMatches(haystack, logisticsPatterns);

  if (poMatches > 0 && poMatches >= sourcingMatches) {
    return {
      kind: "purchase_order",
      confidence: clamp(0.55 + poMatches * 0.12),
      reason: "Matched purchase-order language in the subject, snippet, or participants.",
    };
  }

  if (sourcingMatches > 0) {
    return {
      kind: "sourcing",
      confidence: clamp(0.5 + sourcingMatches * 0.1),
      reason: "Matched sourcing, RFQ, supplier, or quotation language.",
    };
  }

  if (logisticsMatches > 0) {
    return {
      kind: "logistics",
      confidence: clamp(0.45 + logisticsMatches * 0.08),
      reason: "Matched shipment, tracking, delivery, or freight language.",
    };
  }

  return {
    kind: "uncategorized",
    confidence: 0.15,
    reason: "No strong sourcing, purchase-order, or logistics signals found in the selected metadata.",
  };
}

function countMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(value) ? 1 : 0), 0);
}

function clamp(value: number) {
  return Math.max(0, Math.min(0.95, value));
}
