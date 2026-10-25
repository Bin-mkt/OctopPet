import { useEffect, useRef, useState } from "react";

import { bytesToBase64 } from "../lib/chatHelpers";
import { fetchAttachmentBlob } from "../lib/octopHttp";
import { tauriApi } from "../lib/tauriApi";
import type { ChatMessageAttachment } from "../lib/types";

export type AttachmentContext = {
  baseUrl: string;
  token: string;
};

function failureText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "下载失败";
}

/**
 * Files pushed into the conversation by the agent (send_file / screenshots /
 * generated media) plus the user's own uploads after a reload. Images and
 * videos preview inline; every attachment can be saved through the system
 * save dialog.
 */
export default function MessageAttachments({
  attachments,
  context,
}: {
  attachments: ChatMessageAttachment[];
  context: AttachmentContext | null;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  // Revoke preview object URLs when the message unmounts.
  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    for (const attachment of attachments) {
      if (attachment.kind !== "image" && attachment.kind !== "video") continue;
      if (previews[attachment.url]) continue;
      if (attachment.url.startsWith("data:")) {
        setPreviews((current) => ({
          ...current,
          [attachment.url]: attachment.url,
        }));
        continue;
      }
      if (!context || !context.token) continue;
      void fetchAttachmentBlob(context.baseUrl, context.token, attachment.url)
        .then((blob) => {
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          objectUrlsRef.current.set(attachment.url, objectUrl);
          setPreviews((current) => ({
            ...current,
            [attachment.url]: objectUrl,
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setFailed((current) => ({
            ...current,
            [attachment.url]: failureText(error),
          }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on urls
  }, [attachments, context]);

  const handleDownload = (attachment: ChatMessageAttachment) => {
    if (!context || !context.token || busy) return;
    const url = attachment.url;
    setBusy(url);
    setFailed((current) => {
      const next = { ...current };
      delete next[url];
      return next;
    });
    const blobPromise = url.startsWith("data:")
      ? fetch(url).then((res) => res.blob())
      : fetchAttachmentBlob(context.baseUrl, context.token, url);
    blobPromise
      .then((blob) => blob.arrayBuffer())
      .then((buffer) =>
        tauriApi.saveAttachment(bytesToBase64(buffer), attachment.filename),
      )
      .catch((error) => {
        setFailed((current) => ({ ...current, [url]: failureText(error) }));
      })
      .finally(() => {
        setBusy((current) => (current === url ? null : current));
      });
  };

  if (attachments.length === 0) return null;
  const tokenMissing = !context || !context.token;

  return (
    <div className="message-attachments">
      {attachments.map((attachment) => {
        const preview = previews[attachment.url];
        const downloading = busy === attachment.url;
        return (
          <div
            key={`${attachment.kind}:${attachment.url}`}
            className="message-attachment"
          >
            {attachment.kind === "image" && preview ? (
              <img
                src={preview}
                alt={attachment.filename}
                className="message-attachment-image"
                loading="lazy"
              />
            ) : attachment.kind === "video" && preview ? (
              <video
                src={preview}
                className="message-attachment-video"
                controls
                preload="metadata"
              />
            ) : null}
            <div className="message-attachment-file">
              <span
                className="message-attachment-name"
                title={attachment.filename}
              >
                {attachment.filename}
              </span>
              <button
                type="button"
                className="message-attachment-download"
                disabled={downloading || tokenMissing}
                aria-busy={downloading}
                onClick={() => handleDownload(attachment)}
              >
                {downloading ? "保存中…" : "下载"}
              </button>
            </div>
            {failed[attachment.url] ? (
              <small className="message-attachment-error">
                {failed[attachment.url]}
              </small>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
