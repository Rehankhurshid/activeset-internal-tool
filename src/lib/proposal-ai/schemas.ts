import { z } from 'zod';

// Shared between the AI Gateway routes and the client parser.
//
// Intentionally loose: enums and length bounds are NOT enforced at the
// schema level because models (especially fast ones like Gemini Flash)
// occasionally deviate and return 'No object generated' instead of a
// usable draft. We take whatever the model returns, then normalize in
// the route handler — filter to allowed values, clamp counts, fill
// sensible defaults. This fails open instead of failing closed.

export const ALLOWED_TITLES = [
  'Website Proposal',
  'Website Design & Development Proposal',
  'Webflow Development Proposal',
  'Copy, Branding, Website Design & Development Proposal',
  'Website Development Proposal (Client-First)',
  'Webflow Website Proposal',
  'Web Design, Copy, and SEO Proposal',
] as const;

export const ALLOWED_SERVICE_KEYS = [
  'webflow-dev',
  'website-design',
  'branding-design',
  'copy',
  'strategy-copy',
  'webflow-migration',
  'brochure-design',
  'full-webflow',
] as const;

export const ALLOWED_ABOUT_US_IDS = [
  'activeset',
  'standard',
  'modern',
  'corporate',
  'creative',
] as const;

export const ALLOWED_PRICING_NAMES = [
  'Strategy & Copy',
  'Branding',
  'Website Design',
  'Webflow Development',
] as const;

// -- Schemas ----------------------------------------------------------

export const proposalDraftSchema = z.object({
  title: z
    .string()
    .describe(
      `Proposal title. MUST match one of: ${ALLOWED_TITLES.map((t) => `'${t}'`).join(', ')}.`
    ),
  clientName: z.string().describe('The client company name.'),
  clientDescription: z
    .string()
    .describe(
      '2-3 professional sentences, third person. Grounded in the website context — industry, what they do, mission/value prop.'
    ),
  serviceKeys: z
    .array(z.string())
    .describe(
      `2-5 service keys. MUST come from: ${ALLOWED_SERVICE_KEYS.map((k) => `'${k}'`).join(', ')}. Always include 'website-design' and 'webflow-dev' for website builds.`
    ),
  aboutUsTemplateId: z
    .string()
    .describe(
      `One of: ${ALLOWED_ABOUT_US_IDS.map((k) => `'${k}'`).join(', ')}. activeset=default; modern=tech/SaaS; corporate=B2B/enterprise/finance/legal; creative=design/media/arts; standard=generic.`
    ),
  finalDeliverable: z
    .string()
    .describe(
      'A short paragraph describing what the client will receive. Mention platform (Webflow) and key benefits.'
    ),
  overview: z
    .string()
    .describe("2-3 paragraph project overview tying the client's goals to the scope."),
  pricingItems: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            `One of: ${ALLOWED_PRICING_NAMES.map((n) => `'${n}'`).join(', ')}.`
          ),
        description: z.string(),
        price: z.string().describe("Formatted currency, e.g. '$3,500' or '€2,000'."),
      })
    )
    .describe(
      '2-4 pricing items. If budget is provided, items MUST sum exactly to the budget.'
    ),
  pricingTotal: z.string(),
  timelinePhases: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        duration: z.string().describe("e.g. '2 weeks'"),
        startDate: z.string().describe('YYYY-MM-DD'),
        endDate: z.string().describe('YYYY-MM-DD'),
      })
    )
    .describe('3-5 phases. First startDate = today. Each phase follows the previous.'),
});

export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

export const blockTimelineSchema = z.object({
  timelinePhases: proposalDraftSchema.shape.timelinePhases,
});

export const blockPricingSchema = z.object({
  pricingItems: proposalDraftSchema.shape.pricingItems,
  pricingTotal: proposalDraftSchema.shape.pricingTotal,
});

export const blockClientDescriptionSchema = z.object({
  clientDescription: proposalDraftSchema.shape.clientDescription,
});

export const blockFinalDeliverableSchema = z.object({
  finalDeliverable: proposalDraftSchema.shape.finalDeliverable,
});

export type BlockType = 'timeline' | 'pricing' | 'clientDescription' | 'finalDeliverable';

// -- Normalizers ------------------------------------------------------

export function normalizeDraft(raw: ProposalDraft): ProposalDraft {
  const title = pickFromList(raw.title, ALLOWED_TITLES, ALLOWED_TITLES[0]);
  const aboutUsTemplateId = pickFromList(
    raw.aboutUsTemplateId,
    ALLOWED_ABOUT_US_IDS,
    'activeset'
  );

  let serviceKeys = (raw.serviceKeys || [])
    .map((k) => k?.trim().toLowerCase())
    .filter((k): k is string => !!k)
    .filter((k) => (ALLOWED_SERVICE_KEYS as readonly string[]).includes(k));
  serviceKeys = Array.from(new Set(serviceKeys));
  if (serviceKeys.length === 0) serviceKeys = ['website-design', 'webflow-dev'];
  if (serviceKeys.length > 5) serviceKeys = serviceKeys.slice(0, 5);

  const pricingItems = (raw.pricingItems || [])
    .map((item) => ({
      name: pickFromList(item.name, ALLOWED_PRICING_NAMES, 'Website Design'),
      description: item.description || '',
      price: item.price || '',
    }))
    .slice(0, 4);

  const timelinePhases = (raw.timelinePhases || []).slice(0, 5);

  return {
    ...raw,
    title,
    aboutUsTemplateId,
    serviceKeys,
    pricingItems,
    timelinePhases,
  };
}

function pickFromList<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  const trimmed = value.trim();
  const exact = allowed.find((a) => a === trimmed);
  if (exact) return exact;
  // Case-insensitive match.
  const ci = allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase());
  if (ci) return ci;
  return fallback;
}
