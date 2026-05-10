import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import {
  buildSkillActivationSignal,
  parseSkillActivationSignal,
  upsertSkillSystemMessage,
} from '../src/skills/skill-activation-protocol';
import type { Message } from '../src/types';
import type { Skill } from '../src/types/skill';

describe('skill activation protocol', () => {
  test('builds activation signal with executed prompt and finite maxTurns', () => {
    const skill = buildSkill({
      content: 'Skill $0 at <SKILL_DIR> with $ARGUMENTS / $1 / $2 / $3',
      maxTurns: 4,
    });

    const signal = buildSkillActivationSignal(skill, {
      skillName: 'demo-skill',
      arguments: ['alpha', 'beta'],
      rawArguments: 'alpha beta',
      userMessage: '/demo-skill alpha beta',
    });

    assert.equal(signal.__type__, 'skill_activation');
    assert.equal(signal.skillName, 'demo-skill');
    assert.equal(signal.maxTurns, 4);
    assert.match(signal.prompt, /Skill demo-skill/);
    assert.match(signal.prompt, /\/tmp\/demo-skill/);
    assert.match(signal.prompt, /with alpha beta \/ alpha \/ beta \//);
    assert.doesNotMatch(signal.prompt, /<SKILL_DIR>|\$ARGUMENTS|\$1|\$2|\$3/);
  });

  test('parses valid activation signal and rejects invalid payloads', () => {
    assert.deepStrictEqual(
      parseSkillActivationSignal(JSON.stringify({
        __type__: 'skill_activation',
        skillName: ' demo-skill ',
        prompt: 'Use this skill',
        maxTurns: 2,
      })),
      {
        __type__: 'skill_activation',
        skillName: 'demo-skill',
        prompt: 'Use this skill',
        maxTurns: 2,
      },
    );

    assert.equal(parseSkillActivationSignal('not json'), null);
    assert.equal(parseSkillActivationSignal(JSON.stringify({ __type__: 'other' })), null);
    assert.equal(parseSkillActivationSignal(JSON.stringify({
      __type__: 'skill_activation',
      skillName: '',
      prompt: 'missing name',
    })), null);
    assert.equal(parseSkillActivationSignal(JSON.stringify({
      __type__: 'skill_activation',
      skillName: 'demo',
      prompt: 42,
    })), null);
  });

  test('upserts skill system message by skill marker', () => {
    const messages: Message[] = [
      { role: 'system', content: 'base prompt' },
      { role: 'system', content: '[skill:demo-skill]\nold prompt' },
      { role: 'user', content: 'hello' },
    ];

    const inserted = upsertSkillSystemMessage(messages, {
      __type__: 'skill_activation',
      skillName: 'demo-skill',
      prompt: 'new prompt',
      maxTurns: 3,
    });

    assert.equal(inserted.content, '[skill:demo-skill]\nnew prompt');
    assert.equal(messages.filter(message => (
      message.role === 'system'
      && typeof message.content === 'string'
      && message.content.startsWith('[skill:demo-skill]')
    )).length, 1);
    assert.deepStrictEqual(messages.map(message => message.content), [
      'base prompt',
      'hello',
      '[skill:demo-skill]\nnew prompt',
    ]);
  });
});

function buildSkill(overrides: Partial<Skill> & { content: string; maxTurns?: number }): Skill {
  return {
    metadata: {
      name: 'demo-skill',
      description: 'Demo skill',
      maxTurns: overrides.maxTurns,
    },
    content: overrides.content,
    filePath: '/tmp/demo-skill/SKILL.md',
  };
}
