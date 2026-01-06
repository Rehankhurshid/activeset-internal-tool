import { ProposalComment, ProposalSectionId } from '../types/Proposal';
import { db } from '@/lib/firebase';
import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    Unsubscribe
} from 'firebase/firestore';

class CommentService {
    private readonly COLLECTION_NAME = 'proposal_comments';

    /**
     * Get all comments for a proposal
     */
    async getComments(proposalId: string): Promise<ProposalComment[]> {
        try {
            const commentsRef = collection(db, this.COLLECTION_NAME);
            const q = query(
                commentsRef,
                where('proposalId', '==', proposalId),
                orderBy('createdAt', 'asc')
            );
            const querySnapshot = await getDocs(q);

            const comments: ProposalComment[] = [];
            querySnapshot.forEach((doc) => {
                comments.push(doc.data() as ProposalComment);
            });

            return comments;
        } catch (error) {
            console.error('Error fetching comments:', error);
            throw new Error('Failed to load comments');
        }
    }

    /**
     * Get comments for a specific section
     */
    async getCommentsBySection(proposalId: string, sectionId: ProposalSectionId): Promise<ProposalComment[]> {
        try {
            const commentsRef = collection(db, this.COLLECTION_NAME);
            const q = query(
                commentsRef,
                where('proposalId', '==', proposalId),
                where('sectionId', '==', sectionId),
                orderBy('createdAt', 'asc')
            );
            const querySnapshot = await getDocs(q);

            const comments: ProposalComment[] = [];
            querySnapshot.forEach((doc) => {
                comments.push(doc.data() as ProposalComment);
            });

            return comments;
        } catch (error) {
            console.error('Error fetching section comments:', error);
            throw new Error('Failed to load section comments');
        }
    }

    /**
     * Add a new comment
     */
    async addComment(
        comment: Omit<ProposalComment, 'id' | 'createdAt'>
    ): Promise<ProposalComment> {
        const newComment: ProposalComment = {
            ...comment,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
        };

        try {
            const docRef = doc(db, this.COLLECTION_NAME, newComment.id);
            await setDoc(docRef, newComment);
            return newComment;
        } catch (error) {
            console.error('Error adding comment:', error);
            throw new Error('Failed to add comment');
        }
    }

    /**
     * Reply to an existing comment (creates a new comment with parentId)
     */
    async replyToComment(
        parentComment: ProposalComment,
        replyContent: string,
        authorName: string,
        authorEmail: string,
        authorType: 'agency' | 'client'
    ): Promise<ProposalComment> {
        return this.addComment({
            proposalId: parentComment.proposalId,
            sectionId: parentComment.sectionId,
            authorName,
            authorEmail,
            authorType,
            content: replyContent,
            parentId: parentComment.id,
        });
    }

    /**
     * Mark a comment as resolved
     */
    async resolveComment(commentId: string, resolverEmail: string): Promise<void> {
        try {
            const docRef = doc(db, this.COLLECTION_NAME, commentId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                throw new Error('Comment not found');
            }

            const comment = docSnap.data() as ProposalComment;
            const updatedComment: ProposalComment = {
                ...comment,
                resolved: true,
                resolvedAt: new Date().toISOString(),
                resolvedBy: resolverEmail,
            };

            await setDoc(docRef, updatedComment);
        } catch (error) {
            console.error('Error resolving comment:', error);
            throw new Error('Failed to resolve comment');
        }
    }

    /**
     * Reopen a resolved comment
     */
    async reopenComment(commentId: string): Promise<void> {
        try {
            const docRef = doc(db, this.COLLECTION_NAME, commentId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                throw new Error('Comment not found');
            }

            const comment = docSnap.data() as ProposalComment;
            const updatedComment: ProposalComment = {
                ...comment,
                resolved: false,
                resolvedAt: undefined,
                resolvedBy: undefined,
            };

            await setDoc(docRef, updatedComment);
        } catch (error) {
            console.error('Error reopening comment:', error);
            throw new Error('Failed to reopen comment');
        }
    }

    /**
     * Delete a comment
     */
    async deleteComment(commentId: string): Promise<void> {
        try {
            const docRef = doc(db, this.COLLECTION_NAME, commentId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error('Error deleting comment:', error);
            throw new Error('Failed to delete comment');
        }
    }

    /**
     * Subscribe to real-time comment updates for a proposal
     * Returns an unsubscribe function
     */
    subscribeToComments(
        proposalId: string,
        callback: (comments: ProposalComment[]) => void
    ): Unsubscribe {
        const commentsRef = collection(db, this.COLLECTION_NAME);
        const q = query(
            commentsRef,
            where('proposalId', '==', proposalId),
            orderBy('createdAt', 'asc')
        );

        return onSnapshot(q, (querySnapshot) => {
            const comments: ProposalComment[] = [];
            querySnapshot.forEach((doc) => {
                comments.push(doc.data() as ProposalComment);
            });
            callback(comments);
        }, (error) => {
            console.error('Error in comment subscription:', error);
        });
    }

    /**
     * Get comment count for a proposal (useful for badges)
     */
    async getCommentCount(proposalId: string, unresolvedOnly: boolean = false): Promise<number> {
        try {
            const comments = await this.getComments(proposalId);
            if (unresolvedOnly) {
                return comments.filter(c => !c.resolved && !c.parentId).length;
            }
            return comments.filter(c => !c.parentId).length; // Count only root comments
        } catch (error) {
            console.error('Error counting comments:', error);
            return 0;
        }
    }

    /**
     * Group comments by section (useful for sidebar display)
     */
    groupCommentsBySection(comments: ProposalComment[]): Record<ProposalSectionId, ProposalComment[]> {
        const grouped: Record<ProposalSectionId, ProposalComment[]> = {
            overview: [],
            aboutUs: [],
            pricing: [],
            timeline: [],
            terms: [],
            signatures: [],
            general: [],
        };

        comments.forEach(comment => {
            if (grouped[comment.sectionId]) {
                grouped[comment.sectionId].push(comment);
            }
        });

        return grouped;
    }

    /**
     * Build comment threads (organize replies under parent comments)
     */
    buildCommentThreads(comments: ProposalComment[]): ProposalComment[][] {
        const rootComments = comments.filter(c => !c.parentId);
        const replies = comments.filter(c => c.parentId);

        return rootComments.map(root => {
            const thread = [root];
            const rootReplies = replies
                .filter(r => r.parentId === root.id)
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            thread.push(...rootReplies);
            return thread;
        });
    }
}

export const commentService = new CommentService();
