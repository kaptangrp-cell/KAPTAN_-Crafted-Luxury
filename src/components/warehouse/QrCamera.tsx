import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
export function QrCamera({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const callback = useRef(onScan);
  callback.current = onScan;
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    let accepted = false;
    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (disposed || !video.current) return;
        const controls = await new BrowserQRCodeReader().decodeFromConstraints(
          { video: { facingMode: "environment" }, audio: false },
          video.current,
          (result) => {
            if (result && !accepted && !disposed) {
              accepted = true;
              callback.current(result.getText());
            }
          },
        );
        stop = () => controls.stop();
        if (disposed) stop();
      })
      .catch(() => {
        if (!disposed) setError(t("warehouse.cameraError"));
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [t]);
  return (
    <div className="rounded-2xl border border-gold/30 p-3">
      <video ref={video} className="max-h-64 w-full rounded-xl" muted playsInline />
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onClose} className="mt-3 text-gold">
        {t("warehouse.stopCamera")}
      </button>
    </div>
  );
}
