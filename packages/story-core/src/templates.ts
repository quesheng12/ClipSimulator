import type { PlayerProfile, StoryPack } from './types';

export const RESERVED_TEMPLATE_VARIABLES = ['idolName', 'teamName', 'teamShortName'] as const;

export type ReservedTemplateVariable = (typeof RESERVED_TEMPLATE_VARIABLES)[number];
export type TemplateVariables = Readonly<Record<string, string>>;

export interface TemplateVariableReference {
  name: string;
  path: string;
  nodeId?: string;
}

const TEMPLATE_VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const TEMPLATE_REFERENCE_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export function isValidTemplateVariableName(name: string): boolean {
  return TEMPLATE_VARIABLE_NAME_PATTERN.test(name);
}

export function buildTemplateVariables(pack: StoryPack, profile: PlayerProfile): TemplateVariables {
  const team = pack.profileSetup.teams.find((candidate) => candidate.id === profile.teamId);
  if (!team) {
    throw new RangeError(`Unknown team id: ${profile.teamId}`);
  }

  return {
    ...pack.globalVariables,
    idolName: profile.idolName,
    teamName: team.name,
    teamShortName: team.shortName,
  };
}

export function renderTemplateText(text: string, variables: TemplateVariables): string {
  return text.replace(TEMPLATE_REFERENCE_PATTERN, (match, rawName: string) => {
    const name = rawName.trim();
    if (!isValidTemplateVariableName(name)) return match;
    return Object.prototype.hasOwnProperty.call(variables, name) ? variables[name]! : match;
  });
}

type VisibleTextTransform = (text: string, path: string, nodeId?: string) => string;

function transformVisibleStoryText(pack: StoryPack, transform: VisibleTextTransform): StoryPack {
  const resolved = structuredClone(pack);
  const apply = (text: string, path: string, nodeId?: string): string =>
    transform(text, path, nodeId);
  const applyOptional = (
    text: string | undefined,
    path: string,
    nodeId?: string,
  ): string | undefined => (text === undefined ? undefined : apply(text, path, nodeId));

  resolved.title = apply(resolved.title, 'title');
  resolved.description = apply(resolved.description, 'description');

  for (const [tierIndex, tier] of resolved.config.popularity.voteTiers.entries()) {
    tier.label = apply(tier.label, `config.popularity.voteTiers.${tierIndex}.label`);
  }

  for (const fan of resolved.fans) {
    fan.name = apply(fan.name, `fans.${fan.id}.name`);
    fan.handle = apply(fan.handle, `fans.${fan.id}.handle`);
    fan.bio = apply(fan.bio, `fans.${fan.id}.bio`);
    for (const [tierIndex, tier] of fan.voteTiers.entries()) {
      tier.label = apply(tier.label, `fans.${fan.id}.voteTiers.${tierIndex}.label`);
    }
  }

  for (const node of resolved.nodes) {
    node.title = apply(node.title, `nodes.${node.id}.title`, node.id);
    node.content.text = apply(node.content.text, `nodes.${node.id}.content.text`, node.id);
    node.content.context = applyOptional(
      node.content.context,
      `nodes.${node.id}.content.context`,
      node.id,
    );
    for (const choice of node.choices) {
      choice.text = apply(choice.text, `nodes.${node.id}.choices.${choice.id}.text`, node.id);
      choice.note = applyOptional(
        choice.note,
        `nodes.${node.id}.choices.${choice.id}.note`,
        node.id,
      );
    }
  }

  for (const event of resolved.turnEvents) {
    event.title = apply(event.title, `turnEvents.${event.id}.title`);
    event.description = apply(event.description, `turnEvents.${event.id}.description`);
  }

  for (const flip of resolved.backgroundFlips) {
    flip.fanName = apply(flip.fanName, `backgroundFlips.${flip.id}.fanName`);
    flip.tag = apply(flip.tag, `backgroundFlips.${flip.id}.tag`);
    flip.message = apply(flip.message, `backgroundFlips.${flip.id}.message`);
    flip.reply = apply(flip.reply, `backgroundFlips.${flip.id}.reply`);
  }

  for (const ending of resolved.electionEndings) {
    ending.rankLabel = apply(ending.rankLabel, `electionEndings.${ending.id}.rankLabel`);
    ending.title = apply(ending.title, `electionEndings.${ending.id}.title`);
    ending.description = apply(ending.description, `electionEndings.${ending.id}.description`);
  }

  for (const ending of resolved.earlyEndings) {
    ending.title = apply(ending.title, `earlyEndings.${ending.id}.title`);
    ending.description = apply(ending.description, `earlyEndings.${ending.id}.description`);
  }

  for (const achievement of resolved.achievements) {
    achievement.title = apply(achievement.title, `achievements.${achievement.id}.title`);
    achievement.description = apply(
      achievement.description,
      `achievements.${achievement.id}.description`,
    );
  }

  return resolved;
}

export function resolveStoryPackTemplates(
  pack: StoryPack,
  variables: TemplateVariables,
): StoryPack {
  return transformVisibleStoryText(pack, (text) => renderTemplateText(text, variables));
}

export function collectTemplateVariableReferences(pack: StoryPack): TemplateVariableReference[] {
  const references: TemplateVariableReference[] = [];
  transformVisibleStoryText(pack, (text, path, nodeId) => {
    for (const match of text.matchAll(TEMPLATE_REFERENCE_PATTERN)) {
      const name = match[1]?.trim();
      if (!name) continue;
      references.push({ name, path, ...(nodeId ? { nodeId } : {}) });
    }
    return text;
  });
  return references;
}
