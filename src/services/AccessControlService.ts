import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ADMIN_EMAIL = 'rehan@activeset.co';

export interface AccessControl {
    admin: string;
    allowedEmails: string[];
}

class AccessControlService {
    private cachedAllowedEmails: string[] | null = null;
    private cacheTimestamp: number = 0;
    private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    async getAccessControl(): Promise<AccessControl> {
        try {
            const docRef = doc(db, 'access_control', 'allowed_users');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as AccessControl;
            }

            // Initialize with admin if doesn't exist
            const defaultAccess: AccessControl = {
                admin: ADMIN_EMAIL,
                allowedEmails: [ADMIN_EMAIL]
            };
            await this.saveAccessControl(defaultAccess);
            return defaultAccess;
        } catch (error) {
            console.error('Error fetching access control:', error);
            // Fallback to allow admin if Firestore fails
            return {
                admin: ADMIN_EMAIL,
                allowedEmails: [ADMIN_EMAIL]
            };
        }
    }

    async saveAccessControl(accessControl: AccessControl): Promise<void> {
        const docRef = doc(db, 'access_control', 'allowed_users');
        await setDoc(docRef, accessControl);
        // Clear cache
        this.cachedAllowedEmails = null;
    }

    async isEmailAllowed(email: string): Promise<boolean> {
        // Use cache if valid
        if (this.cachedAllowedEmails && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.cachedAllowedEmails.includes(email.toLowerCase());
        }

        const accessControl = await this.getAccessControl();
        this.cachedAllowedEmails = accessControl.allowedEmails.map(e => e.toLowerCase());
        this.cacheTimestamp = Date.now();

        return this.cachedAllowedEmails.includes(email.toLowerCase());
    }

    isAdmin(email: string): boolean {
        return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    }

    async addAllowedEmail(email: string): Promise<void> {
        const accessControl = await this.getAccessControl();
        const normalizedEmail = email.toLowerCase().trim();

        if (!accessControl.allowedEmails.includes(normalizedEmail)) {
            accessControl.allowedEmails.push(normalizedEmail);
            await this.saveAccessControl(accessControl);
        }
    }

    async removeAllowedEmail(email: string): Promise<void> {
        const accessControl = await this.getAccessControl();
        const normalizedEmail = email.toLowerCase().trim();

        // Can't remove admin
        if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
            throw new Error('Cannot remove admin from access list');
        }

        accessControl.allowedEmails = accessControl.allowedEmails.filter(
            e => e.toLowerCase() !== normalizedEmail
        );
        await this.saveAccessControl(accessControl);
    }
}

export const accessControlService = new AccessControlService();
