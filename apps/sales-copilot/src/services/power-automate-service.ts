/**
 * Power Automate Flow Service
 * Invokes Power Automate flows via HTTP trigger with sig= URL authentication
 */

import { getContext } from '@microsoft/power-apps/app';

export interface FlowLLMRequest {
  userEmail: string;
  userPrompt: string;
}

export interface FlowLLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Get current user's email, with fallback
 */
async function getUserEmail(fallbackEmail?: string): Promise<string> {
  if (typeof window === 'undefined' || window.parent === window) {
    return fallbackEmail || 'unknown';
  }
  try {
    const context = await getContext();
    return context.user.userPrincipalName || fallbackEmail || 'unknown';
  } catch {
    return fallbackEmail || 'unknown';
  }
}

/**
 * Invoke a Power Automate flow with HTTP trigger (sig= URL authentication)
 * The flow endpoint should be configured as "Anyone with the link" with sig parameter
 */
export async function invokeFlowForLLM(
  flowEndpoint: string,
  request: { messages: Array<{ role: string; content: string }>; model?: string; deploymentName?: string },
  userEmailOverride?: string
): Promise<FlowLLMResponse> {
  const startTime = Date.now();
  
  try {
    const userEmail = await getUserEmail(userEmailOverride);
    
    // Build userPrompt from messages array
    const userPrompt = request.messages
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');
    
    console.log('[Power Automate] Invoking flow for user:', userEmail);
    console.log('[Power Automate] Flow endpoint:', flowEndpoint);
    
    const response = await fetch(flowEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userEmail, userPrompt }),
    });
    
    const latencyMs = Date.now() - startTime;
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('[Power Automate] Flow error:', response.status, responseText);
      return {
        success: false,
        error: `Flow request failed: HTTP ${response.status} - ${responseText.slice(0, 500)}`,
        latencyMs,
      };
    }
    
    console.log('[Power Automate] Flow response:', responseText.slice(0, 200));
    
    return {
      success: true,
      content: responseText,
      latencyMs,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    console.error('[Power Automate] Error:', error);
    
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      return {
        success: false,
        error: 'Network error: Unable to reach Power Automate flow. Check the endpoint URL and your network connection.',
        latencyMs,
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error invoking flow',
      latencyMs,
    };
  }
}

/**
 * Test connection to a Power Automate flow
 */
export async function testFlowConnection(flowEndpoint: string): Promise<{
  success: boolean;
  error?: string;
  latencyMs?: number;
}> {
  const result = await invokeFlowForLLM(flowEndpoint, {
    messages: [{ role: 'user', content: 'Hello' }],
  });
  
  return {
    success: result.success,
    error: result.error,
    latencyMs: result.latencyMs,
  };
}
