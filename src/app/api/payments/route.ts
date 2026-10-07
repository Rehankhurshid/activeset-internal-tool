import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  listInvoiceRefs,
  listPaymentsForProject,
  listProjectRefs,
  listRecentPayments,
} from '@/modules/payments/infrastructure/payments.repository';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';

/**
 * GET /api/payments → { payments, projects, invoices } for the Payments page.
 * GET /api/payments?projectId= → { payments } assigned to one project, for its Invoices tab.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (projectId) {
      return NextResponse.json({ payments: await listPaymentsForProject(projectId) });
    }
    const [payments, projects, invoices] = await Promise.all([
      listRecentPayments(),
      listProjectRefs(),
      listInvoiceRefs(),
    ]);
    return NextResponse.json({ payments, projects, invoices });
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments GET');
  }
}
