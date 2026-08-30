type IdleCapableWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function uniqueImageSources(sources: readonly string[]): string[] {
  return [...new Set(sources.filter((source) => source.trim().length > 0))];
}

function scheduleWhenIdle(callback: () => void): () => void {
  const browserWindow = window as IdleCapableWindow;
  if (browserWindow.requestIdleCallback && browserWindow.cancelIdleCallback) {
    const handle = browserWindow.requestIdleCallback(callback, { timeout: 4_000 });
    return () => browserWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 1_200);
  return () => window.clearTimeout(handle);
}

export function scheduleDeferredImagePreloads(sources: readonly string[]): () => void {
  const queue = uniqueImageSources(sources);
  let disposed = false;
  let cancelScheduled: (() => void) | undefined;
  let activeImage: HTMLImageElement | undefined;

  const loadNext = () => {
    if (disposed || queue.length === 0) return;

    cancelScheduled = scheduleWhenIdle(() => {
      cancelScheduled = undefined;
      if (disposed) return;

      const image = new Image();
      activeImage = image;
      image.decoding = 'async';
      image.fetchPriority = 'low';

      const settle = () => {
        image.onload = null;
        image.onerror = null;
        activeImage = undefined;
        loadNext();
      };

      image.onload = settle;
      image.onerror = settle;
      image.src = queue.shift()!;
    });
  };

  const start = () => loadNext();
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  return () => {
    disposed = true;
    window.removeEventListener('load', start);
    cancelScheduled?.();
    if (activeImage) {
      activeImage.onload = null;
      activeImage.onerror = null;
    }
  };
}
