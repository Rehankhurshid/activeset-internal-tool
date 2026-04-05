// Firebase Client SDK - works in both client and server contexts

import {
  collection,
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
import { db } from '@/lib/firebase';
import { Project, ProjectLink, ProjectStatus, ProjectTag, CreateProjectLinkInput, UpdateProjectLinkInput, AuditResult } from '@/types';
import { WebflowConfig } from '@/types/webflow';
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
      const projects = querySnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt.toDate(),
        updatedAt: d.data().updatedAt.toDate(),
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
      const projects = querySnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt.toDate(),
        updatedAt: d.data().updatedAt.toDate(),
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
      const project = {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as Project;
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

      await this.updateLink(projectId, linkId, {
        auditResult: ({
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
        } as unknown as ProjectLink['auditResult']),
      });
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
      const projects = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt.toDate(),
        updatedAt: d.data().updatedAt.toDate(),
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

    return onSnapshot(q, async (snapshot) => {
      const projects = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        } as Project;
      });

      // Merge audit results from subcollections
      await Promise.all(
        projects.map(async (project) => {
          project.links = await mergeAuditResults(project.id, project.links);
        })
      );

      const sortedProjects = projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      callback(sortedProjects);
    });
  },

  // Real-time subscription to a single project (merges audit data from subcollection)
  subscribeToProject(projectId: string, callback: (project: Project | null) => void): () => void {
    const docRef = doc(db, PROJECTS_COLLECTION, projectId);

    return onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const project: Project = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        } as Project;
        // Merge audit results from subcollection
        project.links = await mergeAuditResults(projectId, project.links);
        callback(project);
      } else {
        callback(null);
      }
    });
  },

  // Update Webflow configuration for a project
  async updateWebflowConfig(projectId: string, config: WebflowConfig): Promise<void> {
    try {
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        webflowConfig: config,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'updateWebflowConfig');
      throw new DatabaseError('Failed to update Webflow configuration');
    }
  },

  // Remove Webflow configuration from a project
  async removeWebflowConfig(projectId: string): Promise<void> {
    try {
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        webflowConfig: null,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'removeWebflowConfig');
      throw new DatabaseError('Failed to remove Webflow configuration');
    }
  },

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
