import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    getDocs,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';

// Types
interface WebflowSession {
    email: string;
    userName: string;
    projectPath: string;
    lastActive: Timestamp;
    claimedAt: Timestamp;
}

interface SessionRequest {
    email: string;
    userName: string;
    projectPath?: string;
    action: 'claim' | 'heartbeat' | 'release';
    reason?: 'manual' | 'kicked' | 'ownership_lost';
}

interface SessionOwner {
    userName: string;
    projectPath: string;
}

interface AccountHistory {
    email: string;
    lastUsedBy: string;
    lastProjectPath: string;
    lastLogoutReason: string;
    lastLoggedOutAt: Timestamp;
}

const COLLECTION_NAME = 'webflow_sessions';
const HISTORY_COLLECTION_NAME = 'webflow_account_history';
// Stale threshold: 30 minutes (session persists when tab is closed)
// Only released on explicit logout or claimed by another user
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Clean up stale sessions (no heartbeat for >2 minutes)
 */
async function cleanupStaleSessions(): Promise<void> {
    const sessionsRef = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(sessionsRef);
    const now = Date.now();

    const deletePromises: Promise<void>[] = [];

    snapshot.forEach((docSnap) => {
        const data = docSnap.data() as WebflowSession;
        const lastActiveMs = data.lastActive?.toMillis() || 0;

        if (now - lastActiveMs > STALE_THRESHOLD_MS) {
            deletePromises.push(deleteDoc(doc(db, COLLECTION_NAME, docSnap.id)));
        }
    });

    await Promise.all(deletePromises);
}

/**
 * Get all active sessions
 */
async function getAllSessions(): Promise<WebflowSession[]> {
    const sessionsRef = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(sessionsRef);

    return snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as WebflowSession),
        email: docSnap.id,
    }));
}

async function getAccountHistoryMap(): Promise<Record<string, AccountHistory>> {
    const historyRef = collection(db, HISTORY_COLLECTION_NAME);
    const snapshot = await getDocs(historyRef);

    return snapshot.docs.reduce<Record<string, AccountHistory>>((accumulator, docSnap) => {
        accumulator[docSnap.id] = {
            ...(docSnap.data() as AccountHistory),
            email: docSnap.id,
        };
        return accumulator;
    }, {});
}

async function writeAccountHistory(
    email: string,
    userName: string,
    projectPath: string,
    reason: string
): Promise<void> {
    const historyRef = doc(db, HISTORY_COLLECTION_NAME, email);
    await setDoc(historyRef, {
        lastUsedBy: userName,
        lastProjectPath: projectPath || 'dashboard',
        lastLogoutReason: reason,
        lastLoggedOutAt: serverTimestamp(),
    }, { merge: true });
}

function getSessionOwner(session: WebflowSession | undefined): SessionOwner | null {
    if (!session?.userName) {
        return null;
    }

    return {
        userName: session.userName,
        projectPath: session.projectPath || 'dashboard',
    };
}

export async function POST(request: NextRequest) {
    try {
        const body: SessionRequest = await request.json();
        const { email, userName, projectPath = '', action, reason = 'manual' } = body;

        if (!email || !userName) {
            return NextResponse.json(
                { success: false, error: 'email and userName are required' },
                { status: 400 }
            );
        }

        // Clean up stale sessions on each request
        await cleanupStaleSessions();

        const sessionRef = doc(db, COLLECTION_NAME, email);
        let ownershipLost = false;
        let currentOwner: SessionOwner | null = null;
        let released = false;

        switch (action) {
            case 'claim':
                // Upsert: Replace any existing session for this email
                await setDoc(sessionRef, {
                    userName,
                    projectPath,
                    lastActive: serverTimestamp(),
                    claimedAt: serverTimestamp(),
                });
                break;

            case 'heartbeat':
                // Only update if this user owns the session (check first)
                // This prevents other user's heartbeats from overriding a claim
                const currentSession = await getDoc(sessionRef);
                const currentSessionData = currentSession.data() as WebflowSession | undefined;

                if (!currentSession.exists() || currentSessionData?.userName === userName) {
                    // Update lastActive and project path
                    await setDoc(
                        sessionRef,
                        {
                            userName,
                            projectPath,
                            lastActive: serverTimestamp(),
                        },
                        { merge: true }
                    );
                } else {
                    ownershipLost = true;
                    currentOwner = getSessionOwner(currentSessionData);
                    console.log(`Heartbeat rejected: ${userName} != ${currentSessionData?.userName}`);
                }
                break;

            case 'release': {
                const currentSession = await getDoc(sessionRef);
                const currentSessionData = currentSession.data() as WebflowSession | undefined;

                if (!currentSession.exists()) {
                    released = true;
                    break;
                }

                if (currentSessionData?.userName === userName) {
                    await writeAccountHistory(
                        email,
                        userName,
                        currentSessionData?.projectPath || projectPath || 'dashboard',
                        reason
                    );
                    await deleteDoc(sessionRef);
                    released = true;
                } else {
                    ownershipLost = true;
                    currentOwner = getSessionOwner(currentSessionData);
                    console.log(`Release rejected: ${userName} != ${currentSessionData?.userName}`);
                }
                break;
            }

            default:
                return NextResponse.json(
                    { success: false, error: 'Invalid action' },
                    { status: 400 }
                );
        }

        // Return all active sessions for popup display
        const sessions = await getAllSessions();
        const accountHistory = await getAccountHistoryMap();

        return NextResponse.json({
            success: true,
            sessions,
            accountHistory,
            ownershipLost,
            currentOwner,
            released,
        });
    } catch (error) {
        console.error('Webflow session error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET: Retrieve all active sessions (for popup polling)
 */
export async function GET() {
    try {
        // Clean up stale sessions
        await cleanupStaleSessions();

        const sessions = await getAllSessions();
        const accountHistory = await getAccountHistoryMap();

        return NextResponse.json({
            success: true,
            sessions,
            accountHistory,
        });
    } catch (error) {
        console.error('Webflow session error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
