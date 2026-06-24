import { useQuery } from '@tanstack/react-query';
import { getContext } from '@microsoft/power-apps/app';

/**
 * Current user context.
 *
 * `objectId` is the Entra (Azure AD) object id provided by the Power Apps host.
 * It is always present and stable, so it is the reliable per-user key used to
 * stamp/scope app-owned records (conversations, opportunities, etc.).
 *
 * Note: we deliberately do NOT resolve the Dataverse `systemuserid` by querying
 * the `systemuser` table here — that query is not permitted from the deployed
 * Code App runtime (it returns `success:false`), which previously left this
 * value empty and broke every owner-scoped feature. Code that needs the
 * Dataverse owner id (e.g. clearing the current user's own insights) derives it
 * from a record the user just created, whose `_ownerid_value` Dataverse stamps
 * automatically — see the insight regeneration logic in home.tsx.
 */
export const useUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const context = await getContext();
      const user = context.user;
      // objectId already holds the Entra object id; keep it as the stable key.
      return { ...user, objectId: (user.objectId || '').toLowerCase() };
    },
  });
};

