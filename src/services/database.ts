// Firebase Client SDK - works in both client and server contexts

import {
  collection,
  deleteField,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { toSafeDate } from '@/lib/firestore-dates';
import {
  Project,
  ProjectLink,
  ProjectStatus,
  ProjectTag,
  CreateProjectLinkInput,
  UpdateProjectLinkInput,
  AuditResult,
  ImageScanJob,
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  ProjectRequest,
  RequestSource,
} from '@/types';
import { DatabaseError, logError } from '@/lib/errors';
import { COLLECTIONS } from '@/lib/constants';
import { compactAuditResult } from '@/lib/scan-utils';

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const LINK_AUDITS_SUBCOLLECTION = 'link_audits';

const generateLinkId = (): string => `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generatePublicShareToken = (): string => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

/**
 * Belt-and-braces: scrub any legacy apiToken that predates the server-side
 * secrets collection. Newly written docs never include it, but old projects
 * may still carry one on `webflowConfig.apiToken`. Always call this before
 * returning a project to the client.
 */
function sanitizeProjectData<T extends Record<string, unknown>>(data: T): T {
  const cfg = (data as { webflowConfig?: Record<string, unknown> }).webflowConfig;
  if (cfg && typeof cfg === 'object' && 'apiToken' in cfg) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiToken, ...rest } = cfg as { apiToken?: unknown };
    (data as { webflowConfig?: Record<string, unknown> }).webflowConfig = {
      ...rest,
      hasApiToken: Boolean(apiToken),
    };
  }
  return data;
}

/** Recursively strip undefined values from objects/arrays — Firestore rejects them. */
function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return obj;
}

// --- Audit Result Subcollection Helpers ---
// Audit results are stored in a subcollection projects/{id}/link_audits/{linkId}
// to avoid hitting Firestore's 1MB document size limit.

function linkAuditsCollection(projectId: string) {
  return collection(db, PROJECTS_COLLECTION, projectId, LINK_AUDITS_SUBCOLLECTION);
}

function linkAuditDoc(projectId: string, linkId: string) {
  return doc(db, PROJECTS_COLLECTION, projectId, LINK_AUDITS_SUBCOLLECTION, linkId);
}

/** Save audit results for multiple links to the subcollection. */
async function saveLinkAudits(projectId: string, links: ProjectLink[]): Promise<void> {
  const linksWithAudit = links.filter(l => l.auditResult);
  if (linksWithAudit.length === 0) return;

  // Batch writes (max 500 per batch)
  const BATCH_SIZE = 450;
  for (let i = 0; i < linksWithAudit.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = linksWithAudit.slice(i, i + BATCH_SIZE);

    for (const link of chunk) {
      const compacted = compactAuditResult(link.auditResult!, 'standard');
      batch.set(linkAuditDoc(projectId, link.id), stripUndefined(compacted));
    }

    await batch.commit();
  }
}

/** Load all audit results from subcollection and merge into links. */
async function mergeAuditResults(projectId: string, links: ProjectLink[]): Promise<ProjectLink[]> {
  if (!links || links.length === 0) return links;

  try {
    const snapshot = await getDocs(linkAuditsCollection(projectId));
    if (snapshot.empty) return links;

    const auditMap = new Map<string, AuditResult>();
    snapshot.docs.forEach(d => {
      auditMap.set(d.id, d.data() as AuditResult);
    });

    return links.map(link => {
      const subcollectionAudit = auditMap.get(link.id);
      if (subcollectionAudit) {
        return { ...link, auditResult: subcollectionAudit };
      }
      // Keep inline auditResult if subcollection doesn't have it yet (backward compat)
      return link;
    });
  } catch (error) {
    console.error(`[projectsService] Failed to load link audits for ${projectId}:`, error);
    return links; // Fall back to inline data
  }
}

/** Strip auditResult from links before saving to project document. */
function stripAuditResultsFromLinks(links: ProjectLink[]): ProjectLink[] {
  return links.map(link => {
    if (!link.auditResult) return link;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { auditResult, ...rest } = link;
    return rest;
  });
}

// Create default links for new projects (ensure each link has a unique id)
const getDefaultLinks = (): ProjectLink[] => [
  {
    id: generateLinkId(),
    title: 'Project Tracker',
    url: '',
    order: 0,
    isDefault: true,
  },
  {
    id: generateLinkId(),
    title: 'Staging Website URL',
    url: '',
    order: 1,
    isDefault: true,
  },
  {
    id: generateLinkId(),
    title: 'Live Website URL',
    url: '',
    order: 2,
    isDefault: true,
  },
  {
    id: generateLinkId(),
    title: 'Feedback URL',
    url: '',
    order: 3,
    isDefault: true,
  },
];

export const projectsService = {
  // Create a new project
  async createProject(userId: string, name: string): Promise<string> {
    try {
      const projectRef = await addDoc(collection(db, PROJECTS_COLLECTION), {
        name,
        userId,
        status: 'current' as ProjectStatus,
        tags: [] as ProjectTag[],
        links: getDefaultLinks(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return projectRef.id;
    } catch (error) {
      logError(error, 'createProject');
      throw new DatabaseError('Failed to create project');
    }
  },

  // Get all projects for a user
  // Get all projects (admin/cron use)
  async getAllProjects(): Promise<Project[]> {
    try {
      const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
      const projects = querySnapshot.docs.map(d => sanitizeProjectData({
        id: d.id,
        ...d.data(),
        createdAt: toSafeDate(d.data().createdAt),
        updatedAt: toSafeDate(d.data().updatedAt),
      })) as Project[];

      // Merge audit results from subcollections
      await Promise.all(
        projects.map(async (project) => {
          project.links = await mergeAuditResults(project.id, project.links);
        })
      );

      return projects;
    } catch (error) {
      logError(error, 'getAllProjects');
      throw new DatabaseError('Failed to fetch all projects');
    }
  },

  async getUserProjects(userId: string): Promise<Project[]> {
    try {
      const q = query(
        collection(db, PROJECTS_COLLECTION),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const projects = querySnapshot.docs.map(d => sanitizeProjectData({
        id: d.id,
        ...d.data(),
        createdAt: toSafeDate(d.data().createdAt),
        updatedAt: toSafeDate(d.data().updatedAt),
      })) as Project[];

      // Merge audit results from subcollections
      await Promise.all(
        projects.map(async (project) => {
          project.links = await mergeAuditResults(project.id, project.links);
        })
      );

      return projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      logError(error, 'getUserProjects');
      throw new DatabaseError('Failed to fetch projects');
    }
  },

  // Get a single project
  async getProject(projectId: string): Promise<Project | null> {
    const docRef = doc(db, PROJECTS_COLLECTION, projectId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const project = sanitizeProjectData({
        id: docSnap.id,
        ...data,
        createdAt: toSafeDate(data.createdAt),
        updatedAt: toSafeDate(data.updatedAt),
      }) as Project;
      // Merge audit results from subcollection
      project.links = await mergeAuditResults(projectId, project.links);
      return project;
    }
    return null;
  },

  // Update project name
  async updateProjectName(projectId: string, name: string): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      name,
      updatedAt: Timestamp.now(),
    });
  },

  // Update the project's client (group label). Empty string clears it.
  async updateProjectClient(projectId: string, client: string): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    const trimmed = client.trim();
    await updateDoc(projectRef, {
      client: trimmed.length > 0 ? trimmed : deleteField(),
      updatedAt: Timestamp.now(),
    });
  },

  // Link/unlink a proposal to drive "Import from proposal" on the Invoices
  // tab. Pass null/empty to clear the link.
  async updateProjectProposalId(projectId: string, proposalId: string | null): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    const trimmed = (proposalId ?? '').trim();
    await updateDoc(projectRef, {
      proposalId: trimmed.length > 0 ? trimmed : deleteField(),
      updatedAt: Timestamp.now(),
    });
  },

  // Update project status (current / past)
  async updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      status,
      updatedAt: Timestamp.now(),
    });
  },

  // Update project tags
  async updateProjectTags(projectId: string, tags: ProjectTag[]): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      tags,
      updatedAt: Timestamp.now(),
    });
  },

  // Update embedded-widget display flags
  async updateProjectWidgetFlags(
    projectId: string,
    flags: { disableAuditBadge?: boolean; disableDropdown?: boolean }
  ): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      ...flags,
      updatedAt: Timestamp.now(),
    });
  },

  // Set or clear the project's custom logo (URL or compressed data URL)
  async updateProjectLogo(projectId: string, logoUrl: string | null): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      logoUrl: logoUrl ? logoUrl : deleteField(),
      updatedAt: Timestamp.now(),
    });
  },

  // Update project sitemap URL
  async updateProjectSitemap(projectId: string, sitemapUrl: string): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      sitemapUrl,
      updatedAt: Timestamp.now(),
    });
  },

  // Update project locale data (extracted from sitemap hreflang)
  async updateProjectLocaleData(
    projectId: string,
    localeData: {
      detectedLocales: string[];
      pathToLocaleMap: Record<string, string>;
    }
  ): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      detectedLocales: localeData.detectedLocales,
      pathToLocaleMap: localeData.pathToLocaleMap,
      updatedAt: Timestamp.now(),
    });
  },

  // Delete a project
  async deleteProject(projectId: string): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await deleteDoc(projectRef);
  },

  // Image-scan job lifecycle — persisted on the project doc so bulk-scan
  // progress survives refreshes and is visible to every subscribed tab.
  async setImageScanJob(projectId: string, job: ImageScanJob | null): Promise<void> {
    try {
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        imageScanJob: job === null ? deleteField() : job,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'setImageScanJob');
      throw new DatabaseError('Failed to update image scan job');
    }
  },

  // Update project links — audit results go to subcollection, link metadata to project doc
  async updateProjectLinks(projectId: string, links: ProjectLink[]): Promise<void> {
    // Save audit results to subcollection (non-blocking — don't fail the whole save if this errors)
    try {
      await saveLinkAudits(projectId, links);
    } catch (error) {
      console.error(`[projectsService] Failed to save audit subcollection for ${projectId}, falling back to inline:`, error);
      // Fall back to saving with inline audit results (old behavior)
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        links: stripUndefined(links),
        updatedAt: Timestamp.now(),
      });
      return;
    }

    // Strip audit results from project document to stay under 1MB
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    const strippedLinks = stripAuditResultsFromLinks(links);
    await updateDoc(projectRef, {
      links: stripUndefined(strippedLinks),
      updatedAt: Timestamp.now(),
    });
  },

  // Add a new link to a project
  async addLinkToProject(projectId: string, link: CreateProjectLinkInput): Promise<void> {
    try {
      const project = await this.getProject(projectId);
      if (!project) throw new DatabaseError('Project not found');

      const newLink: ProjectLink = {
        ...link,
        id: generateLinkId(),
      };

      const updatedLinks = [...project.links, newLink];
      await this.updateProjectLinks(projectId, updatedLinks);
    } catch (error) {
      logError(error, 'addLinkToProject');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to add link');
    }
  },

  // Update a specific link
  async updateLink(projectId: string, linkId: string, updates: UpdateProjectLinkInput): Promise<void> {
    try {
      const project = await this.getProject(projectId);
      if (!project) throw new DatabaseError('Project not found');

      const updatedLinks = project.links.map(link =>
        link.id === linkId ? { ...link, ...updates } : link
      );
      await this.updateProjectLinks(projectId, updatedLinks);
    } catch (error) {
      logError(error, 'updateLink');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update link');
    }
  },

  // Persist broken-link check results into the link's auditResult
  async saveBrokenLinkResults(
    projectId: string,
    linkId: string,
    results: {
      totalChecked: number;
      totalLinks: number;
      brokenLinks: { href: string; status: number; text: string; error?: string }[];
      validLinks: number;
    }
  ): Promise<void> {
    try {
      const project = await this.getProject(projectId);
      if (!project) throw new DatabaseError('Project not found');

      const link = project.links.find(l => l.id === linkId);
      if (!link) throw new DatabaseError('Link not found');

      const currentAudit = link.auditResult || {} as Record<string, unknown>;
      const currentCategories = (currentAudit as { categories?: Record<string, unknown> }).categories || {};
      const currentLinks = currentCategories.links || {};

      await this.updateLink(projectId, linkId, {
        auditResult: {
          ...currentAudit,
          categories: {
            ...currentCategories,
            links: {
              ...currentLinks,
              totalLinks: results.totalLinks,
              internalLinks: (currentLinks as { internalLinks?: number }).internalLinks || 0,
              externalLinks: (currentLinks as { externalLinks?: number }).externalLinks || 0,
              brokenLinks: results.brokenLinks,
              checkedAt: new Date().toISOString(),
              status: results.brokenLinks.length > 0 ? 'failed' : 'passed',
              score: results.brokenLinks.length === 0 ? 100 : Math.max(0, 100 - (results.brokenLinks.length * 20)),
            },
          },
        } as ProjectLink['auditResult'],
      });
    } catch (error) {
      logError(error, 'saveBrokenLinkResults');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to save broken link results');
    }
  },

  // Persist image ALT scan results into the link's auditResult
  async saveImageAltResults(
    projectId: string,
    linkId: string,
    results: {
      totalImages: number;
      uniqueMissingAltCount: number;
      images: { src: string; alt?: string; inMainContent?: boolean }[];
      checkedAt: string;
    }
  ): Promise<void> {
    try {
      const project = await this.getProject(projectId);
      if (!project) throw new DatabaseError('Project not found');

      const link = project.links.find(l => l.id === linkId);
      if (!link) throw new DatabaseError('Link not found');

      const currentAudit = link.auditResult || {} as Record<string, unknown>;
      const currentCategories = (currentAudit as { categories?: Record<string, unknown> }).categories || {};
      const currentSeo = (currentCategories as { seo?: Record<string, unknown> }).seo || {};
      const currentSnapshot = (currentAudit as { contentSnapshot?: Record<string, unknown> }).contentSnapshot || {};

      const nextAuditResult = ({
        ...currentAudit,
        lastRun: results.checkedAt,
        categories: {
          ...currentCategories,
          seo: {
            ...currentSeo,
            imagesWithoutAlt: results.uniqueMissingAltCount,
            imageScanCheckedAt: results.checkedAt,
          },
        },
        contentSnapshot: {
          ...currentSnapshot,
          images: results.images,
        },
      } as unknown as ProjectLink['auditResult']);

      // Write directly via updateProjectLinks to avoid a second getProject round-trip
      // that would happen if we went through updateLink().
      const updatedLinks = project.links.map((l) =>
        l.id === linkId ? { ...l, auditResult: nextAuditResult } : l
      );
      await this.updateProjectLinks(projectId, updatedLinks);
    } catch (error) {
      logError(error, 'saveImageAltResults');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to save image ALT results');
    }
  },

  // Delete a link
  async deleteLink(projectId: string, linkId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedLinks = project.links.filter(link => link.id !== linkId);
    await this.updateProjectLinks(projectId, updatedLinks);
  },

  // Real-time subscription to user projects
  subscribeToUserProjects(userId: string, callback: (projects: Project[]) => void): () => void {
    const q = query(
      collection(db, PROJECTS_COLLECTION),
      where('userId', '==', userId)
    );

    return onSnapshot(q, async (snapshot) => {
      const projects = snapshot.docs.map(d => sanitizeProjectData({
        id: d.id,
        ...d.data(),
        createdAt: toSafeDate(d.data().createdAt),
        updatedAt: toSafeDate(d.data().updatedAt),
      })) as Project[];

      await Promise.all(
        projects.map(async (project) => {
          project.links = await mergeAuditResults(project.id, project.links);
        })
      );

      const sortedProjects = projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      callback(sortedProjects);
    });
  },

  // Real-time subscription to all projects (merges audit data from subcollections)
  subscribeToAllProjects(callback: (projects: Project[]) => void): () => void {
    const q = query(collection(db, PROJECTS_COLLECTION));

    return onSnapshot(
      q,
      async (snapshot) => {
        const projects = snapshot.docs.map(d => {
          const data = d.data();
          return sanitizeProjectData({
            id: d.id,
            ...data,
            createdAt: toSafeDate(data.createdAt),
            updatedAt: toSafeDate(data.updatedAt),
          }) as Project;
        });

        // Merge audit results from subcollections
        await Promise.all(
          projects.map(async (project) => {
            project.links = await mergeAuditResults(project.id, project.links);
          })
        );

        const sortedProjects = projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        callback(sortedProjects);
      },
      (error) => {
        console.error('subscribeToAllProjects failed', error);
        callback([]);
      }
    );
  },

  // Real-time subscription to a single project (merges audit data from subcollection)
  subscribeToProject(projectId: string, callback: (project: Project | null) => void): () => void {
    const docRef = doc(db, PROJECTS_COLLECTION, projectId);

    return onSnapshot(
      docRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const project: Project = sanitizeProjectData({
            id: docSnap.id,
            ...data,
            createdAt: toSafeDate(data.createdAt),
            updatedAt: toSafeDate(data.updatedAt),
          }) as Project;
          // Merge audit results from subcollection
          project.links = await mergeAuditResults(projectId, project.links);
          callback(project);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('subscribeToProject failed', error);
        callback(null);
      }
    );
  },

  // NOTE: Webflow config writes are intentionally NOT exposed here. The token
  // must never land on the client-readable project document. Use the
  // authenticated `/api/webflow/config` route (see webflowConfigRepository),
  // which stores the token in the server-only `project_secrets` collection
  // and writes only non-secret metadata back onto the project doc.

  // Update folder page types for a project
  async updateProjectFolderPageTypes(projectId: string, folderPageTypes: import('@/types').FolderPageTypes): Promise<void> {
    try {
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        folderPageTypes,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'updateProjectFolderPageTypes');
      throw new DatabaseError('Failed to update folder page types');
    }
  },

  async createAuditShareLink(projectId: string, options?: { regenerate?: boolean }): Promise<string> {
    try {
      const project = await this.getProject(projectId);
      if (!project) throw new DatabaseError('Project not found');

      const existingToken = project.publicAuditShareToken;
      const shouldRegenerate = !!options?.regenerate || !existingToken;
      const token = shouldRegenerate ? generatePublicShareToken() : existingToken;

      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        publicAuditShareToken: token,
        publicAuditShareEnabled: true,
        publicAuditShareUpdatedAt: new Date().toISOString(),
        updatedAt: Timestamp.now(),
      });

      const sharePath = `/share/project-links/${token}`;
      return typeof window === 'undefined' ? sharePath : `${window.location.origin}${sharePath}`;
    } catch (error) {
      logError(error, 'createAuditShareLink');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create public audit share link');
    }
  },

  async disableAuditShareLink(projectId: string): Promise<void> {
    try {
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        publicAuditShareEnabled: false,
        publicAuditShareUpdatedAt: new Date().toISOString(),
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'disableAuditShareLink');
      throw new DatabaseError('Failed to disable public audit share link');
    }
  },
};

// ============================================================================
// TASKS & REQUESTS
// ============================================================================

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const REQUESTS_COLLECTION = COLLECTIONS.REQUESTS;

/** Convert Firestore doc data to Task with proper Date types. */
function taskFromDoc(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    projectId: data.projectId as string,
    requestId: data.requestId as string | undefined,
    title: data.title as string,
    description: data.description as string | undefined,
    category: data.category as Task['category'],
    status: data.status as Task['status'],
    priority: data.priority as Task['priority'],
    dueDate: data.dueDate as string | undefined,
    tags: (data.tags as string[] | undefined) ?? [],
    source: (data.source as Task['source']) ?? 'manual',
    sourceLink: data.sourceLink as string | undefined,
    assignee: data.assignee as string | undefined,
    order: (data.order as number | undefined) ?? 0,
    clickupTaskId: data.clickupTaskId as string | undefined,
    clickupUrl: data.clickupUrl as string | undefined,
    clickupSyncedAt: data.clickupSyncedAt ? toSafeDate(data.clickupSyncedAt) : undefined,
    clickupSyncError: data.clickupSyncError as string | undefined,
    clickupSyncFailedAt: data.clickupSyncFailedAt ? toSafeDate(data.clickupSyncFailedAt) : undefined,
    createdAt: data.createdAt ? toSafeDate(data.createdAt) : new Date(),
    updatedAt: data.updatedAt ? toSafeDate(data.updatedAt) : new Date(),
    completedAt: data.completedAt ? toSafeDate(data.completedAt) : undefined,
    createdBy: data.createdBy as string,
  };
}

function requestFromDoc(id: string, data: Record<string, unknown>): ProjectRequest {
  return {
    id,
    projectId: data.projectId as string,
    rawText: data.rawText as string,
    source: data.source as ProjectRequest['source'],
    sender: data.sender as string | undefined,
    receivedAt: data.receivedAt ? toSafeDate(data.receivedAt) : new Date(),
    parsedAt: data.parsedAt ? toSafeDate(data.parsedAt) : undefined,
    status: data.status as ProjectRequest['status'],
    taskIds: (data.taskIds as string[] | undefined) ?? [],
    createdBy: data.createdBy as string,
  };
}

/**
 * Fire-and-forget push of newly-created local tasks to the project's bound
 * ClickUp list. Runs only in the browser (where the user's Firebase ID token
 * is available). The server route is a no-op when the project has no
 * `clickupListId`, so we don't need to pre-check from here.
 *
 * Failures don't surface to the caller — the API route stamps
 * `clickupSyncError` / `clickupSyncFailedAt` on the task doc, and the UI can
 * subscribe to that for a retry affordance.
 */
function pushNewTasksToClickUp(projectId: string, taskIds: string[]): void {
  if (typeof window === 'undefined') return;
  if (!projectId || taskIds.length === 0) return;
  const user = auth?.currentUser;
  if (!user) return;
  void user
    .getIdToken()
    .then((idToken) =>
      fetch('/api/clickup/sync-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-project-id': projectId,
        },
        body: JSON.stringify({ projectId, taskIds }),
      }),
    )
    .catch((err) => {
      console.error('[tasksService] ClickUp sync-create failed', err);
    });
}

/** Subset of UpdateTaskInput that flows app → ClickUp via /api/clickup/sync-update. */
const CLICKUP_PUSHABLE_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'assignee',
] as const;

type ClickUpPushableField = (typeof CLICKUP_PUSHABLE_FIELDS)[number];

/**
 * Fire-and-forget push of an app-side update to the linked ClickUp task.
 * Forwards only the fields ClickUp can accept; the route handles mapping
 * (priority enum, due-date epoch, status name lookup, assignee id diff).
 */
function pushUpdateToClickUp(
  projectId: string,
  taskId: string,
  patch: Partial<Pick<UpdateTaskInput, ClickUpPushableField>>,
): void {
  if (typeof window === 'undefined') return;
  if (!projectId || !taskId) return;
  if (Object.keys(patch).length === 0) return;
  const user = auth?.currentUser;
  if (!user) return;
  void user
    .getIdToken()
    .then((idToken) =>
      fetch('/api/clickup/sync-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-project-id': projectId,
        },
        body: JSON.stringify({ projectId, taskId, patch }),
      }),
    )
    .catch((err) => {
      console.error('[tasksService] ClickUp sync-update failed', err);
    });
}

export const tasksService = {
  /** Create a single task. Returns the new task id. */
  async createTask(input: CreateTaskInput): Promise<string> {
    try {
      const now = Timestamp.now();
      const payload = stripUndefined({
        ...input,
        order: input.order ?? Date.now(),
        createdAt: now,
        updatedAt: now,
      });
      const ref = await addDoc(collection(db, TASKS_COLLECTION), payload as Record<string, unknown>);
      pushNewTasksToClickUp(input.projectId, [ref.id]);
      return ref.id;
    } catch (error) {
      logError(error, 'createTask');
      throw new DatabaseError('Failed to create task');
    }
  },

  /**
   * Create multiple tasks atomically (e.g. AI-parsed suggestions accepted in
   * the New Request dialog). Returns the new task ids in the order provided.
   */
  async createTasksBatch(inputs: CreateTaskInput[]): Promise<string[]> {
    if (inputs.length === 0) return [];
    try {
      const batch = writeBatch(db);
      const ids: string[] = [];
      const now = Timestamp.now();
      const baseOrder = Date.now();
      inputs.forEach((input, idx) => {
        const ref = doc(collection(db, TASKS_COLLECTION));
        ids.push(ref.id);
        const payload = stripUndefined({
          ...input,
          order: input.order ?? baseOrder + idx,
          createdAt: now,
          updatedAt: now,
        });
        batch.set(ref, payload as Record<string, unknown>);
      });
      await batch.commit();
      // All inputs in a batch share a project (current callers always do); group
      // by projectId defensively in case that ever changes.
      const byProject = new Map<string, string[]>();
      inputs.forEach((input, idx) => {
        const list = byProject.get(input.projectId) ?? [];
        list.push(ids[idx]);
        byProject.set(input.projectId, list);
      });
      byProject.forEach((batchIds, projectId) => pushNewTasksToClickUp(projectId, batchIds));
      return ids;
    } catch (error) {
      logError(error, 'createTasksBatch');
      throw new DatabaseError('Failed to create tasks');
    }
  },

  /** Update a task. `completedAt` is auto-set/cleared when status flips to/from done. */
  async updateTask(taskId: string, updates: UpdateTaskInput): Promise<void> {
    try {
      const ref = doc(db, TASKS_COLLECTION, taskId);

      // Distinguish "key absent" from "key present with value undefined" — the
      // latter is the UI's way of clearing a field (e.g. "Unassigned"). The
      // generic stripUndefined would drop those keys, so the clear would be a
      // no-op. Convert explicit-undefined to deleteField() for clearable fields.
      const cleaned = stripUndefined(updates) as Record<string, unknown>;
      if ('assignee' in updates && updates.assignee === undefined) {
        cleaned.assignee = deleteField();
      }
      if ('dueDate' in updates && updates.dueDate === undefined) {
        cleaned.dueDate = deleteField();
      }

      // Build the ClickUp patch (subset of CLICKUP_PUSHABLE_FIELDS that the
      // user touched). Use "key in updates" so we capture explicit-undefined
      // (i.e. "clear this field").
      const clickupPatch: Partial<Pick<UpdateTaskInput, ClickUpPushableField>> = {};
      for (const field of CLICKUP_PUSHABLE_FIELDS) {
        if (field in updates) {
          (clickupPatch as Record<string, unknown>)[field] = (updates as Record<string, unknown>)[field];
        }
      }
      const wantsClickUpPush = Object.keys(clickupPatch).length > 0;

      // Auto-stamp completedAt when status flips to done; clear when leaving done.
      const completedAtUpdate =
        updates.status === 'done'
          ? { completedAt: Timestamp.now() }
          : updates.status
            ? { completedAt: deleteField() }
            : {};
      await updateDoc(ref, {
        ...cleaned,
        ...completedAtUpdate,
        updatedAt: Timestamp.now(),
      });

      // If any pushable field changed AND the task is linked to ClickUp,
      // forward the change. Re-read the doc to grab projectId + clickupTaskId
      // (small cost, only on relevant edits).
      if (wantsClickUpPush && typeof window !== 'undefined') {
        void getDoc(ref)
          .then((s) => {
            const d = s.data() as { projectId?: string; clickupTaskId?: string } | undefined;
            if (d?.projectId && d?.clickupTaskId) {
              pushUpdateToClickUp(d.projectId, taskId, clickupPatch);
            }
          })
          .catch((err) => {
            console.error('[tasksService] failed to re-read task for sync-update', err);
          });
      }
    } catch (error) {
      logError(error, 'updateTask');
      throw new DatabaseError('Failed to update task');
    }
  },

  async deleteTask(taskId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, TASKS_COLLECTION, taskId));
    } catch (error) {
      logError(error, 'deleteTask');
      throw new DatabaseError('Failed to delete task');
    }
  },

  /** Real-time subscription to all tasks for a project. */
  subscribeToProjectTasks(
    projectId: string,
    callback: (tasks: Task[]) => void,
  ): () => void {
    const q = query(
      collection(db, TASKS_COLLECTION),
      where('projectId', '==', projectId),
    );
    return onSnapshot(
      q,
      (snap) => {
        const tasks = snap.docs.map((d) => taskFromDoc(d.id, d.data()));
        // Sort: incomplete first, then by status order, then by `order` field
        const statusOrder: Record<Task['status'], number> = {
          in_progress: 0,
          in_review: 1,
          todo: 2,
          backlog: 3,
          blocked: 4,
          done: 5,
        };
        tasks.sort((a, b) => {
          const sa = statusOrder[a.status] ?? 99;
          const sb = statusOrder[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          return (a.order ?? 0) - (b.order ?? 0);
        });
        callback(tasks);
      },
      (error) => {
        console.error('subscribeToProjectTasks failed', error);
        callback([]);
      },
    );
  },
};

export const requestsService = {
  /** Create a Request blob (no parsing yet). Returns the new id. */
  async createRequest(input: {
    projectId: string;
    rawText: string;
    source: RequestSource;
    sender?: string;
    createdBy: string;
  }): Promise<string> {
    try {
      const now = Timestamp.now();
      const payload = stripUndefined({
        ...input,
        receivedAt: now,
        status: 'new' as const,
        taskIds: [],
      });
      const ref = await addDoc(collection(db, REQUESTS_COLLECTION), payload as Record<string, unknown>);
      return ref.id;
    } catch (error) {
      logError(error, 'createRequest');
      throw new DatabaseError('Failed to create request');
    }
  },

  /** Mark a request as parsed and link the generated task ids back. */
  async markRequestParsed(requestId: string, taskIds: string[]): Promise<void> {
    try {
      const ref = doc(db, REQUESTS_COLLECTION, requestId);
      await updateDoc(ref, {
        status: 'parsed' as const,
        parsedAt: Timestamp.now(),
        taskIds,
      });
    } catch (error) {
      logError(error, 'markRequestParsed');
      throw new DatabaseError('Failed to mark request parsed');
    }
  },

  subscribeToProjectRequests(
    projectId: string,
    callback: (requests: ProjectRequest[]) => void,
  ): () => void {
    const q = query(
      collection(db, REQUESTS_COLLECTION),
      where('projectId', '==', projectId),
    );
    return onSnapshot(
      q,
      (snap) => {
        const requests = snap.docs.map((d) => requestFromDoc(d.id, d.data()));
        requests.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
        callback(requests);
      },
      (error) => {
        console.error('subscribeToProjectRequests failed', error);
        callback([]);
      },
    );
  },
};
