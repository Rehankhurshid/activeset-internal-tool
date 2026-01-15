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
    query,
    where,
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
}

const COLLECTION_NAME = 'webflow_sessions';
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

export async function POST(request: NextRequest) {
    try {
        const body: SessionRequest = await request.json();
        const { email, userName, projectPath = '', action } = body;

        if (!email || !userName) {
            return NextResponse.json(
                { success: false, error: 'email and userName are required' },
                { status: 400 }
            );
        }

        // Clean up stale sessions on each request
        await cleanupStaleSessions();

        const sessionRef = doc(db, COLLECTION_NAME, email);

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

                if (!currentSession.exists() || currentSession.data()?.userName === userName) {
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
                    // Session was claimed by someone else - this user should release
                    console.log(`Heartbeat rejected: ${userName} != ${currentSession.data()?.userName}`);
                }
                break;

            case 'release':
                // Delete session on logout
                await deleteDoc(sessionRef);
                break;

            default:
                return NextResponse.json(
                    { success: false, error: 'Invalid action' },
                    { status: 400 }
                );
        }

        // Return all active sessions for popup display
        const sessions = await getAllSessions();

        return NextResponse.json({
            success: true,
            sessions,
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

        return NextResponse.json({
            success: true,
            sessions,
        });
    } catch (error) {
        console.error('Webflow session error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
