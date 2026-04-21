import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEngineBaseUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SettingsImportCsvCard({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    setSelectedName(file.name);
    setUploading(true);
    setStatus(null);
    try {
      const base = await getEngineBaseUrl();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${base}/import/csv`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(`Imported ${data.inserted} rows. Rows that were already present were skipped.`);
      } else {
        setStatus(`Error: ${JSON.stringify(data)}`);
      }
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  return (
    <Card id="import" className={cn("scroll-mt-6 flex h-full flex-col rounded-2xl", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          Import CSV
        </CardTitle>
        <CardDescription>
          One or more bank exports. We auto-detect date and amount columns (NZ/AU-friendly). Duplicates are skipped when
          the same row hash already exists.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3">
        <input
          ref={inputRef}
          id="csv-import-input-settings"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={onFile}
          disabled={uploading}
          aria-label="Choose CSV file to import"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Button
            type="button"
            variant="default"
            disabled={uploading}
            className="w-fit rounded-xl"
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Choose file
              </>
            )}
          </Button>
          <p className="min-h-[1.25rem] text-sm text-muted-foreground">
            {selectedName ? (
              <span className="font-medium text-foreground tabular-nums">{selectedName}</span>
            ) : (
              <span className="italic">No file chosen yet</span>
            )}
          </p>
        </div>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}
