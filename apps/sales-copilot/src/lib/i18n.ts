// Multilingual support: zh-Hans / en-US + European languages (de-DE / fr-FR / es-ES)

import { useState, useEffect } from 'react';
import { testFlowConnection, invokeFlowForLLM } from '@/services/power-automate-service';
import zhHans from '@/locales/zh-Hans.json';
import enUS from '@/locales/en-US.json';
import deDE from '@/locales/de-DE.json';
import frFR from '@/locales/fr-FR.json';
import esES from '@/locales/es-ES.json';

export type Locale = 'zh-Hans' | 'en-US' | 'de-DE' | 'fr-FR' | 'es-ES';

export type VoiceId = string;

export interface VoiceOption {
  id: VoiceId;
  name: string;
  tier: 'natural' | 'premium';
  locale: Locale;
  gender: 'male' | 'female';
}

// Fetch available models from OpenAI-compatible provider
export interface FetchModelsResult {
  success: boolean;
  models?: string[];
  error?: string;
}

export async function fetchAvailableModels(config: LLMConfig): Promise<FetchModelsResult> {
  // Power Automate uses SDK connector — model selection is handled in the flow
  if (config.provider === 'power-automate') {
    return { success: true, models: ['Power Automate Flow'] };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 5000); // 5 second timeout
  
  try {
    if (!config.endpoint) {
      return { success: false, error: 'Endpoint is required' };
    }

    // Normalize endpoint - remove trailing slash
    const baseEndpoint = config.endpoint.replace(/\/+$/, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.provider === 'ollama') {
      // Ollama: /api/tags endpoint
      const url = `${baseEndpoint}/api/tags`;
      console.log('[Fetch Models] Ollama URL:', url);
      
      const response = await fetch(url, { method: 'GET', headers, mode: 'cors', signal: controller.signal });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }
      
      let data: Record<string, unknown>;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('[Fetch Models] Ollama JSON parse error:', jsonError);
        return { success: false, error: 'Invalid JSON response from Ollama. Ensure the server is running correctly.' };
      }
      const models = ((data.models || []) as Array<{ name?: string }>).map((m) => m.name).filter(Boolean) as string[];
      return { success: true, models };
    } else if (config.provider === 'azure-openai') {
      // Azure OpenAI doesn't have a list models endpoint in the same way
      // Return a message indicating manual entry is needed
      return { success: false, error: 'Azure OpenAI requires manual deployment name entry' };
    } else {
      // OpenAI Compatible: /v1/models
      if (!config.apiKey) {
        return { success: false, error: 'API Key is required' };
      }
      
      let url = baseEndpoint;
      if (!url.includes('/v1')) {
        url = `${baseEndpoint}/v1/models`;
      } else if (!url.endsWith('/models')) {
        url = `${baseEndpoint}/models`;
      }
      console.log('[Fetch Models] OpenAI Compatible URL:', url);
      
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      
      const response = await fetch(url, { method: 'GET', headers, mode: 'cors', signal: controller.signal });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }
      
      let data: Record<string, unknown>;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('[Fetch Models] OpenAI Compatible JSON parse error:', jsonError);
        return { success: false, error: 'Invalid JSON response from API endpoint. Check endpoint URL and model configuration.' };
      }
      const models = ((data.data || []) as Array<{ id?: string }>).map((m) => m.id).filter(Boolean) as string[];
      return { success: true, models };
    }
  } catch (error: unknown) {
    console.error('[Fetch Models] Error:', error);
    
    // Check if this is a local/private network server
    const isLocalServer = config.endpoint && (
      config.endpoint.includes('localhost') ||
      config.endpoint.includes('127.') ||
      config.endpoint.includes('192.168.') ||
      config.endpoint.includes('10.') ||
      config.endpoint.includes('172.')
    );
    
    // Check if trying to use HTTP from HTTPS page (mixed content)
    const isHttpEndpoint = config.endpoint?.startsWith('http://');
    const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isMixedContent = isHttpEndpoint && isHttpsPage;
    
    if (error instanceof Error && error.name === 'AbortError') {
      // Timeout - often caused by mixed content blocking
      if (isMixedContent && isLocalServer) {
        return { 
          success: false, 
          error: 'Mixed content blocked: Cannot fetch from HTTP endpoint while on HTTPS page. Browser security prevents this. Please enter the model name manually (e.g., llama3, qwen2.5-coder, mistral).'
        };
      }
      return { success: false, error: 'Request timed out. Check if the endpoint is reachable.' };
    }
    
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      // CORS or network error - provide helpful guidance
      if (isMixedContent) {
        return { 
          success: false, 
          error: 'Mixed content blocked: Cannot fetch from HTTP endpoint while on HTTPS page. Use HTTPS for your LLM server, or enter the model name manually.'
        };
      }
      if (config.provider === 'ollama') {
        return { 
          success: false, 
          error: 'Cannot connect to Ollama server. Please ensure: (1) Ollama is running, (2) CORS enabled: OLLAMA_ORIGINS=* ollama serve'
        };
      } else if (isLocalServer) {
        return { 
          success: false, 
          error: 'Cannot connect to local LLM server. Please ensure: (1) Server is running, (2) CORS is enabled, (3) Use HTTPS or enter model name manually'
        };
      } else {
        // Cloud API (OpenAI, NVIDIA, Groq, etc.) - CORS blocks browser requests
        const isNvidia = config.endpoint?.includes('nvidia.com');
        const isOpenAI = config.endpoint?.includes('openai.com');
        const isGroq = config.endpoint?.includes('groq.com');
        const isAnthropic = config.endpoint?.includes('anthropic.com');
        
        let providerHint = '';
        if (isNvidia) {
          providerHint = 'NVIDIA NIM API does not support browser requests (CORS). ';
        } else if (isOpenAI) {
          providerHint = 'OpenAI API does not support browser requests (CORS). ';
        } else if (isGroq) {
          providerHint = 'Groq API does not support browser requests (CORS). ';
        } else if (isAnthropic) {
          providerHint = 'Anthropic API does not support browser requests (CORS). ';
        }
        
        return { 
          success: false, 
          error: `${providerHint}Please enter the model name manually. For NVIDIA: meta/llama-3.1-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct. For OpenAI: gpt-4o, gpt-4-turbo.`
        };
      }
    }
    
    // Categorize errors with user-friendly messages
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      
      // Network/connectivity issues
      if (msg.includes('network') || msg.includes('internet') || msg.includes('offline')) {
        return { success: false, error: 'Unable to connect. Please check your internet connection and try again.' };
      }
      
      // DNS/hostname issues
      if (msg.includes('dns') || msg.includes('hostname') || msg.includes('not found') || msg.includes('getaddrinfo')) {
        return { success: false, error: 'Could not find the server. Please verify the endpoint URL is correct.' };
      }
      
      // SSL/TLS certificate issues
      if (msg.includes('ssl') || msg.includes('certificate') || msg.includes('cert')) {
        return { success: false, error: 'Secure connection failed. The server may have an invalid certificate.' };
      }
      
      // Timeout
      if (msg.includes('timeout') || msg.includes('timed out')) {
        return { success: false, error: 'The server took too long to respond. Please try again or check if the service is running.' };
      }
      
      // Authentication errors
      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('authentication')) {
        return { success: false, error: 'Authentication failed. Please check your API key is correct.' };
      }
      
      // Permission/access errors
      if (msg.includes('403') || msg.includes('forbidden') || msg.includes('access denied')) {
        return { success: false, error: 'Access denied. Your API key may not have permission for this operation.' };
      }
      
      // Rate limiting
      if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
        return { success: false, error: 'Too many requests. Please wait a moment and try again.' };
      }
      
      // Server errors
      if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
        return { success: false, error: 'The server encountered an error. Please try again later.' };
      }
      
      // Return the actual error message if it's descriptive enough
      if (error.message.length > 10 && !msg.includes('error')) {
        return { success: false, error: error.message };
      }
    }
    
    return { success: false, error: 'Connection failed. Please verify your settings and try again.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Font size options
export type FontSizeOption = 'small' | 'medium' | 'large';

// Color theme options
export type ColorTheme = 'sunset' | 'ocean' | 'forest' | 'berry' | 'mono';

// Thinking dot style options
export type ThinkingDotStyle = 'bounce' | 'pulse' | 'wave' | 'fade' | 'orbit';

// BYOM (Bring Your Own Model) types
export type LLMProvider = 'openai' | 'azure-openai' | 'ollama' | 'power-automate';

// Azure AD authentication type
export type AzureAuthType = 'api-key' | 'service-principal';

// Agent Framework type - which AI backend to use
export type AgentFramework = 'copilot-studio' | 'local-agent';

export const agentFrameworkLabels: Record<AgentFramework, { zh: string; en: string; description: { zh: string; en: string } }> = {
  'copilot-studio': {
    zh: 'Copilot Studio',
    en: 'Copilot Studio',
    description: { zh: '使用 Microsoft Copilot Studio 作为智能助手', en: 'Use Microsoft Copilot Studio as the AI assistant' }
  },
  'local-agent': {
    zh: '前端轻量级框架',
    en: 'Local Lightweight Agent',
    description: { zh: '使用 BYOM 配置的 LLM 进行本地 Function Calling', en: 'Use BYOM-configured LLM for local Function Calling' }
  },
};


export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  endpoint?: string;
  deploymentName?: string; // For Azure OpenAI
  model?: string;
  enabled: boolean;
  // Azure AD Service Principal authentication
  azureAuthType?: AzureAuthType;
  azureTenantId?: string;
  azureClientId?: string;
  azureClientSecret?: string;
}

// Cached Azure AD token
interface CachedAzureToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

let cachedAzureToken: CachedAzureToken | null = null;

/**
 * Get Azure AD access token using client credentials flow
 * Caches token until 5 minutes before expiry
 */
export async function getAzureADToken(config: LLMConfig): Promise<string> {
  // Check if we have a valid cached token
  if (cachedAzureToken && cachedAzureToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    console.log('[Azure AD] Using cached token');
    return cachedAzureToken.accessToken;
  }

  if (!config.azureTenantId || !config.azureClientId || !config.azureClientSecret) {
    throw new Error('Azure AD credentials not configured');
  }

  console.log('[Azure AD] Fetching new token...');
  
  const tokenUrl = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
  
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.azureClientId,
    client_secret: config.azureClientSecret,
    scope: 'https://cognitiveservices.azure.com/.default',
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch (fetchError) {
    // CORS error - Azure AD token endpoint doesn't allow browser requests
    console.error('[Azure AD] Fetch error (likely CORS):', fetchError);
    throw new Error(
      'Azure AD Service Principal authentication cannot be used directly from a browser due to CORS restrictions. ' +
      'The Azure AD token endpoint (login.microsoftonline.com) does not allow cross-origin requests. ' +
      'Please use API Key authentication instead, or deploy a backend proxy to handle the token exchange.'
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Azure AD token request failed: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  
  // Cache the token
  cachedAzureToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log('[Azure AD] Token acquired, expires in', data.expires_in, 'seconds');
  return data.access_token;
}

/**
 * Clear the cached Azure AD token
 */
export function clearAzureADTokenCache(): void {
  cachedAzureToken = null;
}

export interface FontSizeConfig {
  chat: FontSizeOption;
  ui: FontSizeOption;
}

// Font size CSS variable values (in rem)
const fontSizeValues = {
  small: {
    title: '0.875rem',   // 14px
    body: '0.8125rem',   // 13px
    helper: '0.75rem',   // 12px
  },
  medium: {
    title: '1rem',        // 16px
    body: '0.875rem',    // 14px
    helper: '0.8125rem', // 13px
  },
  large: {
    title: '1.125rem',   // 18px
    body: '1rem',        // 16px
    helper: '0.875rem',  // 14px
  },
} as const;

const fontSizeClasses = {
  small: {
    chat: 'text-sm',
    ui: 'text-xs',
  },
  medium: {
    chat: 'text-base',
    ui: 'text-sm',
  },
  large: {
    chat: 'text-lg',
    ui: 'text-base',
  },
} as const;

// Root font-size in px per UI size — scales ALL rem-based sizes
// (including Tailwind text-xs/sm/base/lg) so the setting actually
// propagates to every page, not just `.text-title/.text-body/.text-helper`.
const rootFontSizePx = {
  small: '14px',
  medium: '16px',
  large: '18px',
} as const;

// Apply font size CSS variables to the document
export function applyFontSizeToDocument(config: FontSizeConfig): void {
  const root = document.documentElement;
  const uiSizes = fontSizeValues[config.ui];

  root.style.setProperty('--scm-font-title', uiSizes.title);
  root.style.setProperty('--scm-font-body', uiSizes.body);
  root.style.setProperty('--scm-font-helper', uiSizes.helper);

  // Scale the entire UI by adjusting the root font-size, so every
  // rem-based size (including Tailwind utilities) follows the setting.
  root.style.fontSize = rootFontSizePx[config.ui];
}

// Initialize font size from localStorage (call on app startup)
export function initFontSize(): void {
  const config = getFontSizeConfig();
  applyFontSizeToDocument(config);
}

export function getFontSizeConfig(): FontSizeConfig {
  const saved = localStorage.getItem('fontSizeConfig');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // Invalid JSON, use defaults
    }
  }
  return { chat: 'small', ui: 'medium' };
}

export function setFontSizeConfig(config: FontSizeConfig): void {
  localStorage.setItem('fontSizeConfig', JSON.stringify(config));
  // Apply CSS variables immediately for real-time update
  applyFontSizeToDocument(config);
  window.dispatchEvent(new CustomEvent('fontsize-changed', { detail: config }));
}

export function getChatFontClass(): string {
  const config = getFontSizeConfig();
  return fontSizeClasses[config.chat].chat;
}

export function getUIFontClass(): string {
  const config = getFontSizeConfig();
  return fontSizeClasses[config.ui].ui;
}

// Color theme management
export function getColorTheme(): ColorTheme {
  const saved = localStorage.getItem('colorTheme');
  if (saved && ['sunset', 'ocean', 'forest', 'berry', 'mono'].includes(saved)) {
    return saved as ColorTheme;
  }
  return 'sunset'; // Default to sunset (orange) theme
}

export function setColorTheme(theme: ColorTheme): void {
  localStorage.setItem('colorTheme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new CustomEvent('colortheme-changed', { detail: theme }));
}

export function initColorTheme(): void {
  const theme = getColorTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

// Thinking dot style management
export function getThinkingDotStyle(): ThinkingDotStyle {
  const saved = localStorage.getItem('thinkingDotStyle');
  if (saved && ['bounce', 'pulse', 'wave', 'fade', 'orbit'].includes(saved)) {
    return saved as ThinkingDotStyle;
  }
  return 'pulse';
}

export function setThinkingDotStyle(style: ThinkingDotStyle): void {
  localStorage.setItem('thinkingDotStyle', style);
  window.dispatchEvent(new CustomEvent('thinkingdotstyle-changed', { detail: style }));
}

export const thinkingDotStyleLabels: Record<ThinkingDotStyle, { zh: string; en: string; de: string; fr: string; es: string }> = {
  bounce: { zh: '弹跳', en: 'Bounce', de: 'Springen', fr: 'Rebond', es: 'Rebote' },
  pulse: { zh: '脉冲', en: 'Pulse', de: 'Puls', fr: 'Pulsation', es: 'Pulso' },
  wave: { zh: '波浪', en: 'Wave', de: 'Welle', fr: 'Vague', es: 'Onda' },
  fade: { zh: '渐隐', en: 'Fade', de: 'Verblassen', fr: 'Fondu', es: 'Desvanecer' },
  orbit: { zh: '环绕', en: 'Orbit', de: 'Orbit', fr: 'Orbite', es: 'Órbita' },
};

export const colorThemeLabels: Record<ColorTheme, { zh: string; en: string; de: string; fr: string; es: string; colors: [string, string] }> = {
  sunset: { zh: '日落橙', en: 'Sunset', de: 'Sonnenuntergang', fr: 'Coucher de soleil', es: 'Atardecer', colors: ['#FF7A00', '#0D8F8C'] },
  ocean: { zh: '海洋蓝', en: 'Ocean', de: 'Ozean', fr: 'Océan', es: 'Océano', colors: ['#0EA5E9', '#8B5CF6'] },
  forest: { zh: '森林绿', en: 'Forest', de: 'Wald', fr: 'Forêt', es: 'Bosque', colors: ['#22C55E', '#F97316'] },
  berry: { zh: '浆果粉', en: 'Berry', de: 'Beere', fr: 'Baie', es: 'Baya', colors: ['#EC4899', '#6366F1'] },
  mono: { zh: '极简灰', en: 'Monochrome', de: 'Monochrom', fr: 'Monochrome', es: 'Monocromo', colors: ['#71717A', '#18181B'] },
};

// Voice options per locale
export const voiceOptions: VoiceOption[] = [
  // Chinese voices
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', tier: 'natural', locale: 'zh-Hans', gender: 'female' },
  { id: 'zh-CN-YunxiNeural', name: '云希', tier: 'natural', locale: 'zh-Hans', gender: 'male' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', tier: 'premium', locale: 'zh-Hans', gender: 'female' },
  { id: 'zh-CN-YunjianNeural', name: '云健', tier: 'premium', locale: 'zh-Hans', gender: 'male' },
  // English voices
  { id: 'en-US-JennyNeural', name: 'Jenny', tier: 'natural', locale: 'en-US', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy', tier: 'natural', locale: 'en-US', gender: 'male' },
  { id: 'en-US-AriaNeural', name: 'Aria', tier: 'premium', locale: 'en-US', gender: 'female' },
  { id: 'en-US-DavisNeural', name: 'Davis', tier: 'premium', locale: 'en-US', gender: 'male' },
];

export function getVoicesForLocale(locale: Locale): VoiceOption[] {
  return voiceOptions.filter((v: VoiceOption) => v.locale === locale);
}

// Get selected system voice name (stores actual system voice name, not Azure ID)
export function getSelectedSystemVoiceName(): string | null {
  return localStorage.getItem('systemVoiceName');
}

export function setSelectedSystemVoiceName(voiceName: string): void {
  localStorage.setItem('systemVoiceName', voiceName);
  window.dispatchEvent(new CustomEvent('systemvoice-changed', { detail: voiceName }));
}

export function getSelectedVoice(): VoiceId {
  return localStorage.getItem('voice') || 'zh-CN-XiaoxiaoNeural';
}

export function setSelectedVoice(voiceId: VoiceId): void {
  localStorage.setItem('voice', voiceId);
  window.dispatchEvent(new CustomEvent('voice-changed', { detail: voiceId }));
}

// Extract voice name from voice ID for matching with system voices
// e.g., 'zh-CN-XiaoxiaoNeural' -> 'Xiaoxiao'
export function extractVoiceName(voiceId: VoiceId): string {
  return voiceId.replace(/.*-([A-Za-z]+)Neural$/, '$1');
}

// Get voice option by ID
export function getVoiceOption(voiceId: VoiceId): VoiceOption | undefined {
  return voiceOptions.find((v: VoiceOption) => v.id === voiceId);
}

// Get system voice by name - returns exact match
export function getSystemVoiceByName(voiceName: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v: SpeechSynthesisVoice) => v.name === voiceName) || null;
}

// Get available system voices for a locale
export function getSystemVoicesForLocale(locale: Locale): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = localeLangPrefix(locale);
  return voices.filter((v: SpeechSynthesisVoice) => 
    v.lang.toLowerCase().startsWith(langPrefix)
  );
}

// Find matching system voice based on selected voice ID and locale
// Priority: 1. Saved system voice name, 2. Azure name match, 3. Pattern mapping, 4. Gender match, 5. First voice
export function findMatchingSystemVoice(voiceId: VoiceId, locale: Locale): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const langPrefix = localeLangPrefix(locale);
  
  // Filter voices by language first
  const langVoices = voices.filter((v: SpeechSynthesisVoice) => 
    v.lang.toLowerCase().startsWith(langPrefix)
  );
  
  if (langVoices.length === 0) {
    console.log('[Voice Match] No voices for this language, using first available');
    return voices[0] || null;
  }

  // Priority 0: Check if user has saved a specific system voice name
  const savedSystemVoiceName = getSelectedSystemVoiceName();
  if (savedSystemVoiceName) {
    const savedVoice = langVoices.find((v: SpeechSynthesisVoice) => v.name === savedSystemVoiceName);
    if (savedVoice) {
      console.log(`[Voice Match] Using saved system voice: ${savedVoice.name}`);
      return savedVoice;
    }
  }

  const voiceName = extractVoiceName(voiceId);
  const voiceOption = getVoiceOption(voiceId);
  const targetGender = voiceOption?.gender;
  
  // Debug: Log all available voices for this language
  console.log(`[Voice Match] Looking for voice: ${voiceId} (name: ${voiceName}, gender: ${targetGender})`);
  console.log(`[Voice Match] Available ${langPrefix} voices:`, langVoices.map((v: SpeechSynthesisVoice) => `${v.name} (${v.lang})`));

  // Priority 1: Try exact name match (Edge/Windows uses 'Microsoft Xiaoxiao Online' format)
  let matchingVoice = langVoices.find((v: SpeechSynthesisVoice) => 
    v.name.toLowerCase().includes(voiceName.toLowerCase())
  );
  
  if (matchingVoice) {
    console.log(`[Voice Match] Found exact match: ${matchingVoice.name}`);
    return matchingVoice;
  }
  
  // Priority 2: Map Azure voice names to common browser voice patterns
  // Azure voices may not exist in browser, but we can find similar voices
  const voiceMapping: Record<string, string[]> = {
    // Chinese female voices
    'Xiaoxiao': ['xiaoxiao', 'huihui', 'yaoyao', 'kangkang', 'female', 'woman'],
    'Xiaoyi': ['xiaoyi', 'huihui', 'yaoyao', 'female', 'woman'],
    // Chinese male voices
    'Yunxi': ['yunxi', 'kangkang', 'male', 'man'],
    'Yunjian': ['yunjian', 'kangkang', 'male', 'man'],
    // English female voices
    'Jenny': ['jenny', 'zira', 'hazel', 'susan', 'samantha', 'female', 'woman'],
    'Aria': ['aria', 'zira', 'hazel', 'female', 'woman'],
    // English male voices
    'Guy': ['guy', 'david', 'mark', 'male', 'man'],
    'Davis': ['davis', 'david', 'mark', 'male', 'man'],
  };
  
  const mappingPatterns = voiceMapping[voiceName] || [];
  for (const pattern of mappingPatterns) {
    matchingVoice = langVoices.find((v: SpeechSynthesisVoice) => 
      v.name.toLowerCase().includes(pattern)
    );
    if (matchingVoice) {
      console.log(`[Voice Match] Found mapping match '${pattern}': ${matchingVoice.name}`);
      return matchingVoice;
    }
  }
  
  // Priority 3: Try to match by gender if we know the target gender
  if (targetGender) {
    const femalePatterns = ['female', 'woman', 'huihui', 'yaoyao', 'lili', 'zira', 'hazel', 'susan', 'samantha', 'ting-ting', 'mei-jia', 'sin-ji'];
    const malePatterns = ['male', 'man', 'kangkang', 'david', 'mark', 'alex', 'daniel'];
    
    matchingVoice = langVoices.find((v: SpeechSynthesisVoice) => {
      const nameLower = v.name.toLowerCase();
      const isFemaleVoice = femalePatterns.some((p: string) => nameLower.includes(p));
      const isMaleVoice = malePatterns.some((p: string) => nameLower.includes(p));
      
      if (targetGender === 'female' && isFemaleVoice) return true;
      if (targetGender === 'male' && isMaleVoice) return true;
      return false;
    });
    
    if (matchingVoice) {
      console.log(`[Voice Match] Found gender match (${targetGender}): ${matchingVoice.name}`);
      return matchingVoice;
    }
  }
  
  // Priority 4: Return first voice for the locale
  console.log(`[Voice Match] No specific match found, using first ${langPrefix} voice: ${langVoices[0]?.name}`);
  return langVoices[0] || null;
}

// Auto-play agent response setting
export function getAutoPlayAgentResponse(): boolean {
  return localStorage.getItem('autoPlayAgentResponse') === 'true';
}

export function setAutoPlayAgentResponse(enabled: boolean): void {
  localStorage.setItem('autoPlayAgentResponse', String(enabled));
  window.dispatchEvent(new CustomEvent('autoplay-changed', { detail: enabled }));
}

// BYOM (Bring Your Own Model) settings
export function getLLMConfig(): LLMConfig | null {
  const saved = localStorage.getItem('llmConfig');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  return null;
}

export function setLLMConfig(config: LLMConfig | null): void {
  if (config) {
    localStorage.setItem('llmConfig', JSON.stringify(config));
  } else {
    localStorage.removeItem('llmConfig');
  }
  window.dispatchEvent(new CustomEvent('llmconfig-changed', { detail: config }));
}

// Agent framework settings
export function getAgentFramework(): AgentFramework {
  const saved = localStorage.getItem('agentFramework');
  if (saved && ['copilot-studio', 'local-agent'].includes(saved)) {
    return saved as AgentFramework;
  }
  // Default to local-agent if LLM is configured (flow via SDK connector), otherwise copilot-studio
  const llmConfig = getLLMConfig();
  if (llmConfig?.enabled) {
    return 'local-agent';
  }
  return 'copilot-studio';
}

export function setAgentFramework(framework: AgentFramework): void {
  localStorage.setItem('agentFramework', framework);
  window.dispatchEvent(new CustomEvent('agentframework-changed', { detail: framework }));
}

export const llmProviderLabels: Record<LLMProvider, { zh: string; en: string; description: { zh: string; en: string } }> = {
  'openai': { 
    zh: 'OpenAI 兼容', 
    en: 'OpenAI Compatible',
    description: { zh: '支持 OpenAI API 格式的服务', en: 'Services compatible with OpenAI API format' }
  },
  'azure-openai': { 
    zh: 'Azure OpenAI', 
    en: 'Azure OpenAI',
    description: { zh: 'Microsoft Azure 托管的 OpenAI 服务', en: 'OpenAI service hosted on Microsoft Azure' }
  },
  'ollama': { 
    zh: 'Ollama', 
    en: 'Ollama',
    description: { zh: '本地运行的开源模型', en: 'Locally running open source models' }
  },
  'power-automate': { 
    zh: 'Power Automate Flow', 
    en: 'Power Automate Flow',
    description: { zh: '通过 Power Automate 流调用 Azure OpenAI（推荐）', en: 'Invoke Azure OpenAI via Power Automate flow (Recommended)' }
  },
};

// Test BYOM connection
export interface BYOMTestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
  modelInfo?: string;
}

export async function testBYOMConnection(config: LLMConfig): Promise<BYOMTestResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 8000); // 8 second timeout
  
  try {
    // Power Automate uses SDK connector — no endpoint needed
    if (config.provider === 'power-automate') {
      console.log('[BYOM Test] Power Automate Flow via SDK connector');
      clearTimeout(timeoutId);
      const result = await testFlowConnection();
      if (result.success) {
        return { success: true, latencyMs: result.latencyMs, modelInfo: 'Power Automate Flow' };
      } else {
        return { success: false, error: result.error || 'Flow test failed', latencyMs: result.latencyMs };
      }
    }

    if (!config.endpoint) {
      return { success: false, error: 'Endpoint is required' };
    }

    // Normalize endpoint - remove trailing slash
    const baseEndpoint = config.endpoint.replace(/\/+$/, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.provider === 'ollama') {
      // Ollama: Test with /api/tags endpoint to list models
      const url = `${baseEndpoint}/api/tags`;
      console.log('[BYOM Test] Ollama URL:', url);
      
      const response = await fetch(url, { 
        method: 'GET', 
        headers,
        mode: 'cors',
        signal: controller.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }
      
      let data: Record<string, unknown>;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('[BYOM Test] Ollama JSON parse error:', jsonError);
        return { success: false, error: 'Invalid JSON response from Ollama. Ensure the server is running correctly.' };
      }
      const latencyMs = Date.now() - startTime;
      const modelsArray = data.models as Array<unknown> | undefined;
      const modelCount = modelsArray?.length || 0;
      
      return { success: true, latencyMs, modelInfo: `${modelCount} model(s) available` };
    } else if (config.provider === 'azure-openai') {
      if (!config.deploymentName) return { success: false, error: 'Deployment name is required' };
      
      // Determine authentication method
      const useServicePrincipal = config.azureAuthType === 'service-principal';
      
      if (useServicePrincipal) {
        // Service Principal authentication
        if (!config.azureTenantId) return { success: false, error: 'Tenant ID is required for Service Principal auth' };
        if (!config.azureClientId) return { success: false, error: 'Client ID is required for Service Principal auth' };
        if (!config.azureClientSecret) return { success: false, error: 'Client Secret is required for Service Principal auth' };
        
        // Get Azure AD token
        console.log('[BYOM Test] Using Service Principal authentication');
        const accessToken = await getAzureADToken(config);
        headers['Authorization'] = `Bearer ${accessToken}`;
      } else {
        // API Key authentication
        if (!config.apiKey) return { success: false, error: 'API Key is required' };
        headers['api-key'] = config.apiKey;
      }
      
      // Azure OpenAI: /openai/deployments/{deployment}/chat/completions
      const url = `${baseEndpoint}/openai/deployments/${config.deploymentName}/chat/completions?api-version=2024-12-01-preview`;
      console.log('[BYOM Test] Azure OpenAI URL:', url);
      
      const body = JSON.stringify({ 
        messages: [{ role: 'user', content: 'Hi' }]
      });
      
      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }
      
      return { success: true, latencyMs: Date.now() - startTime, modelInfo: config.deploymentName };
    } else if (config.provider === 'openai') {
      // OpenAI Compatible: /v1/chat/completions or /chat/completions
      if (!config.apiKey) return { success: false, error: 'API Key is required' };
      
      // Auto-detect endpoint format - add /v1 if it looks like OpenAI base URL
      let url = baseEndpoint;
      if (!url.includes('/v1') && !url.endsWith('/chat/completions')) {
        url = `${baseEndpoint}/v1/chat/completions`;
      } else if (!url.endsWith('/chat/completions')) {
        url = `${baseEndpoint}/chat/completions`;
      }
      console.log('[BYOM Test] OpenAI Compatible URL:', url);
      
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      const body = JSON.stringify({ 
        model: config.model || 'gpt-3.5-turbo', 
        messages: [{ role: 'user', content: 'Hi' }]
      });
      
      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }
      
      let data: Record<string, unknown>;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('[BYOM Test] OpenAI Compatible JSON parse error:', jsonError);
        return { success: false, error: 'Invalid JSON response from API endpoint. Check endpoint URL and model configuration.' };
      }
      return { success: true, latencyMs: Date.now() - startTime, modelInfo: (data.model as string) || config.model };
    } else {
      return { success: false, error: `Unknown provider: ${config.provider}` };
    }
  } catch (error: unknown) {
    console.error('[BYOM Test] Error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Check if the endpoint is reachable.' };
    }
    
    // Provide more helpful error messages
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      const provider = config.provider;
      let hint = '';
      
      if (provider === 'ollama') {
        hint = '\n\nFor local LLM servers (Ollama, MLX, oMLX, LM Studio): Ensure CORS is enabled. For Ollama: OLLAMA_ORIGINS=* ollama serve. For MLX/oMLX: use --cors flag. For LM Studio: enable CORS in settings.';
      } else if (provider === 'openai') {
        hint = '\n\nOpenAI API cannot be called directly from the browser due to CORS. Please enter your model name manually.';
      } else if (provider === 'azure-openai') {
        hint = '\n\nCheck that your Azure OpenAI resource has CORS enabled for this domain.';
      }
      
      return { 
        success: false, 
        error: `Connection failed. The endpoint may be unreachable, blocked by CORS, or the URL is incorrect.${hint}` 
      };
    }
    
    // Categorize errors with user-friendly messages
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      
      // Timeout
      if (msg.includes('timeout') || msg.includes('timed out')) {
        return { success: false, error: 'The server took too long to respond. Please try again.' };
      }
      
      // Authentication errors
      if (msg.includes('401') || msg.includes('unauthorized')) {
        return { success: false, error: 'Authentication failed. Please check your API key.' };
      }
      
      // Server errors
      if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
        return { success: false, error: 'The server is temporarily unavailable. Please try again later.' };
      }
      
      // If message is descriptive, use it
      if (error.message.length > 10) {
        return { success: false, error: error.message };
      }
    }
    
    return { success: false, error: 'Unable to generate summary. Please check your LLM settings and try again.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Generate voice summary using BYOM LLM
export interface VoiceSummaryResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export async function generateVoiceSummary(
  content: string, 
  locale: Locale, 
  customSystemPrompt?: string,
  llmConfigOverride?: LLMConfig,
  timeoutMs?: number,
  responseFormat?: 'text' | 'json'
): Promise<VoiceSummaryResult> {
  const config = llmConfigOverride || getLLMConfig();
  
  if (!config || !config.enabled) {
    return { success: false, error: 'LLM not configured or disabled' };
  }
  
  const systemPrompt = customSystemPrompt || ((locale === 'zh-Hans'
    ? '你是一个助手，负责将内容总结为简短的语音播报。请用简洁自然的中文口语风格，概括主要信息，不超过3句话。'
    : 'You are an assistant that summarizes content into brief voice announcements. Use concise, natural spoken language, summarizing key information in no more than 3 sentences.')
    + `\n\n${outputLanguageDirective(locale)}`);
  
  // When a custom system prompt is provided, pass content directly as user message
  // (don't wrap in "voice announcement" framing which conflicts with JSON/analysis prompts)
  const userPrompt = customSystemPrompt
    ? content
    : (locale === 'zh-Hans'
      ? `请将以下内容总结为简短的语音播报：\n\n${content}`
      : `Please summarize the following content into a brief voice announcement:\n\n${content}`);

  // Power Automate uses SDK connector — no endpoint needed
  if (config.provider === 'power-automate') {
    console.log('[Voice Summary] Using Power Automate Flow');
    
    const result = await invokeFlowForLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      responseFormat: responseFormat,
    });
    
    if (result.success && result.content) {
      console.log('[Voice Summary] Generated via Power Automate:', result.content.trim());
      return { success: true, summary: result.content.trim() };
    } else {
      return { success: false, error: result.error || 'No content in flow response' };
    }
  }

  // Non-power-automate providers need an endpoint
  if (!config.endpoint) {
    return { success: false, error: 'Endpoint not configured' };
  }
  
  // Normalize endpoint - remove trailing slash
  const baseEndpoint = config.endpoint.replace(/\/+$/, '');
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    let url: string;
    let body: string;
    
    if (config.provider === 'ollama') {
      // Ollama: /api/chat
      url = `${baseEndpoint}/api/chat`;
      body = JSON.stringify({
        model: config.model || 'llama2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        options: {
        }
      });
    } else if (config.provider === 'azure-openai') {
      if (!config.deploymentName) {
        return { success: false, error: 'Azure OpenAI requires deployment name' };
      }
      
      // Determine authentication method
      const useServicePrincipal = config.azureAuthType === 'service-principal';
      
      if (useServicePrincipal) {
        // Service Principal authentication
        if (!config.azureTenantId || !config.azureClientId || !config.azureClientSecret) {
          return { success: false, error: 'Azure AD credentials (Tenant ID, Client ID, Client Secret) are required' };
        }
        const accessToken = await getAzureADToken(config);
        headers['Authorization'] = `Bearer ${accessToken}`;
      } else {
        // API Key authentication
        if (!config.apiKey) {
          return { success: false, error: 'API key is required' };
        }
        headers['api-key'] = config.apiKey;
      }
      
      // Azure OpenAI: /openai/deployments/{deployment}/chat/completions
      url = `${baseEndpoint}/openai/deployments/${config.deploymentName}/chat/completions?api-version=2024-12-01-preview`;
      body = JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
    } else {
      // OpenAI compatible
      if (!config.apiKey) {
        return { success: false, error: 'API key is required' };
      }
      // Auto-detect endpoint format - add /v1 if it looks like OpenAI base URL
      url = baseEndpoint;
      if (!url.includes('/v1') && !url.endsWith('/chat/completions')) {
        url = `${baseEndpoint}/v1/chat/completions`;
      } else if (!url.endsWith('/chat/completions')) {
        url = `${baseEndpoint}/chat/completions`;
      }
      
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = JSON.stringify({
        model: config.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
    }
    
    console.log('[Voice Summary] Calling LLM:', url);
    
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || 60000);
    
    try {
      response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('[Voice Summary] Request timed out');
        return { success: false, error: 'Request timed out - LLM endpoint took too long to respond' };
      }
      console.error('[Voice Summary] Fetch error:', fetchError);
      return { success: false, error: 'Network error - LLM endpoint unreachable or blocked by CORS' };
    }
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return { success: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
    }
    
    // Parse JSON response with error handling
    let data: Record<string, unknown>;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('[Voice Summary] JSON parse error:', jsonError);
      // Try to get raw text for debugging
      let rawText = '';
      try {
        // Clone response since json() already consumed it - just log the error
        rawText = 'Response was not valid JSON';
      } catch {
        rawText = 'Could not read response';
      }
      console.error('[Voice Summary] Raw response issue:', rawText);
      return { success: false, error: 'Invalid JSON response from LLM endpoint. Check model configuration.' };
    }
    
    // Extract summary from response
    let summary: string;
    if (config.provider === 'ollama') {
      const message = data.message as Record<string, unknown> | undefined;
      summary = (message?.content as string) || '';
    } else {
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      summary = choices?.[0]?.message?.content || '';
    }
    
    if (!summary.trim()) {
      return { success: false, error: 'Empty response from LLM' };
    }
    
    console.log('[Voice Summary] Generated:', summary.trim());
    return { success: true, summary: summary.trim() };
  } catch (error: unknown) {
    console.error('[Voice Summary] Error:', error);
    
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      return { success: false, error: 'Network error - LLM endpoint unreachable or blocked by CORS' };
    }
    
    // Provide user-friendly error message
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      
      if (msg.includes('timeout')) {
        return { success: false, error: 'Request timed out. Please try again.' };
      }
      if (msg.includes('401') || msg.includes('unauthorized')) {
        return { success: false, error: 'Authentication failed. Please check your API key.' };
      }
      if (error.message.length > 10) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Unable to generate summary. Please check your settings and try again.' };
  }
}

export function getVoiceSummaryEnabled(): boolean {
  return localStorage.getItem('voiceSummaryEnabled') !== 'false'; // default true
}

export function setVoiceSummaryEnabled(enabled: boolean): void {
  localStorage.setItem('voiceSummaryEnabled', String(enabled));
  window.dispatchEvent(new CustomEvent('voicesummary-changed', { detail: enabled }));
}

// Copilot in all screens setting
export function getCopilotInAllScreens(): boolean {
  return localStorage.getItem('copilotInAllScreens') !== 'false'; // default true
}

export function setCopilotInAllScreens(enabled: boolean): void {
  localStorage.setItem('copilotInAllScreens', String(enabled));
  window.dispatchEvent(new CustomEvent('copilotinallscreens-changed', { detail: enabled }));
}

// Copilot record list display settings
export type CopilotListDefaultView = 'expanded' | 'collapsed';

export function getCopilotListDefaultView(): CopilotListDefaultView {
  return localStorage.getItem('copilotListDefaultView') === 'collapsed' ? 'collapsed' : 'expanded';
}

export function setCopilotListDefaultView(view: CopilotListDefaultView): void {
  localStorage.setItem('copilotListDefaultView', view);
  window.dispatchEvent(new CustomEvent('copilot-list-default-view-changed', { detail: view }));
}

export function getCopilotListTopN(): number {
  const raw = localStorage.getItem('copilotListTopN');
  const parsed = Number.parseInt(raw ?? '', 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 50) {
    return parsed;
  }
  return 3;
}

export function setCopilotListTopN(topN: number): void {
  const normalized = Math.min(50, Math.max(1, Math.floor(topN)));
  localStorage.setItem('copilotListTopN', String(normalized));
  window.dispatchEvent(new CustomEvent('copilot-list-top-n-changed', { detail: normalized }));
}

// Copilot dock layout setting (widescreen only)
export type CopilotDockLayout = 'float' | 'right' | 'left';
export const copilotDockLayoutLabels: Record<CopilotDockLayout, { zh: string; en: string; de: string; fr: string; es: string }> = {
  float: { zh: '浮动', en: 'Float', de: 'Schwebend', fr: 'Flottant', es: 'Flotante' },
  right: { zh: '右侧', en: 'Right', de: 'Rechts', fr: 'Droite', es: 'Derecha' },
  left:  { zh: '左侧', en: 'Left', de: 'Links', fr: 'Gauche', es: 'Izquierda' },
};

export function getCopilotDockLayout(): CopilotDockLayout {
  const v = localStorage.getItem('copilotDockLayout');
  if (v === 'right' || v === 'left') return v;
  return 'float';
}

export function setCopilotDockLayout(layout: CopilotDockLayout): void {
  localStorage.setItem('copilotDockLayout', layout);
  window.dispatchEvent(new CustomEvent('copilot-dock-layout-changed', { detail: layout }));
}

// Week start day setting
export type WeekStartDay = 'sunday' | 'monday';

export function getWeekStartDay(): WeekStartDay {
  return localStorage.getItem('weekStartDay') === 'monday' ? 'monday' : 'sunday';
}

export function setWeekStartDay(day: WeekStartDay): void {
  localStorage.setItem('weekStartDay', day);
  window.dispatchEvent(new CustomEvent('weekstartday-changed', { detail: day }));
}

// Copilot fullscreen by default (mobile)
export function getCopilotFullscreenDefault(): boolean {
  return localStorage.getItem('copilotFullscreenDefault') === 'true';
}

export function setCopilotFullscreenDefault(enabled: boolean): void {
  localStorage.setItem('copilotFullscreenDefault', String(enabled));
  window.dispatchEvent(new CustomEvent('copilotfullscreendefault-changed', { detail: enabled }));
}

// Compact draft forms — denser layout (inline labels, tighter spacing) for the
// Copilot draft/confirm cards.
export function getCompactDraftForms(): boolean {
  return localStorage.getItem('compactDraftForms') === 'true';
}

export function setCompactDraftForms(enabled: boolean): void {
  localStorage.setItem('compactDraftForms', String(enabled));
  window.dispatchEvent(new CustomEvent('compactdraftforms-changed', { detail: enabled }));
}

// Agenda default expanded on home page
export function getAgendaDefaultExpanded(): boolean {
  return localStorage.getItem('agendaDefaultExpanded') !== 'false'; // default true
}

export function setAgendaDefaultExpanded(enabled: boolean): void {
  localStorage.setItem('agendaDefaultExpanded', String(enabled));
}

// Simulate streaming response setting
export function getSimulateStreaming(): boolean {
  return localStorage.getItem('simulateStreaming') !== 'false'; // default true
}

export function setSimulateStreaming(enabled: boolean): void {
  localStorage.setItem('simulateStreaming', String(enabled));
  window.dispatchEvent(new CustomEvent('simulatestreaming-changed', { detail: enabled }));
}

// Debug mode setting — gates developer-only UI (e.g. the Frame shadow log icon
// on the Copilot panel). Default off so end users never see debug affordances.
export function getDebugMode(): boolean {
  return localStorage.getItem('debugMode') === 'true'; // default false
}

export function setDebugMode(enabled: boolean): void {
  localStorage.setItem('debugMode', String(enabled));
  window.dispatchEvent(new CustomEvent('debugmode-changed', { detail: enabled }));
}

// Intent detection mode. As of the cutover, production always runs 'frame'
// (Frame + Orchestrator pipeline). The 'legacy' single-LLM branch in
// copilot-agent.ts is kept as in-source reference during the stabilization
// window — it is unreachable from the UI. To re-enable for debugging only,
// set `localStorage.intentMode = 'legacy'` from the devtools console.
export type IntentMode = 'legacy' | 'frame';

export function getIntentMode(): IntentMode {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('intentMode') === 'legacy') {
    return 'legacy';
  }
  return 'frame';
}

export function setIntentMode(mode: IntentMode): void {
  localStorage.setItem('intentMode', mode);
  window.dispatchEvent(new CustomEvent('intentmode-changed', { detail: mode }));
}

// Home header widget display setting
export type HomeHeaderWidget = 'date-time' | 'performance' | 'task-completion' | 'pipeline-forecast';

export const homeHeaderWidgetLabels: Record<HomeHeaderWidget, { zh: string; en: string; de: string; fr: string; es: string }> = {
  'date-time': { zh: '日期和时间', en: 'Date & Time', de: 'Datum & Uhrzeit', fr: 'Date et heure', es: 'Fecha y hora' },
  'performance': { zh: '我的业绩', en: 'My Performance', de: 'Meine Leistung', fr: 'Ma performance', es: 'Mi rendimiento' },
  'task-completion': { zh: '今日任务完成率', en: "Today's Task Completion", de: 'Heutige Aufgabenerfüllung', fr: 'Achèvement des tâches du jour', es: 'Tareas completadas hoy' },
  'pipeline-forecast': { zh: '本季度成交额/预测', en: 'Closed Pipeline / Forecast', de: 'Abgeschlossene Pipeline / Prognose', fr: 'Pipeline clôturé / Prévision', es: 'Pipeline cerrado / Previsión' },
};

export function getHomeHeaderWidget(): HomeHeaderWidget {
  const saved = localStorage.getItem('homeHeaderWidget');
  if (saved && saved in homeHeaderWidgetLabels) {
    return saved as HomeHeaderWidget;
  }
  return 'date-time'; // Default to date & time display
}

export function setHomeHeaderWidget(widget: HomeHeaderWidget): void {
  localStorage.setItem('homeHeaderWidget', widget);
  window.dispatchEvent(new CustomEvent('homeheaderwidget-changed', { detail: widget }));
}

export const translations: Record<Locale, Record<string, string>> = {
  'zh-Hans': zhHans,
  'en-US': enUS,
  'de-DE': deDE,
  'fr-FR': frFR,
  'es-ES': esES,
};

export type TranslationKey = keyof typeof zhHans;

// ---------------------------------------------------------------------------
// Locale metadata — single source of truth for everything that varies by
// language: the picker label, the BCP-47 tag used for date/number/currency
// formatting, and the speech-synthesis / recognition language. Add a new
// language here + a translations block above and the whole app picks it up.
// ---------------------------------------------------------------------------
export interface LocaleMeta {
  /** Native name shown in the language picker. */
  label: string;
  /** BCP-47 tag for Intl date/number/currency formatting. */
  bcp47: string;
  /** Language prefix used to match system TTS voices (e.g. 'de'). */
  lang: string;
  /** Speech tag for SpeechSynthesisUtterance.lang / recognition.lang. */
  speech: string;
  /** English language name, used in LLM output-language directives. */
  englishName: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  'zh-Hans': { label: '中文', bcp47: 'zh-CN', lang: 'zh', speech: 'zh-CN', englishName: 'Simplified Chinese' },
  'en-US': { label: 'English', bcp47: 'en-US', lang: 'en', speech: 'en-US', englishName: 'English' },
  'de-DE': { label: 'Deutsch', bcp47: 'de-DE', lang: 'de', speech: 'de-DE', englishName: 'German' },
  'fr-FR': { label: 'Français', bcp47: 'fr-FR', lang: 'fr', speech: 'fr-FR', englishName: 'French' },
  'es-ES': { label: 'Español', bcp47: 'es-ES', lang: 'es', speech: 'es-ES', englishName: 'Spanish' },
};

export const SUPPORTED_LOCALES = Object.keys(LOCALE_META) as Locale[];

/** BCP-47 tag for Intl.* formatting in the given locale. */
export function localeBcp47(locale: Locale): string {
  return LOCALE_META[locale]?.bcp47 ?? 'en-US';
}

/** Speech tag (SpeechSynthesisUtterance.lang / SpeechRecognition.lang). */
export function speechLang(locale: Locale): string {
  return LOCALE_META[locale]?.speech ?? 'en-US';
}

/** Language prefix used to match system voices for the given locale. */
export function localeLangPrefix(locale: Locale): string {
  return LOCALE_META[locale]?.lang ?? 'en';
}

/**
 * Model-facing instruction that pins the language of the LLM's USER-VISIBLE
 * output. Append this to system prompts that are authored only in zh/en so that
 * de/fr/es users still receive localized content (titles, summaries, prose)
 * instead of falling back to the English template.
 */
export function outputLanguageDirective(locale: Locale): string {
  const name = LOCALE_META[locale]?.englishName ?? 'English';
  return `IMPORTANT: Write ALL user-facing text (titles, content, prose) in ${name}, regardless of the language of the input data or these instructions. Keep proper nouns (client / opportunity / product names) exactly as given.`;
}

/**
 * Pick the localized string from a small inline label object that carries its
 * own translations (used by metadata maps that also hold colors/durations).
 * Falls back to English when a language is missing.
 */
export function pickLabel(
  o: { zh: string; en: string; de?: string; fr?: string; es?: string },
  locale: Locale,
): string {
  switch (locale) {
    case 'zh-Hans': return o.zh;
    case 'de-DE': return o.de ?? o.en;
    case 'fr-FR': return o.fr ?? o.en;
    case 'es-ES': return o.es ?? o.en;
    default: return o.en;
  }
}

// Get/set locale from localStorage
export function getLocale(): Locale {
  const saved = localStorage.getItem('locale');
  if (saved && Object.prototype.hasOwnProperty.call(LOCALE_META, saved)) {
    return saved as Locale;
  }
  // First run: best-effort detection from the browser language, else English.
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
  if (nav.startsWith('zh')) return 'zh-Hans';
  if (nav.startsWith('de')) return 'de-DE';
  if (nav.startsWith('fr')) return 'fr-FR';
  if (nav.startsWith('es')) return 'es-ES';
  return 'en-US';
}

export function setLocale(locale: Locale): void {
  localStorage.setItem('locale', locale);
  // Dispatch event so components can react
  window.dispatchEvent(new CustomEvent('locale-changed', { detail: locale }));
}

export function t<K extends TranslationKey>(
  key: K,
  locale: Locale = 'zh-Hans',
  params?: Record<string, string | number>
): string {
  // Index defensively: a locale block may not contain every key (e.g. a string
  // added to en-US but not yet translated). Fall back to English, then Chinese,
  // then the key itself. The casts avoid a union-key (TS2536) error when blocks
  // are not perfectly key-identical.
  const table = translations[locale] as Record<string, string | undefined>;
  const en = translations['en-US'] as Record<string, string | undefined>;
  const zh = translations['zh-Hans'] as Record<string, string | undefined>;
  let text: string = table?.[key] ?? en[key] ?? zh[key] ?? key;
  
  if (params) {
    Object.entries(params).forEach(([k, v]: [string, string | number]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  
  return text;
}

export function getGreeting(locale: Locale = 'zh-Hans'): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return t('morning', locale);
  if (hour >= 12 && hour < 18) return t('afternoon', locale);
  return t('evening', locale);
}


/**
 * React hook that subscribes to locale changes.
 * Use this instead of calling getLocale() directly to ensure components
 * re-render when the locale changes.
 */
export function useLocale(): Locale {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  useEffect(() => {
    const handleLocaleChange = (event: CustomEvent<Locale>) => {
      setLocaleState(event.detail);
    };
    window.addEventListener('locale-changed', handleLocaleChange as EventListener);
    return () => window.removeEventListener('locale-changed', handleLocaleChange as EventListener);
  }, []);

  return locale;
}