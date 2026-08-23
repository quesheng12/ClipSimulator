import { describe, expect, it } from 'vitest';
import testStoryJson from '../../../content/test-story.json';
import type { StoryPack } from './types';
import {
  buildIdolNickname,
  buildTemplateVariables,
  collectTemplateVariableReferences,
  renderTemplateText,
  RESERVED_TEMPLATE_VARIABLES,
  resolveStoryPackTemplates,
} from './templates';

const pack = testStoryJson as unknown as StoryPack;

describe('story templates', () => {
  it('builds reserved profile values alongside static story variables', () => {
    const variables = buildTemplateVariables(pack, { idolName: '林见夏', teamId: 'nii' });

    expect(RESERVED_TEMPLATE_VARIABLES).toEqual([
      'idolName',
      'idolNickname',
      'teamName',
      'teamShortName',
    ]);
    expect(variables).toMatchObject({
      idolName: '林见夏',
      idolNickname: '夏夏',
      teamName: 'Team NII',
      teamShortName: 'NII',
      cityName: pack.globalVariables.cityName,
      groupName: pack.globalVariables.groupName,
    });
    expect(() => buildTemplateVariables(pack, { idolName: '林见夏', teamId: 'missing' })).toThrow(
      RangeError,
    );
  });

  it('builds a nickname from the final character of the trimmed idol name', () => {
    expect(buildIdolNickname(' 欧阳娜 ')).toBe('娜娜');
    expect(buildIdolNickname('Ava')).toBe('aa');
    expect(buildIdolNickname('   ')).toBe('');
  });

  it('renders known placeholders and preserves unknown or malformed references', () => {
    const variables = buildTemplateVariables(pack, { idolName: '许知微', teamId: 'x' });

    expect(
      renderTemplateText(
        '{{ idolName }}（{{idolNickname}}）来自{{cityName}}，现在是{{teamShortName}}；{{unknown}} / {{bad-key}}。',
        variables,
      ),
    ).toBe(
      `许知微（微微）来自${pack.globalVariables.cityName}，现在是X；{{unknown}} / {{bad-key}}。`,
    );
  });

  it('resolves visible copy without mutating machine ids, flags, or references', () => {
    const source = structuredClone(pack);
    source.nodes[0]!.id = '{{idolName}}-node';
    source.nodes[0]!.content.text = '{{idolName}}（{{idolNickname}}）发来的当前消息。';
    source.nodes[0]!.choices[0]!.text = '欢迎来到{{teamName}}。';
    source.nodes[0]!.choices[0]!.nextNodeId = '{{idolName}}-next';
    source.nodes[0]!.choices[0]!.effects.setFlags = ['{{idolName}}-flag'];
    source.backgroundFlips[0]!.contactId = '{{idolName}}-contact';
    const topicFlip = source.backgroundFlips.find((flip) => flip.id === 'topic-idol-dog-01')!;
    topicFlip.continuations![0] = '{{idolNickname}}会继续聊这个。';
    source.fans[0]!.avatar = '{{idolName}}.png';
    source.fans[0]!.tags[0] = '{{idolNickname}}单推';
    source.fans[0]!.pastChats[0]!.message = '{{idolName}}，这是过去的消息。';
    source.fans[0]!.pastChats[0]!.reply = '{{idolNickname}}记得。';
    source.earlyEndings[0]!.image!.alt = '{{idolName}}收到的虚构投稿截图。';

    const variables = buildTemplateVariables(source, { idolName: '沈星遥', teamId: 'sii' });
    const resolved = resolveStoryPackTemplates(source, variables);

    expect(resolved.description).toContain(pack.globalVariables.groupName!);
    expect(resolved.nodes[0]!.content.text).toContain('沈星遥');
    expect(resolved.nodes[0]!.choices[0]!.text).toContain('Team SII');
    expect(resolved.nodes[0]!.id).toBe('{{idolName}}-node');
    expect(resolved.nodes[0]!.choices[0]!.nextNodeId).toBe('{{idolName}}-next');
    expect(resolved.nodes[0]!.choices[0]!.effects.setFlags).toEqual(['{{idolName}}-flag']);
    expect(resolved.backgroundFlips[0]!.contactId).toBe('{{idolName}}-contact');
    expect(
      resolved.backgroundFlips.find((flip) => flip.id === 'topic-idol-dog-01')!.continuations![0],
    ).toBe('遥遥会继续聊这个。');
    expect(resolved.fans[0]!.avatar).toBe('{{idolName}}.png');
    expect(resolved.fans[0]!.tags[0]).toBe('遥遥单推');
    expect(resolved.fans[0]!.pastChats[0]).toMatchObject({
      message: '沈星遥，这是过去的消息。',
      reply: '遥遥记得。',
    });
    expect(resolved.earlyEndings[0]!.image!.alt).toBe('沈星遥收到的虚构投稿截图。');
    expect(source.nodes[0]!.content.text).toContain('{{idolName}}');
  });

  it('collects path-aware references and keeps the long reply fixture in its UI range', () => {
    const references = collectTemplateVariableReferences(pack);
    expect(references).toContainEqual({
      name: 'idolNickname',
      path: 'nodes.yuzu-01.content.text',
      nodeId: 'yuzu-01',
    });
    expect(references.some((reference) => reference.name === 'groupName')).toBe(true);

    const longReply = pack.nodes
      .find((node) => node.id === 'yuzu-02')!
      .choices.find((choice) => choice.id === 'notice-details')!.text;
    expect(longReply).toContain('\n\n');
    expect(longReply.replace(/\s/g, '').length).toBeGreaterThanOrEqual(55);
    expect(longReply.replace(/\s/g, '').length).toBeLessThanOrEqual(120);
  });
});
