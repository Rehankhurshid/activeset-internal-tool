import { PageAuditDetailsScreen } from '@/modules/site-monitoring';

export default async function AuditPage({ params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  return <PageAuditDetailsScreen projectId={id} linkId={linkId} />;
}
