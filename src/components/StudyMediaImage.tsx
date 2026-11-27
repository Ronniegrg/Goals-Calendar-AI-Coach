import React, { useEffect, useState } from "react";
import { getBlobFromIndexedDB, resolveMediaBlobWithCloudFallback } from "../lib/mediaStorage";

interface StudyMediaImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export const StudyMediaImage: React.FC<StudyMediaImageProps> = ({
  src,
  alt,
  className = "",
  loading = "lazy"
}) => {
  const needsAsyncResolve = src.startsWith("idb://") || src.startsWith("fsimg://");
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => (needsAsyncResolve ? "" : src));
  const [triedIdbFallback, setTriedIdbFallback] = useState(false);

  const objectUrlRef = React.useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTriedIdbFallback(false);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (src.startsWith("idb://") || src.startsWith("fsimg://")) {
      setResolvedSrc("");
      void resolveMediaBlobWithCloudFallback(src).then((blob) => {
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setResolvedSrc(url);
      });
    } else {
      setResolvedSrc(src);
    }

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [src]);

  const handleError = async () => {
    if (triedIdbFallback) return;
    setTriedIdbFallback(true);
    if (src.startsWith("/api/media/")) {
      const blob = await getBlobFromIndexedDB(src);
      if (blob) {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setResolvedSrc(url);
      }
    }
  };

  if (!resolvedSrc) {
    return (
      <div
        aria-label={alt}
        className={`bg-slate-200 dark:bg-slate-800 animate-pulse ${className}`}
      />
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      onError={() => {
        void handleError();
      }}
      className={className}
    />
  );
};

export default StudyMediaImage;
