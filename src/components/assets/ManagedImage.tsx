import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

type ManagedImageProps = {
  src?: string;
  assetRootPath?: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

const managedImageCache = new Map<string, Promise<string>>();

export function isDirectImageSource(value: string): boolean {
  return /^(?:data:|blob:|https?:\/\/|\/(?!\/)|\.{1,2}\/)/i.test(value);
}

async function resolveManagedImage(src: string, assetRootPath?: string): Promise<string> {
  if (isDirectImageSource(src)) return src;
  if (!isTauri()) return "";

  const cacheKey = `${assetRootPath ?? ""}\n${src}`;
  let request = managedImageCache.get(cacheKey);
  if (!request) {
    request = invoke<string>("read_managed_image", {
      path: src,
      assetRootPath: assetRootPath || null,
    });
    managedImageCache.set(cacheKey, request);
  }
  return request;
}

export function ManagedImage({
  src = "",
  assetRootPath,
  alt,
  className = "",
  fallback = null,
}: ManagedImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(() => isDirectImageSource(src) ? src : "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    if (!src) {
      setResolvedSrc("");
      return () => {
        active = false;
      };
    }

    void resolveManagedImage(src, assetRootPath)
      .then((value) => {
        if (active) setResolvedSrc(value);
      })
      .catch((error) => {
        console.error("Could not load managed image.", error);
        if (active) {
          setResolvedSrc("");
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [src, assetRootPath]);

  if (!resolvedSrc || failed) return <>{fallback}</>;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
