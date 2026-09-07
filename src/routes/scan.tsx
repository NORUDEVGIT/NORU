import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, X } from "lucide-react";
import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import { parseRestaurantTableQrValue } from "@/lib/restaurant-table-qr";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan Your Table QR Code — NORU" },
      {
        name: "description",
        content: "Scan the QR code on your restaurant table to open the menu and order as a guest.",
      },
      { property: "og:title", content: "Scan Your Table QR Code" },
      {
        property: "og:description",
        content: "Point your camera at the QR code on your table to start ordering.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const [active, setActive] = useState(false);
  const [denied, setDenied] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [starting, setStarting] = useState(false);

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setDenied(false);
    setRejected(false);
    setStarting(true);
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const video = videoRef.current;
      if (!video) return;
      scannerRef.current?.destroy();
      const scanner = new QrScanner(
        video,
        (result: { data: string }) => {
          const parsed = parseRestaurantTableQrValue(result.data);
          if (import.meta.env.DEV) {
            // Token-bearing values are intentionally omitted; route diagnostics
            // are sufficient to debug origin and path mismatches safely.
            console.debug("Table QR scan", {
              hostname: parsed.hostname,
              pathname: parsed.pathname?.replace(/(\/t\/)[^/]+/, "$1[redacted]"),
              accepted: parsed.ok,
              reason: parsed.ok ? null : parsed.reason,
            });
          }
          if (!parsed.ok) {
            setRejected(true);
            return;
          }
          scanner.stop();
          void navigate({
            to: "/r/$restaurantSlug/t/$qrToken",
            params: parsed.route,
            replace: true,
          });
        },
        { highlightScanRegion: true, highlightCodeOutline: true, preferredCamera: "environment" },
      );
      scannerRef.current = scanner as unknown as { stop: () => void; destroy: () => void };
      await scanner.start();
      setActive(true);
    } catch {
      setDenied(true);
      setActive(false);
    } finally {
      setStarting(false);
    }
  }, [navigate]);

  // Camera permission is requested only once the customer lands on /scan.
  useEffect(() => {
    void start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex max-w-md flex-col px-4 py-8">
        <NoruLogo size="md" className="mb-6" />
        <h1 className="font-display text-3xl">Scan your table QR code</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Point your camera at the QR code on your restaurant table.
        </p>

        <div className="mt-6 aspect-square w-full overflow-hidden rounded-3xl border border-border bg-secondary">
          <video ref={videoRef} className="size-full object-cover" muted playsInline />
        </div>

        {rejected ? (
          <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            This QR code is not recognised.
          </p>
        ) : null}

        {denied ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Camera access is required to scan the QR code.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              You can use your phone's normal Camera app to scan the QR code on your table.
            </p>
            <Button className="mt-4 h-12 w-full rounded-full" onClick={() => void start()}>
              Try Again
            </Button>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {!active && !denied ? (
            <Button size="lg" className="h-14 rounded-full" disabled={starting} onClick={() => void start()}>
              <Camera className="mr-2 size-5" />
              {starting ? "Starting camera…" : "Start Camera"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="lg"
            className="h-14 rounded-full"
            onClick={() => {
              stop();
              void navigate({ to: "/" });
            }}
          >
            <X className="mr-2 size-5" />
            Cancel
          </Button>
        </div>
      </main>
    </div>
  );
}
