/**
 * Resolve handlers — fuzzyMatchAccount / fuzzyMatchContact / fuzzyMatchOpportunity / fuzzyMatchActivity
 */

import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import type { Account } from '@/generated/models/account-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { calculateEnhancedMatchScore, getConfidenceLevel, getMatchThresholds, type EnhancedMatchScore } from '../agent-utils';
import { registerHandlers, type FunctionHandler } from './handler-registry';

const fuzzyMatchAccount: FunctionHandler = async (args) => {
  const query = (args.query as string || '');
  const contextStr = (args.context as string || '');
  const accounts = await AccountService.getAll();

  // List mode: no query → return candidates for the missing-subject gate picker.
  // No fabricated scores; the card renders a plain pick list.
  if (!query.trim()) {
    const matches = accounts
      .slice(0, 8)
      .map((a: Account) => ({
        id: a.id, name: a.name1 || '', industry: a.industry,
        score: 0, matchType: 'fuzzy' as const,
      }));
    return { success: true, data: { matches, confidence: 'none' as const, listMode: true, needsConfirmation: true, exactMatch: null } };
  }

  const matches = accounts
    .map((a: Account) => {
      const name = a.name1 || '';
      const enhancedScore = calculateEnhancedMatchScore(query, name, contextStr || a.industry);
      return {
        id: a.id, name: a.name1 || '', industry: a.industry,
        score: enhancedScore.score, matchType: enhancedScore.matchType,
        scoreBreakdown: enhancedScore.breakdown,
      };
    })
    .filter((m) => m.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const bestMatch = matches[0];
  const confidence = bestMatch ? getConfidenceLevel(bestMatch.score) : 'none';
  return {
    success: true,
    data: { matches, confidence, needsConfirmation: confidence !== 'high' || matches.length > 1,
      exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null },
  };
};

const fuzzyMatchContact: FunctionHandler = async (args) => {
  const query = (args.query as string || '');
  const accountId = args.accountId as string | undefined;
  const contacts = await ContactService.getAll();

  // List mode: no query → return candidates for the missing-subject gate picker.
  if (!query.trim()) {
    const matches = contacts
      .filter((c: Contact) => !accountId || c.account?.id === accountId)
      .slice(0, 8)
      .map((c: Contact) => ({
        id: c.id, name: c.fullname || '', title: c.title,
        phone: c.phone, email: c.email,
        accountName: c.account?.name1, accountId: c.account?.id,
        score: 0, matchType: 'fuzzy' as const,
      }));
    return { success: true, data: { matches, confidence: 'none' as const, listMode: true, needsConfirmation: true, exactMatch: null } };
  }

  const matches = contacts
    .filter((c: Contact) => !accountId || c.account?.id === accountId)
    .map((c: Contact) => {
      const name = c.fullname || '';
      const enhancedScore = calculateEnhancedMatchScore(query, name);
      return {
        id: c.id, name: c.fullname || '', title: c.title,
        phone: c.phone, email: c.email,
        accountName: c.account?.name1, accountId: c.account?.id,
        score: enhancedScore.score, matchType: enhancedScore.matchType,
      };
    })
    .filter((m) => m.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const bestMatch = matches[0];
  const confidence = bestMatch ? getConfidenceLevel(bestMatch.score) : 'none';
  return {
    success: true,
    data: { matches, confidence, needsConfirmation: confidence !== 'high' || matches.length > 1,
      exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null },
  };
};

const fuzzyMatchOpportunity: FunctionHandler = async (args) => {
  const query = (args.query as string || '');
  const accountId = args.accountId as string | undefined;
  const opportunities = await OpportunityService.getAll();

  // List mode: no query → return candidates for the missing-subject gate picker.
  if (!query.trim()) {
    const matches = opportunities
      .filter((o: Opportunity) => !accountId || o.account?.id === accountId)
      .slice(0, 8)
      .map((o: Opportunity) => ({
        id: o.id, name: o.name1 || '', accountName: o.account?.name1,
        amount: o.totalamount, stage: o.stage,
        expectedCloseDate: o.expectedclosedate,
        score: 0, matchType: 'fuzzy' as const,
      }));
    return { success: true, data: { matches, confidence: 'none' as const, listMode: true, needsConfirmation: true, exactMatch: null } };
  }

  const matches = opportunities
    .filter((o: Opportunity) => !accountId || o.account?.id === accountId)
    .map((o: Opportunity) => {
      const name = o.name1 || '';
      const enhancedScore = calculateEnhancedMatchScore(query, name);
      return {
        id: o.id, name: o.name1 || '', accountName: o.account?.name1,
        amount: o.totalamount, stage: o.stage,
        expectedCloseDate: o.expectedclosedate,
        score: enhancedScore.score, matchType: enhancedScore.matchType,
      };
    })
    .filter((m) => m.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const bestMatch = matches[0];
  const confidence = bestMatch ? getConfidenceLevel(bestMatch.score) : 'none';
  return {
    success: true,
    data: { matches, confidence, needsConfirmation: confidence !== 'high' || matches.length > 1,
      exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null },
  };
};

const fuzzyMatchActivity: FunctionHandler = async (args) => {
  const query = args.query as string;
  const accountIdArg = args.accountId as string | undefined;
  const dateRange = args.dateRange as string | undefined;

  // List mode: no query → return recent candidates for the missing-subject picker.
  if (!query || !query.trim()) {
    let base = await ActivityService.getAll();
    if (accountIdArg) base = base.filter((a: Activity) => a.account?.id === accountIdArg);
    const matches = base.slice(0, 8).map((a: Activity) => ({
      id: a.id, name: a.title || '', accountName: a.account?.name1,
      score: 0, matchType: 'fuzzy' as const,
    }));
    return { success: true, data: { matches, confidence: 'none' as const, listMode: true, needsConfirmation: true, exactMatch: null } };
  }

  let allActivities = await ActivityService.getAll();
  if (accountIdArg) allActivities = allActivities.filter((a: Activity) => a.account?.id === accountIdArg);
  if (dateRange) {
    const now = new Date();
    let daysBack = 30;
    if (dateRange === '7days') daysBack = 7;
    else if (dateRange === '14days') daysBack = 14;
    else if (dateRange === '60days') daysBack = 60;
    else if (dateRange === '90days') daysBack = 90;
    const cutoffDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    allActivities = allActivities.filter((a: Activity) => {
      if (!a.scheduleddate) return false;
      return new Date(a.scheduleddate) >= cutoffDate;
    });
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 1);

  const scoredActivities = allActivities.map((activity: Activity) => {
    const titleLower = (activity.title || '').toLowerCase();
    const notesLower = (activity.notes || '').toLowerCase();
    const combinedText = `${titleLower} ${notesLower}`;
    let score = 0;
    let matchType: 'exact' | 'contains' | 'fuzzy' = 'fuzzy';

    if (titleLower === queryLower) { score = 100; matchType = 'exact'; }
    else if (titleLower.includes(queryLower)) { score = 80; matchType = 'contains'; }
    else {
      for (const word of queryWords) { if (combinedText.includes(word)) score += 15; }
      for (const word of queryWords) { if (titleLower.includes(word)) score += 10; }
    }

    if (activity.scheduleddate) {
      const daysDiff = Math.floor((new Date().getTime() - new Date(activity.scheduleddate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) score += 10;
      else if (daysDiff <= 14) score += 5;
    }
    if (score > 100) score = 100;

    const accountName = activity.account?.name1 || '未关联客户';
    const dateStr = activity.scheduleddate ? new Date(activity.scheduleddate).toLocaleDateString() : '';
    const subtitleParts = [accountName, activity.type, dateStr].filter(Boolean) as string[];

    return {
      id: activity.id, name: activity.title || '(无标题)', title: activity.title,
      subtitle: subtitleParts.join(' · '), matchType, type: activity.type,
      scheduleddate: activity.scheduleddate, accountId: activity.account?.id,
      accountName, notes: activity.notes, score,
    };
  });

  const matches = scoredActivities
    .filter((a) => a.score >= getMatchThresholds().low)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const bestMatch = matches[0];
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (bestMatch) {
    if (bestMatch.score >= 80) confidence = 'high';
    else if (bestMatch.score >= getMatchThresholds().medium) confidence = 'medium';
  }

  return {
    success: true,
    data: {
      matches, confidence,
      needsConfirmation: confidence !== 'high' || matches.length > 1,
      exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null,
      message: matches.length > 0
        ? `找到 ${matches.length} 条可能匹配的活动记录`
        : '未找到类似的活动记录，这是新活动',
    },
  };
};

registerHandlers({
  fuzzyMatchAccount,
  fuzzyMatchContact,
  fuzzyMatchOpportunity,
  fuzzyMatchActivity,
});
