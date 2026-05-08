import { useQuery } from '@tanstack/react-query';
import { getContext } from '@microsoft/power-apps/app';

export const useUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const context = await getContext();
        return context.user;
      } catch (error) {
        console.warn('[useUser] Failed to get context:', error);
        // Return a fallback user object when context is unavailable
        return {
          fullName: 'Sales User',
          userPrincipalName: 'user@contoso.com',
          objectId: 'demo-user-id',
          tenantId: 'demo-tenant-id',
        };
      }
    },
  });
};
