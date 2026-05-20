import { useQuery } from '@tanstack/react-query';
import { getContext } from '@microsoft/power-apps/app';

const STANDALONE_USER = {
  fullName: 'Sales Rep',
  userPrincipalName: 'demo@contoso.com',
  objectId: '00000000-0000-0000-0000-000000000000',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

/** True when running inside the Power Apps host iframe. */
const isHosted = typeof window !== 'undefined' && window.parent !== window;

export const useUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      if (!isHosted) return STANDALONE_USER;
      try {
        const context = await getContext();
        return context.user;
      } catch {
        return STANDALONE_USER;
      }
    },
  });
};
