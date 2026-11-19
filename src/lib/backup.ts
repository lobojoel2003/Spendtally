import { normalizeSettings } from './defaults';
import type { Attachment, Bill, Settings, Submission } from './types';

export const BACKUP_FORMAT = 'spendtally-backup';
export const BACKUP_VERSION = 1;

interface SerializedAttachment extends Omit<Attachment, 'blob' | 'thumb'> {
  data: string;
  thumbData?: string | undefined;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  exportedAt: string;
  settings: Settings;
  bills: Bill[];
  submissions: Submission[];
  attachments: SerializedAttachment[];
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function createBackup(input: {
  settings: Settings;
  bills: Bill[];
  submissions: Submission[];
  attachments: Attachment[];
  appVersion: string;
}): Promise<BackupFile> {
  const attachments: SerializedAttachment[] = [];
  for (const a of input.attachments) {
    const { blob, thumb, ...meta } = a;
    attachments.push({
      ...meta,
      data: await blobToBase64(blob),
      thumbData: thumb ? await blobToBase64(thumb) : undefined,
    });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: input.appVersion,
    exportedAt: new Date().toISOString(),
    settings: input.settings,
    bills: input.bills,
    submissions: input.submissions,
    attachments,
  };
}

export class BackupError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates and decodes a backup file. Throws `BackupError` with a readable message. */
export function readBackup(json: unknown): {
  settings: Settings;
  bills: Bill[];
  submissions: Submission[];
  attachments: Attachment[];
} {
  if (!isRecord(json) || json.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a Spendtally backup.');
  }
  if (typeof json.version !== 'number' || json.version > BACKUP_VERSION) {
    throw new BackupError(
      'This backup was made by a newer version of Spendtally. Update the app first.',
    );
  }
  if (!Array.isArray(json.bills) || !Array.isArray(json.attachments)) {
    throw new BackupError('The backup file is incomplete.');
  }
  const bills = (json.bills as Bill[]).filter(
    (b) => isRecord(b) && typeof b.id === 'string' && typeof b.amountCents === 'number',
  );
  const attachments: Attachment[] = (json.attachments as SerializedAttachment[])
    .filter((a) => isRecord(a) && typeof a.id === 'string' && typeof a.data === 'string')
    .map(({ data, thumbData, ...meta }) => ({
      ...meta,
      blob: base64ToBlob(data, meta.mime),
      thumb: thumbData ? base64ToBlob(thumbData, 'image/jpeg') : undefined,
    }));
  const submissions = Array.isArray(json.submissions) ? (json.submissions as Submission[]) : [];
  return {
    settings: normalizeSettings(
      isRecord(json.settings) ? (json.settings as Partial<Settings>) : undefined,
    ),
    bills,
    submissions,
    attachments,
  };
}
