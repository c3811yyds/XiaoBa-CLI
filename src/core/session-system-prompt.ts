import { composeSurfacePrompt } from './session-surface';

export type SessionSystemPromptProvider = () => Promise<string> | string;

export interface SessionSystemPromptContext {
  sessionKey: string;
  sessionType?: string;
}
export function composeSessionSystemPromptProvider(
  baseProvider: SessionSystemPromptProvider,
  context: SessionSystemPromptContext,
): SessionSystemPromptProvider {
  return async () => {
    const basePrompt = await baseProvider();
    const surfacePrompt = composeSurfacePrompt(context.sessionKey, context.sessionType);

    return [basePrompt, surfacePrompt]
      .filter(prompt => prompt && prompt.trim())
      .join('\n\n');
  };
}
