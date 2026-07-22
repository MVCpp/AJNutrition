import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthStatusDto } from '@ajnutrition/shared';
import { unwrap } from '../api';

export const AUTH_STATUS_KEY = ['auth', 'status'] as const;

/** Auth state, kept in sync with lock/unlock pushes from the main process. */
export function useAuthStatus() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return window.ajnutrition.auth.onStatusChanged((status: AuthStatusDto) => {
      queryClient.setQueryData(AUTH_STATUS_KEY, status);
      if (status.state !== 'unlocked') {
        // Locked: drop every cached patient answer from memory.
        queryClient.removeQueries({ queryKey: ['patients'] });
      }
    });
  }, [queryClient]);

  return useQuery({
    queryKey: AUTH_STATUS_KEY,
    queryFn: () => unwrap(window.ajnutrition.auth.getStatus()),
    // Refresh the retry-delay countdown while a throttle is active.
    refetchInterval: (query) =>
      query.state.data && query.state.data.retryDelaySeconds > 0 ? 1000 : false,
  });
}
