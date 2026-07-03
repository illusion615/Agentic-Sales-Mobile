/**
 * Delete handlers.
 *
 * SAFETY: delete handlers require a CONCRETE record id — never a name / fuzzy
 * match — so a delete can only ever hit a record the user (or a confirmed
 * proposal) explicitly identified. These handlers are intentionally NOT added
 * to the skill catalog / skills-selector, so the planner cannot invoke them on
 * its own. They are reachable ONLY from a user-confirmed change proposal
 * (see the proposeChanges confirm card in the queue runtime).
 */

import { ActivityService } from '@/generated/services/activity-service';
import { registerHandlers, type FunctionHandler } from './handler-registry';

const deleteActivity: FunctionHandler = async (args) => {
  const activityId = typeof args.activityId === 'string' ? args.activityId.trim() : '';
  if (!activityId) {
    return { success: false, error: '缺少 activityId（删除必须指定具体记录）/ Missing activityId (delete requires a concrete record id)' };
  }
  await ActivityService.delete(activityId);
  return {
    success: true,
    data: { message: '活动已删除 / Activity deleted', activityId },
    invalidateQueries: ['activity-list'],
  };
};

registerHandlers({ deleteActivity });
