import { runWebflowAlt, type WebflowAltResult } from './webflow-alt';
import { runImageApply, type ImageApplyResult } from './image-apply';

/**
 * Everything the worker can safely do for a set of library images, in one go.
 *
 * Two halves, in this order and not the other. Alt text is **drafted** — it
 * lands in `alt_suggestions` for a person to read before it goes anywhere near
 * a client's site. Images are **applied** — resized to a measured width where
 * one exists, re-encoded perceptually losslessly, archived to Bunny, uploaded,
 * and every CMS field that used the old file repointed. The difference is not
 * inconsistency: a byte-identical-looking image with a backup is safe to swap
 * unread; a sentence an AI wrote about someone's photograph is not.
 *
 * Alt first because repointing changes the image's URL and drafts are keyed by
 * URL. `image_apply` carries drafts across to the new fingerprint, but only
 * for drafts that exist when it runs.
 *
 * The image half is allowed to fail without taking the alt half with it — a
 * missing Bunny configuration should not throw away ten minutes of drafting —
 * so the result says which half did what.
 */

export interface LibraryOptimisePayload {
  /** The images to work on, by URL. Required. */
  srcs: string[];
  /** Draft alt for images missing it (the default), or for all of them. */
  altScope?: 'missing' | 'all';
  /** Publish changed CMS items after repointing. Off by default. */
  publish?: boolean;
  by?: string;
}

export interface LibraryOptimiseResult {
  requested: number;
  alt: WebflowAltResult;
  images?: ImageApplyResult;
  /** Why the image half did not run, when it did not. */
  imagesError?: string;
}

export async function runLibraryOptimise(
  projectId: string,
  payload: LibraryOptimisePayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<LibraryOptimiseResult> {
  const srcs = [...new Set(payload.srcs ?? [])];

  const alt = await runWebflowAlt(
    projectId,
    { srcs, sources: ['assets', 'cms'], scope: payload.altScope ?? 'missing' },
    (message, fraction) => onProgress(`ALT · ${message}`, (fraction ?? 0) * 0.45),
  );

  let images: ImageApplyResult | undefined;
  let imagesError: string | undefined;
  try {
    images = await runImageApply(
      projectId,
      { srcs, publish: payload.publish, by: payload.by },
      (message, fraction) => onProgress(`Images · ${message}`, 0.45 + (fraction ?? 0) * 0.55),
    );
  } catch (error) {
    imagesError = error instanceof Error ? error.message : String(error);
  }

  return { requested: srcs.length, alt, images, imagesError };
}
