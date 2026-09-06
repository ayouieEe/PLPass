import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Encodes a PLPass credential consistently everywhere it is displayed.
 */
export function useQrCredentialDataUrl(active: boolean, value: string) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!active || !value) {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#16351f",
        light: "#ffffff"
      }
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [active, value]);

  return qrDataUrl;
}
