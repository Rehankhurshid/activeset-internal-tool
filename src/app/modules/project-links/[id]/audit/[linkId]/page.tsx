import { PageDetails } from '@/components/page-details';

export default async function AuditPage({ params }: { params: Promise<{ id: string; linkId: string }> }) {
    const { id, linkId } = await params;
    return <PageDetails projectId={id} linkId={linkId} />;
}
