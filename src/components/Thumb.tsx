import { useEffect, useState } from 'preact/hooks';
import { getAttachment } from '../lib/db';
import { Icon } from './Icon';

/** Shows an attachment's thumbnail from IndexedDB, with a file icon for PDFs. */
export function Thumb({
  attachmentId,
  class: cls = 'thumb',
}: {
  attachmentId?: string | undefined;
  class?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pdf, setPdf] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setPdf(false);
    if (attachmentId) {
      void getAttachment(attachmentId).then((a) => {
        if (!alive || !a) return;
        if (a.mime === 'application/pdf') {
          setPdf(true);
          return;
        }
        objectUrl = URL.createObjectURL(a.thumb ?? a.blob);
        setUrl(objectUrl);
      });
    }
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);
  return (
    <div class={cls} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <Icon name={pdf ? 'file' : 'image'} />}
    </div>
  );
}
