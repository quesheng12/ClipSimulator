import testStoryJson from '../../../content/test-story.json';
import type { StoryPack } from '@clip/story-core/types';

// The canonical JSON is validated by `npm run validate:content` before builds.
export const storyPack = testStoryJson as unknown as StoryPack;
