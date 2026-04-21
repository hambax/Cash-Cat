import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageHeader } from "@/components/page-header";
import { AIProviderCard } from "@/components/settings/ai-provider-card";
import { SettingsAkahuPanel } from "@/components/settings/settings-akahu-panel";
import { SettingsImportCsvCard } from "@/components/settings/settings-import-csv-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import {
  applySavedTheme,
  clearAppliedTheme,
  DEFAULT_THEME_ACCENT_HEX,
  DEFAULT_THEME_PRIMARY_HEX,
} from "@/lib/theme";
import { invoke } from "@tauri-apps/api/core";

export function SettingsPage() {
  const location = useLocation();
  const [dataDir, setDataDir] = useState("");
  const [engineDbPath, setEngineDbPath] = useState<string | null>(null);
  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);
  const [primary, setPrimary] = useState(DEFAULT_THEME_PRIMARY_HEX);
  const [accent, setAccent] = useState(DEFAULT_THEME_ACCENT_HEX);

  useEffect(() => {
    invoke("app_data_dir_path")
      .then((p) => setDataDir(String(p)))
      .catch(() => setDataDir(""));
    void apiFetch("/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { db_path?: string } | null) => {
        if (body && typeof body.db_path === "string" && body.db_path.length > 0) {
          setEngineDbPath(body.db_path);
        }
      })
      .catch(() => setEngineDbPath(null));
    apiFetch("/settings/theme")
      .then((r) => r.json())
      .then((t: { primary?: string; accent?: string }) => {
        if (t.primary) setPrimary(t.primary);
        if (t.accent) setAccent(t.accent);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return;
    const id = window.setTimeout(() => {
      document.getElementById(raw)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash, location.pathname]);

  async function saveTheme() {
    applySavedTheme({ primary, accent });
    await apiFetch("/settings/theme", {
      method: "POST",
      body: JSON.stringify({ primary, accent }),
    });
  }

  async function resetTheme() {
    if (!confirm("Reset brand colours to defaults? This removes your saved theme.")) return;
    clearAppliedTheme();
    setPrimary(DEFAULT_THEME_PRIMARY_HEX);
    setAccent(DEFAULT_THEME_ACCENT_HEX);
    await apiFetch("/settings/theme", {
      method: "POST",
      body: JSON.stringify({ reset: true }),
    });
  }

  async function confirmEraseDatabase() {
    setEraseBusy(true);
    try {
      const res = await apiFetch("/settings/reset-database", { method: "POST" });
      if (!res.ok) {
        setEraseBusy(false);
        return;
      }
      setEraseDialogOpen(false);
      window.location.reload();
    } catch {
      setEraseBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Settings"
        description={
          <>
            Connections, imports, appearance, and local data. New here? Use{" "}
            <strong className="font-medium text-foreground">Get started</strong> in the sidebar for the Akahu setup
            walkthrough.
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
        <div className="md:col-span-2 lg:col-span-12">
          <SettingsAkahuPanel />
        </div>

        <div className="md:col-span-2 lg:col-span-12">
          <AIProviderCard />
        </div>

        <div className="lg:col-span-7">
          <SettingsImportCsvCard className="h-full" />
        </div>

        <Card id="appearance" className="scroll-mt-6 flex h-full flex-col rounded-2xl lg:col-span-5">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Primary and accent drive buttons, links, focus rings, and the first chart colour. Picking a colour updates
              the app immediately; use Save colours to store it in your local database (loaded on next launch). Leaving
              this page without saving restores the last saved theme. Contrast is your responsibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label>Primary</Label>
                <Input
                  type="color"
                  value={primary}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPrimary(v);
                    applySavedTheme({ primary: v, accent });
                  }}
                  className="h-10 w-20"
                />
              </div>
              <div className="space-y-2">
                <Label>Accent</Label>
                <Input
                  type="color"
                  value={accent}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAccent(v);
                    applySavedTheme({ primary, accent: v });
                  }}
                  className="h-10 w-20"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="w-fit" onClick={() => void saveTheme()}>
                Save colours
              </Button>
              <Button type="button" variant="outline" className="w-fit" onClick={() => void resetTheme()}>
                Reset to defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col rounded-2xl lg:col-span-4">
          <CardHeader>
            <CardTitle>Updates</CardTitle>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Manual check — opens your browser.</p>
              <p>
                This app does not download or install updates in the background. You stay on the version you have until
                you fetch a new build yourself (for example from the project releases page).
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => openUrl("https://github.com")}
            >
              Check for updates
            </Button>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col rounded-2xl lg:col-span-8">
          <CardHeader>
            <CardTitle>Local data</CardTitle>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Your transactions and settings live in a single SQLite file on disk. The paths below show where that file
                is. Clearing imported data removes transaction rows from that file but keeps your Akahu connection, account
                list, categories, rules, and appearance settings.
              </p>
              {dataDir ? (
                <p className="text-xs">
                  The application data folder is only filled when you use the desktop app; other files may sit beside the
                  database there.
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {engineDbPath ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Engine database file</p>
                <code className="block rounded-lg bg-muted p-2 text-xs break-all">{engineDbPath}</code>
              </div>
            ) : null}
            {dataDir ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Application data folder</p>
                <code className="block rounded-lg bg-muted p-2 text-xs break-all">{dataDir}</code>
              </div>
            ) : null}
            {!engineDbPath && !dataDir ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Start the Cash Cat engine (for example <code className="rounded bg-background px-1 py-0.5 font-mono text-[0.75rem]">npm run engine</code> from the
                project root) or open the desktop app, then refresh this page. The database file path appears once the app
                can reach <code className="rounded bg-background px-1 py-0.5 font-mono text-[0.75rem]">/health</code>.
              </p>
            ) : null}
            <Separator />
            <Button type="button" variant="destructive" className="w-fit" onClick={() => setEraseDialogOpen(true)}>
              Clear imported transactions
            </Button>
          </CardContent>
        </Card>

        <Dialog open={eraseDialogOpen} onOpenChange={setEraseDialogOpen}>
          <DialogContent className="rounded-2xl" onPointerDownOutside={(e) => eraseBusy && e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Clear all imported transactions?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 pt-1 text-muted-foreground">
                  <p>
                    This removes every transaction row and import history from your database, including categories and
                    splits stored on those rows. Your{" "}
                    <strong className="font-medium text-foreground">
                      Akahu API tokens and linked account list are kept
                    </strong>
                    , along with your categories, rules, budgets, AI provider settings, and appearance settings.
                  </p>
                  <p className="text-xs">
                    This cannot be undone. Ensure the engine is running if you use the browser against a local API.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-xl" disabled={eraseBusy} onClick={() => setEraseDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl"
                disabled={eraseBusy}
                onClick={() => void confirmEraseDatabase()}
              >
                {eraseBusy ? "Clearing…" : "Yes, clear transactions"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="md:col-span-2 lg:col-span-12 rounded-2xl">
          <CardHeader>
            <CardTitle>About Cash Cat</CardTitle>
            <CardDescription>v0.1.0 — informational only; not financial advice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Built with Tauri, React, shadcn/ui, FastAPI, and SQLite. Third-party licences are listed in the repository.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
