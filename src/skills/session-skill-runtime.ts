import { Message } from '../types';
import { SkillManager } from './skill-manager';
import { SkillActivationSignal, SkillInvocationContext } from '../types/skill';
import {
  buildSkillActivationSignal,
  upsertSkillSystemMessage,
} from './skill-activation-protocol';

export const TRANSIENT_SKILLS_LIST_PREFIX = '[transient_skills_list]';
export type SkillReloadHandler = () => Promise<void>;

export interface SkillCommandResult {
  handled: boolean;
  reply?: string;
  activation?: SkillActivationSignal;
  runMessage?: string;
}

export interface SkillRuntimeState {
  activeSkillName?: string;
  activeSkillMaxTurns?: number;
}

export class SessionSkillRuntime {
  constructor(
    private skillManager: SkillManager,
    private sessionKey: string,
    private reloadHandler: SkillReloadHandler = () => this.skillManager.loadSkills(),
  ) {}

  setReloadHandler(handler: SkillReloadHandler): void {
    this.reloadHandler = handler;
  }

  async reloadSkills(): Promise<void> {
    await this.reloadHandler();
  }

  buildSkillsListMessage(): Message | undefined {
    const skills = this.skillManager.getUserInvocableSkills();
    if (skills.length === 0) return undefined;

    const skillList = skills
      .map(skill => `- ${skill.metadata.name}: ${skill.metadata.description}`)
      .join('\n');

    return {
      role: 'system',
      content: `${TRANSIENT_SKILLS_LIST_PREFIX}\n你可以使用以下skills（通过skill工具调用）：\n\n${skillList}`,
    };
  }

  handleSkillsCommand(): SkillCommandResult {
    const skills = this.skillManager.getUserInvocableSkills();
    if (skills.length === 0) {
      return { handled: true, reply: '暂无可用的 skills。' };
    }

    const lines = skills.map(skill => {
      const hint = skill.metadata.argumentHint ? ` ${skill.metadata.argumentHint}` : '';
      return `/${skill.metadata.name}${hint}\n  ${skill.metadata.description}`;
    });

    return { handled: true, reply: '可用的 Skills:\n\n' + lines.join('\n\n') };
  }

  createStartupActivation(skillName: string): SkillActivationSignal | undefined {
    const skill = this.skillManager.getSkill(skillName);
    if (!skill) return undefined;

    return buildSkillActivationSignal(skill, {
      skillName,
      arguments: [],
      rawArguments: '',
      userMessage: '',
    });
  }

  handleSkillCommand(commandName: string, args: string[]): SkillCommandResult {
    const skill = this.skillManager.getSkill(commandName);
    if (!skill) return { handled: false };

    if (!skill.metadata.userInvocable) {
      return { handled: true, reply: `Skill "${commandName}" 不允许用户调用` };
    }

    const rawArguments = args.join(' ');
    const context: SkillInvocationContext = {
      skillName: commandName,
      arguments: args,
      rawArguments,
      userMessage: `/${commandName} ${rawArguments}`.trim(),
    };

    return {
      handled: true,
      activation: buildSkillActivationSignal(skill, context),
      runMessage: rawArguments || undefined,
      reply: rawArguments ? undefined : `已激活 skill: ${skill.metadata.name}`,
    };
  }

  createAutoActivation(
    userText: string,
    activeSkillName?: string,
  ): SkillActivationSignal | undefined {
    const input = userText.trim();
    if (!input) return undefined;
    if (input.startsWith('/')) return undefined;
    if (this.isAttachmentOnlyInput(input)) return undefined;
    if (activeSkillName) return undefined;

    const matched = this.skillManager.findAutoInvocableSkillByText(input);
    if (!matched) return undefined;

    return buildSkillActivationSignal(matched, {
      skillName: matched.metadata.name,
      arguments: [],
      rawArguments: '',
      userMessage: input,
    });
  }

  applyActivation(
    messages: Message[],
    activation: SkillActivationSignal,
  ): SkillRuntimeState {
    upsertSkillSystemMessage(messages, activation);
    return {
      activeSkillName: activation.skillName,
      activeSkillMaxTurns: activation.maxTurns,
    };
  }

  parseActivationFromSystemMessage(msg: Message): SkillActivationSignal | null {
    if (msg.role !== 'system' || typeof msg.content !== 'string') {
      return null;
    }

    const markerMatch = msg.content.match(/^\[skill:([^\]]+)\]/);
    if (!markerMatch) return null;

    const skillName = markerMatch[1];
    const prompt = msg.content.slice(markerMatch[0].length).replace(/^\n/, '');
    const skill = this.skillManager.getSkill(skillName);

    return {
      __type__: 'skill_activation',
      skillName,
      prompt,
      maxTurns: skill?.metadata.maxTurns,
    };
  }

  detectActiveSkillName(messages: Message[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'system' || typeof msg.content !== 'string') continue;
      const match = msg.content.match(/^\[skill:([^\]]+)\]/);
      if (match) return match[1];
    }
    return undefined;
  }

  detectSkillMaxTurns(messages: Message[]): number | undefined {
    for (const msg of messages) {
      if (msg.role !== 'system' || typeof msg.content !== 'string') continue;
      const match = msg.content.match(/^\[skill:([^\]]+)\]/);
      if (!match) continue;

      const skill = this.skillManager.getSkill(match[1]);
      if (skill?.metadata.maxTurns) return skill.metadata.maxTurns;
    }
    return undefined;
  }

  removeSkillSystemMessages(messages: Message[]): Message[] {
    return messages.filter(message => {
      if (message.role !== 'system' || typeof message.content !== 'string') return true;
      return !message.content.match(/^\[skill:[^\]]+\]/);
    });
  }

  private isAttachmentOnlyInput(input: string): boolean {
    if (input.startsWith('[文件]') || input.startsWith('[图片]')) return true;
    if (input.startsWith('[用户仅上传了附件')) return true;

    const attachmentMarker = '[用户已上传附件]';
    const markerIndex = input.indexOf(attachmentMarker);
    if (markerIndex < 0) return false;

    return !input.slice(0, markerIndex).trim();
  }
}
