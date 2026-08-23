import { hasValidationErrors, validateStoryPack } from '@clip/story-core/validation';
import type { StoryPack } from '@clip/story-core/types';

export interface WritableFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: unknown) => Promise<WritableFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<WritableFileHandle>;
}

const jsonPickerOptions = {
  types: [
    {
      description: '翻牌剧情 JSON',
      accept: { 'application/json': ['.json'] },
    },
  ],
  excludeAcceptAllOption: true,
};

export function supportsDirectFileAccess(): boolean {
  return Boolean((window as FilePickerWindow).showOpenFilePicker);
}

function parseFileText(text: string): StoryPack {
  const value: unknown = JSON.parse(text);
  const issues = validateStoryPack(value);
  const schemaErrors = issues.filter((issue) => issue.code === 'schema');
  if (hasValidationErrors(schemaErrors)) {
    throw new Error(schemaErrors.map((issue) => issue.message).join('；'));
  }
  return value as StoryPack;
}

export async function openStoryFile(): Promise<{
  pack: StoryPack;
  handle: WritableFileHandle;
}> {
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (!picker) throw new Error('当前浏览器不支持直接打开文件');
  const [handle] = await picker(jsonPickerOptions);
  if (!handle) throw new Error('没有选择文件');
  const file = await handle.getFile();
  const pack = parseFileText(await file.text());
  return { pack, handle };
}

export async function parseImportedFile(file: File): Promise<StoryPack> {
  return parseFileText(await file.text());
}

export async function chooseSaveHandle(suggestedName: string): Promise<WritableFileHandle> {
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (!picker) throw new Error('当前浏览器不支持直接保存文件');
  return picker({ ...jsonPickerOptions, suggestedName });
}

export async function writeStoryFile(handle: WritableFileHandle, pack: StoryPack): Promise<void> {
  const writer = await handle.createWritable();
  await writer.write(`${JSON.stringify(pack, null, 2)}\n`);
  await writer.close();
}

export function downloadStoryFile(pack: StoryPack, fileName: string): void {
  const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
