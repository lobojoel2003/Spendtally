/**
 * On-device OCR with Tesseract.js. The engine, WebAssembly core and English language data are
 * served from this app (public/ocr), so a bill image never leaves the device.
 */
import type { Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
}

export type ProgressFn = (progress: number, status: string) => void;

let workerPromise: Promise<Worker> | null = null;
let progressListener: ProgressFn | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href;
}

const STATUS_TEXT: Record<string, string> = {
  'loading tesseract core': 'Starting the reader',
  'initializing tesseract': 'Starting the reader',
  'loading language traineddata': 'Loading English text model',
  'loaded language traineddata': 'Loading English text model',
  'initializing api': 'Getting ready',
  'initialized api': 'Getting ready',
  'recognizing text': 'Reading your bill',
};

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        corePath: assetUrl('core/'),
        langPath: assetUrl('lang'),
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          progressListener?.(m.progress, STATUS_TEXT[m.status] ?? 'Working');
        },
      });
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Shuts the OCR worker down after a minute of inactivity to free memory on phones. */
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const p = workerPromise;
    workerPromise = null;
    if (p) (await p).terminate().catch(() => undefined);
  }, 60_000);
}

export async function recognize(
  image: Blob | HTMLCanvasElement,
  onProgress?: ProgressFn,
): Promise<OcrResult> {
  clearTimeout(idleTimer);
  progressListener = onProgress ?? null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return { text: data.text ?? '', confidence: (data.confidence ?? 0) / 100 };
  } finally {
    progressListener = null;
    scheduleIdle();
  }
}

/** Downloads the OCR engine ahead of time so scanning works offline later. */
export async function warmUpOcr(onProgress?: ProgressFn): Promise<void> {
  progressListener = onProgress ?? null;
  try {
    await getWorker();
  } finally {
    progressListener = null;
    scheduleIdle();
  }
}
