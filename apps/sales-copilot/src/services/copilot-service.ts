/**
 * Copilot Studio Service
 * Handles communication with Microsoft Copilot Studio via Direct Line
 */

export interface CopilotConfig {
  tokenEndpoint: string;
}

export interface ConversationInfo {
  conversationId: string;
  token: string;
  streamUrl?: string;
  /** Timestamp when token was acquired (epoch ms) */
  tokenAcquiredAt: number;
  /** Timestamp when conversation was started (epoch ms) */
  conversationStartedAt: number;
}

export interface UserContext {
  userId: string;
  userPrincipalName: string;
  displayName: string;
}

export interface CopilotMessage {
  type: 'message' | 'event' | 'typing';
  from: 'user' | 'bot';
  text?: string;
  name?: string;
  value?: unknown;
  timestamp: Date;
}

const STORAGE_KEY = 'copilot-config';
const CONVERSATION_KEY = 'copilot-conversation';

// Direct Line tokens are valid for 30 minutes, but we use 25 minutes to be safe
const TOKEN_TTL_MS = 25 * 60 * 1000;
// Conversations can go stale after inactivity; we consider them stale after 4 hours
const CONVERSATION_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Get stored Copilot configuration
 */
export function getCopilotConfig(): CopilotConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Save Copilot configuration
 */
export function saveCopilotConfig(config: CopilotConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-config-changed', { detail: config }));
  }
}

/**
 * Clear Copilot configuration
 */
export function clearCopilotConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CONVERSATION_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-config-changed', { detail: null }));
  }
}

/**
 * Get stored conversation info
 */
function getStoredConversation(): ConversationInfo | null {
  try {
    const stored = localStorage.getItem(CONVERSATION_KEY);
    if (!stored) return null;
    const conversation = JSON.parse(stored) as ConversationInfo;

    // Validate freshness metadata exists (backwards compatibility)
    if (!conversation.tokenAcquiredAt || !conversation.conversationStartedAt) {
      console.log('[Copilot Service] Stored conversation missing freshness metadata, invalidating');
      localStorage.removeItem(CONVERSATION_KEY);
      return null;
    }

    return conversation;
  } catch {
    return null;
  }
}

function isConversationValid(conversation: ConversationInfo): boolean {
  const now = Date.now();

  // Check if token is expired
  if (now - conversation.tokenAcquiredAt > TOKEN_TTL_MS) {
    console.log('[Copilot Service] Token expired, conversation invalid');
    return false;
  }

  // Check if conversation is stale
  if (now - conversation.conversationStartedAt > CONVERSATION_TTL_MS) {
    console.log('[Copilot Service] Conversation stale (too old), conversation invalid');
    return false;
  }

  return true;
}

/**
 * Save conversation info
 */
function saveConversation(conversation: ConversationInfo): void {
  localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation));
}

/**
 * Clear conversation (start fresh)
 */
export function clearConversation(): void {
  localStorage.removeItem(CONVERSATION_KEY);
}

/**
 * Get Direct Line token from Token Endpoint
 */
async function getDirectLineToken(tokenEndpoint: string): Promise<{ token: string; conversationId: string }> {
  try {
    const response = await fetch(tokenEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Token endpoint not found (404). Please verify the Copilot Studio Token Endpoint URL in Settings is correct.');
      }
      throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
    }

    // Check content type to ensure we're getting JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Response is not JSON - likely an HTML error page
      const text = await response.text();
      if (text.toLowerCase().includes('<!doctype') || text.toLowerCase().includes('<html')) {
        throw new Error('Invalid endpoint: Received HTML instead of JSON. Please verify the Token Endpoint URL is correct.');
      }
      throw new Error(`Invalid response format: Expected JSON but received ${contentType || 'unknown'}`);
    }

    let data: { token: string; conversationId: string };
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid JSON response from token endpoint. Please verify the URL is correct.');
    }

    return {
      token: data.token,
      conversationId: data.conversationId,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to reach Copilot token endpoint. Check your internet connection and endpoint URL.');
    }
    throw error;
  }
}

/**
 * Start a new conversation with Direct Line
 */
async function startConversation(token: string): Promise<ConversationInfo> {
  try {
    const response = await fetch('https://directline.botframework.com/v3/directline/conversations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to start conversation: ${response.status}`);
    }

    let data: { conversationId: string; token?: string; streamUrl?: string };
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid response from Direct Line API.');
    }

    const now = Date.now();

    return {
      conversationId: data.conversationId,
      token: data.token || token,
      streamUrl: data.streamUrl,
      tokenAcquiredAt: now,
      conversationStartedAt: now,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to connect to Direct Line API. Check your internet connection.');
    }
    throw error;
  }
}

/**
 * Test connection to Copilot Studio
 */
export async function testConnection(tokenEndpoint: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Get token from endpoint
    const { token } = await getDirectLineToken(tokenEndpoint);
    
    // Step 2: Try to start a conversation
    await startConversation(token);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed. Please check your settings and try again.',
    };
  }
}

/**
 * Get or create a conversation
 */
export async function getOrCreateConversation(config: CopilotConfig): Promise<ConversationInfo> {
  // Check for existing conversation
  const existing = getStoredConversation();

  if (existing && isConversationValid(existing)) {
    console.log('[Copilot Service] Reusing valid cached conversation');
    return existing;
  }

  // Clear any stale/invalid conversation
  if (existing) {
    console.log('[Copilot Service] Clearing stale conversation, will create new');
    clearConversation();
  }

  // Get new token and start conversation
  const now = Date.now();
  const { token } = await getDirectLineToken(config.tokenEndpoint);
  const conversationData = await startConversation(token);

  const conversation: ConversationInfo = {
    ...conversationData,
    tokenAcquiredAt: now,
    conversationStartedAt: now,
  };

  saveConversation(conversation);

  return conversation;
}

/**
 * Send user context event to Copilot
 */
export async function sendUserContext(
  conversation: ConversationInfo,
  userContext: UserContext
): Promise<void> {
  const response = await fetch(
    `https://directline.botframework.com/v3/directline/conversations/${conversation.conversationId}/activities`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${conversation.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'event',
        from: { id: userContext.userId },
        name: 'setUserContext',
        value: userContext,
      }),
    }
  );

  if (!response.ok) {
    console.error('Failed to send user context:', response.status);
  }
}

/**
 * Send a message to Copilot
 */
export async function sendMessage(
  conversation: ConversationInfo,
  userId: string,
  text: string
): Promise<void> {
  try {
    const response = await fetch(
      `https://directline.botframework.com/v3/directline/conversations/${conversation.conversationId}/activities`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${conversation.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'message',
          from: { id: userId },
          text,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to send message. Check your internet connection.');
    }
    throw error;
  }
}

/**
 * Poll for new messages from Copilot
 */
export async function pollMessages(
  conversation: ConversationInfo,
  watermark?: string
): Promise<{ activities: CopilotMessage[]; watermark: string }> {
  try {
    const url = new URL(
      `https://directline.botframework.com/v3/directline/conversations/${conversation.conversationId}/activities`
    );
    if (watermark) {
      url.searchParams.set('watermark', watermark);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${conversation.token}`,
      },
    });

    if (!response.ok) {
      const error = new Error(`Failed to poll messages: ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    
    // Debug: log raw activities from Direct Line
    if (data.activities && data.activities.length > 0) {
      console.log('[Copilot Service] Raw activities:', JSON.stringify(data.activities, null, 2));
    }
    
    // Transform activities to our format
    const activities: CopilotMessage[] = (data.activities || []).map((activity: {
      type: string;
      from: { id?: string; role?: string; name?: string };
      text?: string;
      name?: string;
      value?: unknown;
      timestamp: string;
      attachments?: Array<{ contentType?: string; content?: { text?: string } }>;
      channelData?: { text?: string };
    }) => {
      // Direct Line uses from.role or from.id to identify sender
      // Bot messages have from.role === 'bot' or from.id contains 'bot'
      const isBot = activity.from?.role === 'bot' || 
                    (activity.from?.id && activity.from.id.toLowerCase().includes('bot'));
      
      // Extract text from various possible locations
      let messageText = activity.text;
      
      // Check attachments for text content (Adaptive Cards, etc.)
      if (!messageText && activity.attachments && activity.attachments.length > 0) {
        for (const attachment of activity.attachments) {
          if (attachment.content?.text) {
            messageText = attachment.content.text;
            break;
          }
          // Handle Adaptive Cards with body text
          const content = attachment.content as { body?: Array<{ type: string; text?: string }> };
          if (content?.body) {
            const textBlocks = content.body.filter((b: { type: string }) => b.type === 'TextBlock');
            if (textBlocks.length > 0) {
              messageText = textBlocks.map((b: { text?: string }) => b.text || '').join('\n');
            }
          }
        }
      }
      
      // Check channelData for text
      if (!messageText && activity.channelData?.text) {
        messageText = activity.channelData.text;
      }
      
      // Debug: log each activity transformation
      console.log('[Copilot Service] Activity transform:', {
        originalFrom: activity.from,
        isBot,
        originalText: activity.text,
        extractedText: messageText,
      });
      
      return {
        type: activity.type as 'message' | 'event' | 'typing',
        from: isBot ? 'bot' : 'user',
        text: messageText,
        name: activity.name,
        value: activity.value,
        timestamp: new Date(activity.timestamp),
      };
    });

    return {
      activities,
      watermark: data.watermark,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      const networkError = new Error('Network error: Unable to poll messages. Check your internet connection.') as Error & { status?: number };
      networkError.status = 0;
      throw networkError;
    }
    throw error;
  }
}

/**
 * WebSocket activity handler callback types
 */
export interface WebSocketCallbacks {
  onTyping?: () => void;
  onMessage?: (message: CopilotMessage) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/**
 * Create WebSocket connection to Direct Line for real-time updates
 * Returns a cleanup function to close the connection
 */
export function createWebSocketConnection(
  conversation: ConversationInfo,
  callbacks: WebSocketCallbacks
): () => void {
  if (!conversation.streamUrl) {
    console.warn('[Copilot WebSocket] No streamUrl available, falling back to polling');
    callbacks.onClose?.();
    return () => {};
  }

  console.log('[Copilot WebSocket] Connecting to:', conversation.streamUrl);
  
  let ws: WebSocket | null = null;
  let isConnected = false;
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    ws = new WebSocket(conversation.streamUrl);
  } catch (error) {
    // WebSocket constructor can throw if URL is invalid
    console.warn('[Copilot WebSocket] Failed to create WebSocket, falling back to polling:', error);
    callbacks.onClose?.();
    return () => {};
  }

  // Set a connection timeout - if not connected within 10 seconds, fall back to polling
  connectionTimeout = setTimeout(() => {
    if (!isConnected && ws) {
      console.warn('[Copilot WebSocket] Connection timeout, falling back to polling');
      ws.close();
      callbacks.onClose?.();
    }
  }, 10000);

  ws.onopen = () => {
    console.log('[Copilot WebSocket] Connected');
    isConnected = true;
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      // Skip empty messages
      if (!event.data || event.data === '') {
        return;
      }
      
      const data = JSON.parse(event.data);
      console.log('[Copilot WebSocket] Received:', data);

      if (data.activities && Array.isArray(data.activities)) {
        for (const activity of data.activities) {
          // Check if it's from the bot
          const isBot = activity.from?.role === 'bot' || 
                        (activity.from?.id && activity.from.id.toLowerCase().includes('bot'));
          
          if (!isBot) continue;

          // Handle typing indicator
          if (activity.type === 'typing') {
            console.log('[Copilot WebSocket] Bot is typing...');
            callbacks.onTyping?.();
            continue;
          }

          // Handle message
          if (activity.type === 'message') {
            // Extract text from various possible locations
            let messageText = activity.text;
            
            // Check attachments for text content
            if (!messageText && activity.attachments && activity.attachments.length > 0) {
              for (const attachment of activity.attachments) {
                if (attachment.content?.text) {
                  messageText = attachment.content.text;
                  break;
                }
                // Handle Adaptive Cards with body text
                const content = attachment.content as { body?: Array<{ type: string; text?: string }> };
                if (content?.body) {
                  const textBlocks = content.body.filter((b: { type: string }) => b.type === 'TextBlock');
                  if (textBlocks.length > 0) {
                    messageText = textBlocks.map((b: { text?: string }) => b.text || '').join('\n');
                  }
                }
              }
            }
            
            // Check channelData for text
            if (!messageText && activity.channelData?.text) {
              messageText = activity.channelData.text;
            }

            if (messageText) {
              const copilotMessage: CopilotMessage = {
                type: 'message',
                from: 'bot',
                text: messageText,
                name: activity.name,
                value: activity.value,
                timestamp: new Date(activity.timestamp || Date.now()),
              };
              console.log('[Copilot WebSocket] Bot message:', copilotMessage);
              callbacks.onMessage?.(copilotMessage);
            }
          }
        }
      }
    } catch (err) {
      // Only log parse errors for non-empty data - suppress console noise for empty/keepalive messages
      if (event.data && event.data.length > 0) {
        console.warn('[Copilot WebSocket] Parse error, data length:', event.data?.length);
      }
    }
  };

  ws.onerror = () => {
    // Don't call onError here - just log it. The onclose handler will trigger fallback to polling.
    // This prevents the "WebSocket connection error" from surfacing to the user.
    console.warn('[Copilot WebSocket] Connection error, will fall back to polling');
  };

  ws.onclose = (event: CloseEvent) => {
    console.log('[Copilot WebSocket] Closed:', event.code, event.reason);
    isConnected = false;
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    // Always notify closure so caller can set up polling fallback
    callbacks.onClose?.();
  };

  // Return cleanup function
  return () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      console.log('[Copilot WebSocket] Closing connection');
      ws.close(1000, 'Client closing');
    }
  };
}