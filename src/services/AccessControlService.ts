import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ADMIN_EMAIL = 'rehan@activeset.co';

export interface ModuleAccess {
    admin: string;
    modules: Record<string, string[]>; // module name -> array of emails ("*" means public)
}

// Available modules that can be restricted
export const RESTRICTED_MODULES = ['proposal', 'project-links'] as const;
export type RestrictedModule = typeof RESTRICTED_MODULES[number];

class AccessControlService {
    private cachedAccess: ModuleAccess | null = null;
    private cacheTimestamp: number = 0;
    private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    async getModuleAccess(): Promise<ModuleAccess> {
        try {
            const docRef = doc(db, 'access_control', 'module_access');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as ModuleAccess;
            }

            // Initialize with admin having access to all restricted modules
            const defaultAccess: ModuleAccess = {
                admin: ADMIN_EMAIL,
                modules: {
                    proposal: [ADMIN_EMAIL],
                    'project-links': [ADMIN_EMAIL]
                }
            };
            await this.saveModuleAccess(defaultAccess);
            return defaultAccess;
        } catch (error) {
            console.error('Error fetching module access:', error);
            // Fallback to allow admin
            return {
                admin: ADMIN_EMAIL,
                modules: {
                    proposal: [ADMIN_EMAIL],
                    'project-links': [ADMIN_EMAIL]
                }
            };
        }
    }

    async saveModuleAccess(access: ModuleAccess): Promise<void> {
        const docRef = doc(db, 'access_control', 'module_access');
        await setDoc(docRef, access);
        // Clear cache
        this.cachedAccess = null;
    }

    async hasModuleAccess(email: string, module: RestrictedModule): Promise<boolean> {
        // Admin always has access
        if (this.isAdmin(email)) return true;

        // Use cache if valid
        if (this.cachedAccess && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.checkAccess(this.cachedAccess, email, module);
        }

        const access = await this.getModuleAccess();
        this.cachedAccess = access;
        this.cacheTimestamp = Date.now();

        return this.checkAccess(access, email, module);
    }

    private checkAccess(access: ModuleAccess, email: string, module: RestrictedModule): boolean {
        const moduleUsers = access.modules[module] || [];

        // "*" means public access
        if (moduleUsers.includes('*')) return true;

        // Check if email is in list
        return moduleUsers.some(e => e.toLowerCase() === email.toLowerCase());
    }

    isAdmin(email: string): boolean {
        return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    }

    async getModuleUsers(module: RestrictedModule): Promise<string[]> {
        const access = await this.getModuleAccess();
        return access.modules[module] || [];
    }

    async addModuleAccess(email: string, module: RestrictedModule): Promise<void> {
        const access = await this.getModuleAccess();
        const normalizedEmail = email.toLowerCase().trim();

        if (!access.modules[module]) {
            access.modules[module] = [];
        }

        if (!access.modules[module].includes(normalizedEmail)) {
            access.modules[module].push(normalizedEmail);
            await this.saveModuleAccess(access);
        }
    }

    async removeModuleAccess(email: string, module: RestrictedModule): Promise<void> {
        const access = await this.getModuleAccess();
        const normalizedEmail = email.toLowerCase().trim();

        // Can't remove admin
        if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
            throw new Error('Cannot remove admin from access list');
        }

        if (access.modules[module]) {
            access.modules[module] = access.modules[module].filter(
                e => e.toLowerCase() !== normalizedEmail
            );
            await this.saveModuleAccess(access);
        }
    }
}

export const accessControlService = new AccessControlService();
