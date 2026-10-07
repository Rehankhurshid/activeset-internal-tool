'use client';

import { Suspense } from 'react';
import { PaymentsScreen } from '@/modules/payments';

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsScreen />
    </Suspense>
  );
}
