import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

/**
 * GET /api/project/[id]/checklist
 * Returns a lightweight summary of checklist progress for a project.
 * Used by widget.js to show a progress badge.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const q = query(
            collection(db, COLLECTIONS.PROJECT_CHECKLISTS),
            where('projectId', '==', id)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            return NextResponse.json(
                { completed: 0, total: 0, checklists: [] },
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        let totalItems = 0;
        let completedItems = 0;
        const checklists: { name: string; completed: number; total: number }[] = [];

        snap.docs.forEach((doc) => {
            const data = doc.data();
            const sections = (data.sections || []) as { items: { status: string }[] }[];
            let clTotal = 0;
            let clCompleted = 0;

            sections.forEach((section) => {
                (section.items || []).forEach((item) => {
                    clTotal++;
                    if (item.status === 'completed') clCompleted++;
                });
            });

            totalItems += clTotal;
            completedItems += clCompleted;

            checklists.push({
                name: data.templateName || 'Checklist',
                completed: clCompleted,
                total: clTotal,
            });
        });

        return NextResponse.json(
            { completed: completedItems, total: totalItems, checklists },
            { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
        );
    } catch (e: unknown) {
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
