// Firebase Client SDK - works in both client and server contexts

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Project, ProjectLink, CreateProjectLinkInput, UpdateProjectLinkInput } from '@/types';
import { WebflowConfig } from '@/types/webflow';
import { DatabaseError, logError } from '@/lib/errors';
import { COLLECTIONS } from '@/lib/constants';

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;

const generateLinkId = (): string => `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
    title: 'Live Website URL',
    url: '',
    order: 1,
    isDefault: true,
  },
  {
    id: generateLinkId(),
    title: 'Feedback URL',
    url: '',
    order: 2,
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
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        updatedAt: doc.data().updatedAt.toDate(),
      })) as Project[];
    } catch (error) {
      logError(error, 'getAllProjects');
      throw new DatabaseError('Failed to fetch all projects');
    }
  },

  async getUserProjects(userId: string): Promise<Project[]> {
    try {
      // Temporarily remove orderBy to avoid index requirement
      const q = query(
        collection(db, PROJECTS_COLLECTION),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const projects = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        updatedAt: doc.data().updatedAt.toDate(),
      })) as Project[];

      // Sort in client-side for now
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
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as Project;
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

  // Update project sitemap URL
  async updateProjectSitemap(projectId: string, sitemapUrl: string): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      sitemapUrl,
      updatedAt: Timestamp.now(),
    });
  },

  // Delete a project
  async deleteProject(projectId: string): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await deleteDoc(projectRef);
  },

  // Update project links (for reordering and editing)
  async updateProjectLinks(projectId: string, links: ProjectLink[]): Promise<void> {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      links,
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

  // Delete a link
  async deleteLink(projectId: string, linkId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedLinks = project.links.filter(link => link.id !== linkId);
    await this.updateProjectLinks(projectId, updatedLinks);
  },

  // Real-time subscription to user projects
  subscribeToUserProjects(userId: string, callback: (projects: Project[]) => void): () => void {
    // Temporarily remove orderBy to avoid index requirement
    const q = query(
      collection(db, PROJECTS_COLLECTION),
      where('userId', '==', userId)
    );

    return onSnapshot(q, (snapshot) => {
      const projects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        updatedAt: doc.data().updatedAt.toDate(),
      })) as Project[];

      // Sort in client-side for now
      const sortedProjects = projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      callback(sortedProjects);
    });
  },

  // Real-time subscription to all projects (for project-links module - everyone can see all)
  subscribeToAllProjects(callback: (projects: Project[]) => void): () => void {
    const q = query(collection(db, PROJECTS_COLLECTION));

    return onSnapshot(q, (snapshot) => {
      const projects = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        } as Project;
      });

      // Sort in client-side
      const sortedProjects = projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      callback(sortedProjects);
    });
  },

  // Real-time subscription to a single project
  subscribeToProject(projectId: string, callback: (project: Project | null) => void): () => void {
    const docRef = doc(db, PROJECTS_COLLECTION, projectId);

    return onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const project: Project = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        } as Project;
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

  // Update page type rules for a project
  async updateProjectPageTypeRules(projectId: string, rules: import('@/types').PageTypeRule[]): Promise<void> {
    try {
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        pageTypeRules: rules,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'updateProjectPageTypeRules');
      throw new DatabaseError('Failed to update page type rules');
    }
  },
}; 