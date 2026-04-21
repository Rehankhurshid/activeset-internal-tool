import { z } from 'zod';

// Shared between the AI Gateway routes and the client parser.

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

export const proposalDraftSchema = z.object({
  title: z.enum(ALLOWED_TITLES).describe('Proposal title chosen from the allowed list.'),
  clientName: z.string().describe('The client company name — deduce from website/brief if not explicit.'),
  clientDescription: z
    .string()
    .describe(
      '2-3 professional sentences, third person. Must be grounded in the website context — industry, what they do, mission/value prop.'
    ),
  serviceKeys: z
    .array(z.enum(ALLOWED_SERVICE_KEYS))
    .min(2)
    .max(5)
    .describe(
      'Services to include. Always include website-design + webflow-dev for website builds. Add strategy-copy/copy if brief mentions strategy or copy. Add branding-design if brief mentions brand/logo. Use webflow-migration for existing-site migrations.'
    ),
  aboutUsTemplateId: z
    .enum(ALLOWED_ABOUT_US_IDS)
    .describe(
      'About-us template: activeset=default, modern=tech/SaaS, corporate=B2B/enterprise/finance/legal, creative=design/media/arts, standard=generic.'
    ),
  finalDeliverable: z
    .string()
    .describe(
      'A short paragraph describing what the client will receive. Mention the platform (Webflow) and key benefits.'
    ),
  overview: z
    .string()
    .describe('2-3 paragraph project overview tying the client’s goals to the scope of work.'),
  pricingItems: z
    .array(
      z.object({
        name: z.enum(ALLOWED_PRICING_NAMES),
        description: z.string().describe('One clear sentence about what this line item includes.'),
        price: z.string().describe("Formatted currency string, e.g. '$3,500' or '€2,000'."),
      })
    )
    .min(2)
    .max(4)
    .describe(
      'Pricing line items. If budget is provided, items MUST sum exactly to the budget; distribute proportionally (Strategy 15%, Brand 20%, Design 30%, Dev 35%) adjusting when a category is not included.'
    ),
  pricingTotal: z.string().describe('Sum of pricingItems prices, formatted with same currency.'),
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
    .min(3)
    .max(5)
    .describe(
      'Project phases in order. Each phase’s startDate equals the previous phase’s endDate. Last endDate must be on or before the deadline when one is provided.'
    ),
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
