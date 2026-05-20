import { isCopilotStudioAvailable } from '@/services/copilot-service';
import { executeFunction } from './function-executor';
import type { Locale } from '@/lib/i18n';

// Extracted visit data interface for structured extraction
export interface ExtractedVisitData {
  accountId?: string;
  accountName?: string;
  contactName?: string;
  visitDate?: Date;
  visitType?: 'in-person' | 'phone' | 'video' | 'email';
  summary?: string;
  outcome?: string;
  nextSteps?: string;
  opportunitySignal?: string;
  confidence: number;
}

export type FindAccountByNameFn = (name: string) => { id: string; name1?: string } | undefined;

/**
 * Extract structured visit data from text using Copilot Studio SDK connector.
 */
export async function extractVisitDataFromText(
  text: string,
  findAccountByName: FindAccountByNameFn,
  locale: Locale,
  userId: string | undefined
): Promise<ExtractedVisitData | null> {
  if (!isCopilotStudioAvailable()) return null;

  try {
    const extractionPrompt = locale === 'zh-Hans'
      ? `请从以下拜访描述中提取信息，以JSON格式返回：客户名称(accountName)、联系人(contactName)、拜访日期(visitDate)、拜访类型(visitType)、摘要(summary)、结果(outcome)、后续计划(nextSteps)、商机信号(opportunitySignal)、置信度(confidence)。描述：${text}`
      : `Please extract information from the following visit description and return in JSON format: account name (accountName), contact (contactName), visit date (visitDate), visit type (visitType), summary, outcome, next steps (nextSteps), opportunity signal (opportunitySignal), confidence (0-100). Description: ${text}`;

    const result = await executeFunction(
      'queryCopilotStudio',
      { query: extractionPrompt },
      { userId, locale }
    );

    if (!result.success || !result.data) return null;

    const responseText = (result.data as { answer?: string }).answer || '';

    try {
      let jsonStr = responseText;
      if (jsonStr.includes('{')) {
        jsonStr = jsonStr.substring(jsonStr.indexOf('{'));
        if (jsonStr.includes('}')) {
          jsonStr = jsonStr.substring(0, jsonStr.lastIndexOf('}') + 1);
        }
      }

      const parsed = JSON.parse(jsonStr);
      const matchedAccount = parsed.accountName ? findAccountByName(parsed.accountName) : undefined;

      return {
        accountId: matchedAccount?.id,
        accountName: parsed.accountName,
        contactName: parsed.contactName,
        visitDate: parsed.visitDate ? new Date(parsed.visitDate) : new Date(),
        visitType: parsed.visitType,
        summary: parsed.summary,
        outcome: parsed.outcome,
        nextSteps: parsed.nextSteps,
        opportunitySignal: parsed.opportunitySignal,
        confidence: parsed.confidence || 75,
      };
    } catch {
      return {
        summary: responseText,
        visitDate: new Date(),
        confidence: 50,
      };
    }
  } catch (error) {
    console.error('[visit-extraction] extractVisitDataFromText failed:', error);
    return null;
  }
}
