import type { ServiceId, SOPTemplate } from '@/types';

/**
 * What ActiveSet sells, and how a project's checklist is put together from it.
 *
 * Rehan, 2026-10-01: "Our whole stuff is Copy, Brand Design, Web Design,
 * Development", sold as four engagements: Development only, Web Design only,
 * Web Design + Development, and Brand + Web + Development, with Copy as an
 * add-on to any of them. Each service has its SOP in the Checklist Creator,
 * tagged with the service, and a new project's checklist is the SOPs for the
 * services it bought, in working order. Which SOP delivers a service is data
 * (the tag), not code, so a better SOP replaces an old one without a deploy.
 *
 * Pure: the New project dialog, the Checklist Creator and the portal share it.
 */

/** In the order the work happens: the brand first, then the words, the design, the build. */
export const SERVICE_ORDER: readonly ServiceId[] = ['brand', 'copy', 'web_design', 'development'];

/** What each service is called, on the team's screens and as the client's stage heading. */
export const SERVICE_LABELS: Record<ServiceId, string> = {
  brand: 'Brand Design',
  copy: 'Copy',
  web_design: 'Web Design',
  development: 'Development',
};

/** Stage headings for the agency's own start and close, around every engagement. */
export const KICKOFF_STAGE = 'Kickoff';
export const LAUNCH_STAGE = 'Launch';
export const HANDOVER_STAGE = 'Handover';

export interface Engagement {
  id: string;
  label: string;
  /** One line on what the client gets. */
  hint: string;
  services: ServiceId[];
}

/** The four engagements. Copy is offered as an add-on to each, not as a fifth. */
export const ENGAGEMENTS: readonly Engagement[] = [
  { id: 'development', label: 'Development only', hint: 'Their designs, built in Webflow', services: ['development'] },
  { id: 'web_design', label: 'Web Design only', hint: 'Designs in Figma, handed over', services: ['web_design'] },
  {
    id: 'web_design_development',
    label: 'Web Design + Development',
    hint: 'Designed and built by us',
    services: ['web_design', 'development'],
  },
  {
    id: 'brand_web_development',
    label: 'Brand + Web + Development',
    hint: 'A new brand, then the site',
    services: ['brand', 'web_design', 'development'],
  },
];

export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && (SERVICE_ORDER as readonly string[]).includes(value);
}

/** Services in working order, once each; anything that is not one is dropped. */
export function orderServices(services: readonly unknown[] | null | undefined): ServiceId[] {
  const chosen = new Set((services ?? []).filter(isServiceId));
  return SERVICE_ORDER.filter((s) => chosen.has(s));
}

/** "Brand + Web Design + Development + Copy": the services, in working order. */
export function servicesName(services: readonly unknown[] | null | undefined): string {
  return orderServices(services)
    .map((s) => SERVICE_LABELS[s])
    .join(' + ');
}

/** The engagement these services are, Copy aside, if they are one of the four. */
export function engagementOf(services: readonly unknown[] | null | undefined): Engagement | undefined {
  const core: ServiceId[] = orderServices(services).filter((s) => s !== 'copy');
  return ENGAGEMENTS.find((e) => e.services.length === core.length && e.services.every((s) => core.includes(s)));
}

/** Every SOP tagged with each service, in the order given. */
export function templatesByService(templates: readonly SOPTemplate[]): Record<ServiceId, SOPTemplate[]> {
  const out: Record<ServiceId, SOPTemplate[]> = { brand: [], copy: [], web_design: [], development: [] };
  for (const template of templates) {
    if (isServiceId(template.service)) out[template.service].push(template);
  }
  return out;
}

export interface ServicePick {
  service: ServiceId;
  /** Absent when no SOP is tagged with the service yet. */
  template?: SOPTemplate;
  /** Every SOP tagged with it, for a choice when there is more than one. */
  options: SOPTemplate[];
}

/**
 * The SOP each bought service will use, in working order: the one the team
 * picked when there is a choice, else the first SOP tagged with the service.
 */
export function pickServiceTemplates(
  services: readonly unknown[] | null | undefined,
  templates: readonly SOPTemplate[],
  chosen: Partial<Record<ServiceId, string>> = {},
): ServicePick[] {
  const tagged = templatesByService(templates);
  return orderServices(services).map((service) => {
    const options = tagged[service];
    const template = options.find((t) => t.id === chosen[service]) ?? options[0];
    return template ? { service, template, options } : { service, options };
  });
}
