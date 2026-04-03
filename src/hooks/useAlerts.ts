'use client';

import { useEffect, useState, useCallback } from 'react';
import { alertService } from '@/services/AlertService';
import { SiteAlert } from '@/types/alerts';

export function useAlerts() {
  const [alerts, setAlerts] = useState<SiteAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = alertService.subscribeToAlerts(
      (updatedAlerts) => {
        setAlerts(updatedAlerts);
        setIsLoading(false);
      },
      { limitCount: 30 }
    );

    return () => unsubscribe();
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length;

  const markAsRead = useCallback(async (alertId: string) => {
    await alertService.markAsRead(alertId);
  }, []);

  const markAllAsRead = useCallback(async () => {
    await alertService.markAllRead();
  }, []);

  const dismissAlert = useCallback(async (alertId: string) => {
    await alertService.dismissAlert(alertId);
  }, []);

  return {
    alerts,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    dismissAlert,
  };
}
