import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { SessionSkillRuntime } from '../src/skills/session-skill-runtime';
import type { Skill } from '../src/types/skill';

describe('SessionSkillRuntime', () => {
  test('builds transient skills list from user invocable skills', () => {
    const runtime = new SessionSkillRuntime(buildSkillManager({
      userInvocableSkills: [
        buildSkill('demo', 'Demo skill'),
      ],
    }) as any, 'session-demo');

    const message = runtime.buildSkillsListMessage();

    assert.ok(message);
    assert.equal(message.role, 'system');
    assert.match(String(message.content), /^\[transient_skills_list\]/);
    assert.match(String(message.content), /demo: Demo skill/);
  });

  test('creates skill command activation and run message from slash command args', () => {
    const runtime = new SessionSkillRuntime(buildSkillManager({
      skills: {
        demo: buildSkill('demo', 'Demo skill', { argumentHint: '<topic>', maxTurns: 3 }),
      },
    }) as any, 'session-demo');

    const result = runtime.handleSkillCommand('demo', ['alpha', 'beta']);

    assert.equal(result.handled, true);
    assert.equal(result.runMessage, 'alpha beta');
    assert.equal(result.activation?.skillName, 'demo');
    assert.equal(result.activation?.maxTurns, 3);
    assert.match(result.activation?.prompt ?? '', /Skill prompt for demo/);
  });

  test('auto activation ignores slash commands and attachment-only inputs', () => {
    const runtime = new SessionSkillRuntime(buildSkillManager({
      autoSkill: buildSkill('auto-demo', 'Auto skill'),
    }) as any, 'session-demo');

    assert.equal(runtime.createAutoActivation('/auto-demo now'), undefined);
    assert.equal(runtime.createAutoActivation('[文件] report.pdf'), undefined);
    assert.equal(runtime.createAutoActivation('[图片] image.png'), undefined);
    assert.equal(runtime.createAutoActivation('[用户已上传附件]\nfile.pdf'), undefined);
    assert.equal(runtime.createAutoActivation('[用户仅上传了附件，暂未给出明确任务]'), undefined);

    const activation = runtime.createAutoActivation('please auto this');
    assert.equal(activation?.skillName, 'auto-demo');
  });

  test('applies, detects, parses, and removes skill system messages', () => {
    const runtime = new SessionSkillRuntime(buildSkillManager({
      skills: {
        demo: buildSkill('demo', 'Demo skill', { maxTurns: 2 }),
      },
    }) as any, 'session-demo');
    const messages: any[] = [{ role: 'system', content: 'base' }];

    const state = runtime.applyActivation(messages, {
      __type__: 'skill_activation',
      skillName: 'demo',
      prompt: 'Use demo',
      maxTurns: 2,
    });

    assert.deepStrictEqual(state, {
      activeSkillName: 'demo',
      activeSkillMaxTurns: 2,
    });
    assert.equal(runtime.detectActiveSkillName(messages), 'demo');
    assert.equal(runtime.detectSkillMaxTurns(messages), 2);
    assert.equal(runtime.parseActivationFromSystemMessage(messages[1])?.skillName, 'demo');
    assert.deepStrictEqual(
      runtime.removeSkillSystemMessages(messages).map(message => message.content),
      ['base'],
    );
  });
});

function buildSkill(
  name: string,
  description: string,
  metadata: Partial<Skill['metadata']> = {},
): Skill {
  return {
    metadata: {
      name,
      description,
      userInvocable: true,
      ...metadata,
    },
    content: `Skill prompt for ${name}`,
    filePath: `/tmp/${name}/SKILL.md`,
  };
}

function buildSkillManager(options: {
  skills?: Record<string, Skill>;
  userInvocableSkills?: Skill[];
  autoSkill?: Skill;
} = {}): any {
  return {
    async loadSkills() {},
    getUserInvocableSkills() {
      return options.userInvocableSkills ?? Object.values(options.skills ?? {});
    },
    getSkill(name: string) {
      return options.skills?.[name];
    },
    findAutoInvocableSkillByText(text: string) {
      if (text.includes('auto')) return options.autoSkill;
      return undefined;
    },
  };
}
