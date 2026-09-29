import { useEffect, useState } from "react";

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Estado de conectividad del navegador, derivado de los eventos nativos `online`/`offline`. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
