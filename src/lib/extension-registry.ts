import 'server-only';
import type { RestrictedModule } from '@/services/AccessControlService';

/**
 * Extensions the app can pair with, and the module each one requires.
 *
 * The id is pinned by the `key` field in the extension's manifest. Without that
 * an unpacked install gets a random id per machine, and neither install
 * detection nor pairing could address it.
 */
export interface RegisteredExtension {
  id: string;
  slug: string;
  name: string;
  module: RestrictedModule;
}

export const REGISTERED_EXTENSIONS: RegisteredExtension[] = [
  {
    id: 'lndfjmgghbhchfhffhniencmffdpmnfp',
    slug: 'refrens-skydo-bridge',
    name: 'Refrens → Skydo Invoice Bridge',
    module: 'invoices',
  },
];

export const getExtensionBySlug = (slug: string) =>
  REGISTERED_EXTENSIONS.find((e) => e.slug === slug) ?? null;
