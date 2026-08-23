import { describe, expect, it } from 'vitest';
import testStoryJson from '../../../content/test-story.json';
import type { StoryPack } from './types';
import {
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

    expect(RESERVED_TEMPLATE_VARIABLES).toEqual(['idolName', 'teamName', 'teamShortName']);
    expect(variables).toMatchObject({
      idolName: '林见夏',
      teamName: 'Team NII',
      teamShortName: 'NII',
      cityName: '星湾',
      groupName: '星河48',
    });
    expect(() => buildTemplateVariables(pack, { idolName: '林见夏', teamId: 'missing' })).toThrow(
      RangeError,
    );
  });

  it('renders known placeholders and preserves unknown or malformed references', () => {
    const variables = buildTemplateVariables(pack, { idolName: '许知微', teamId: 'x' });

    expect(
      renderTemplateText(
        '{{ idolName }}来自{{cityName}}，现在是{{teamShortName}}；{{unknown}} / {{bad-key}}。',
        variables,
      ),
    ).toBe('许知微来自星湾，现在是X；{{unknown}} / {{bad-key}}。');
  });

  it('resolves visible copy without mutating machine ids, flags, or references', () => {
    const source = structuredClone(pack);
    source.nodes[0]!.id = '{{idolName}}-node';
    source.nodes[0]!.choices[0]!.nextNodeId = '{{idolName}}-next';
    source.nodes[0]!.choices[0]!.effects.setFlags = ['{{idolName}}-flag'];
    source.backgroundFlips[0]!.contactId = '{{idolName}}-contact';
    source.fans[0]!.avatar = '{{idolName}}.png';

    const variables = buildTemplateVariables(source, { idolName: '沈星遥', teamId: 'sii' });
    const resolved = resolveStoryPackTemplates(source, variables);

    expect(resolved.description).toContain('星河48');
    expect(resolved.nodes[0]!.content.text).toContain('沈星遥');
    expect(resolved.nodes[0]!.choices[0]!.text).toContain('Team SII');
    expect(resolved.nodes[0]!.id).toBe('{{idolName}}-node');
    expect(resolved.nodes[0]!.choices[0]!.nextNodeId).toBe('{{idolName}}-next');
    expect(resolved.nodes[0]!.choices[0]!.effects.setFlags).toEqual(['{{idolName}}-flag']);
    expect(resolved.backgroundFlips[0]!.contactId).toBe('{{idolName}}-contact');
    expect(resolved.fans[0]!.avatar).toBe('{{idolName}}.png');
    expect(source.nodes[0]!.content.text).toContain('{{idolName}}');
  });

  it('collects path-aware references and keeps the long reply fixture in its UI range', () => {
    const references = collectTemplateVariableReferences(pack);
    expect(references).toContainEqual({
      name: 'idolName',
      path: 'nodes.yuzu-01.content.text',
      nodeId: 'yuzu-01',
    });
    expect(references.some((reference) => reference.name === 'groupName')).toBe(true);

    const longReply = pack.nodes
      .find((node) => node.id === 'yuzu-01')!
      .choices.find((choice) => choice.id === 'generic')!.text;
    expect(longReply).toContain('\n\n');
    expect(longReply.replace(/\s/g, '').length).toBeGreaterThanOrEqual(80);
    expect(longReply.replace(/\s/g, '').length).toBeLessThanOrEqual(120);
  });
});
