import { useQuery } from '@tanstack/react-query';
import { getContext } from '@microsoft/power-apps/app';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

const dvClient = getClient(dataSourcesInfo);

/**
 * Resolve the Dataverse systemuserid for the current user via email.
 * Uses the 'users' data source (registered via CLI as systemuser table).
 */
async function resolveSystemUserId(email: string): Promise<string> {
  for (const field of ['windowsliveid', 'internalemailaddress']) {
    try {
      const result = await dvClient.retrieveMultipleRecordsAsync<{
        systemuserid: string;
      }>('users', {
        filter: `${field} eq '${email}'`,
        select: ['systemuserid'],
        top: 1,
      } as any);
      if (result.success && result.data?.[0]?.systemuserid) {
        return result.data[0].systemuserid.toLowerCase();
      }
    } catch (e) {
      console.warn(`[useUser] ${field} query failed:`, e);
    }
  }
  return '';
}

export const useUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const context = await getContext();
      const user = context.user;
      const systemUserId = user.userPrincipalName
        ? await resolveSystemUserId(user.userPrincipalName)
        : undefined;
      return { ...user, objectId: systemUserId };
    },
  });
};
