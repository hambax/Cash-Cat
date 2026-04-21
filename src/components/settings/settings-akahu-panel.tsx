import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MagicActionButton } from "@/components/ui/magic-action-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { AkahuSyncDateRange } from "@/components/akahu-sync-date-range";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";

const ACCOUNT_KINDS: { value: string; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "everyday", label: "Everyday / cheque" },
  { value: "credit_card", label: "Credit card" },
  { value: "savings", label: "Savings" },
  { value: "loan", label: "Loan / mortgage" },
  { value: "other", label: "Other" },
];

type Account = {
  akahu_account_id: string;
  institution_name: string;
  account_name: string;
  mask: string;
  logo_url?: string | null;
  enabled: boolean;
  account_kind: string;
};

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function SettingsAkahuPanel() {
  const [appToken, setAppToken] = useState("");
  const [userToken, setUserToken] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [validating, setValidating] = useState(false);
  const [syncingQuick, setSyncingQuick] = useState(false);
  const [syncingFull, setSyncingFull] = useState(false);
  const syncing = syncingQuick || syncingFull;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, sRes, aRes] = await Promise.all([
          apiFetch("/akahu/credentials"),
          apiFetch("/akahu/sync-defaults"),
          apiFetch("/akahu/accounts"),
        ]);
        if (cancelled) return;
        if (cRes.ok) {
          const c = await cRes.json();
          setAppToken(typeof c.app_token === "string" ? c.app_token : "");
          setUserToken(typeof c.user_token === "string" ? c.user_token : "");
        }
        if (sRes.ok) {
          const s = await sRes.json();
          if (typeof s.start === "string" && s.start) setStart(s.start);
          if (typeof s.end === "string" && s.end) setEnd(s.end);
        }
        if (aRes.ok) {
          const a = await aRes.json();
          const list = a.accounts as Account[] | undefined;
          if (list && list.length > 0) {
            setAccounts(
              list.map((x) => ({
                ...x,
                enabled: Boolean(x.enabled),
                account_kind: x.account_kind ?? "unknown",
              })),
            );
          }
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !start || !end) return;
    const t = window.setTimeout(() => {
      void apiFetch("/akahu/sync-defaults", {
        method: "POST",
        body: JSON.stringify({ start, end }),
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [start, end, hydrated]);

  async function validate() {
    setValidating(true);
    try {
      await toast.promise(
        (async () => {
          const res = await apiFetch("/akahu/validate", {
            method: "POST",
            body: JSON.stringify({ app_token: appToken, user_token: userToken }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(typeof data.detail === "string" ? data.detail : "Couldn’t reach Akahu");
          }
          const mapped: Account[] = (data.accounts ?? []).map((a: Account) => ({
            ...a,
            enabled: true,
            account_kind: a.account_kind ?? "unknown",
          }));
          setAccounts(mapped);
          const saveC = await apiFetch("/akahu/credentials", {
            method: "POST",
            body: JSON.stringify({ app_token: appToken, user_token: userToken }),
          });
          if (!saveC.ok) {
            const err = await saveC.json().catch(() => ({}));
            throw new Error(
              typeof err.detail === "string" ? err.detail : "Couldn’t save credentials locally",
            );
          }
          return mapped.length;
        })(),
        {
          loading: "Connecting to Akahu…",
          success: (n) => `Loaded ${n} account${n === 1 ? "" : "s"}.`,
          error: errMessage,
        },
      );
    } finally {
      setValidating(false);
    }
  }

  function toggle(id: string, on: boolean) {
    setAccounts((prev) => prev.map((a) => (a.akahu_account_id === id ? { ...a, enabled: on } : a)));
  }

  function setAccountKind(id: string, account_kind: string) {
    setAccounts((prev) => prev.map((a) => (a.akahu_account_id === id ? { ...a, account_kind } : a)));
  }

  async function persistAndSync() {
    setSyncingFull(true);
    try {
      await toast.promise(
        (async () => {
          await apiFetch("/akahu/accounts/persist", {
            method: "POST",
            body: JSON.stringify(accounts),
          });
          await apiFetch("/akahu/credentials", {
            method: "POST",
            body: JSON.stringify({ app_token: appToken, user_token: userToken }),
          });
          await apiFetch("/akahu/sync-defaults", {
            method: "POST",
            body: JSON.stringify({ start, end }),
          });
          const res = await apiFetch("/akahu/sync", {
            method: "POST",
            body: JSON.stringify({}),
          });
          const data = (await res.json()) as {
            imported?: number;
            account_errors?: Record<string, string>;
            detail?: string;
          };
          if (!res.ok) {
            throw new Error(typeof data.detail === "string" ? data.detail : "Sync failed");
          }
          return data;
        })(),
        {
          loading: "Pulling transactions from Akahu…",
          success: (data) => {
            const n = data.imported ?? 0;
            const errs = data.account_errors;
            const base = `Imported ${n} transaction${n === 1 ? "" : "s"}.`;
            if (errs && Object.keys(errs).length > 0) {
              return `${base} Some accounts failed: ${Object.entries(errs)
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ")}`;
            }
            return base;
          },
          error: errMessage,
        },
      );
    } finally {
      setSyncingFull(false);
    }
  }

  async function syncNowQuick() {
    setSyncingQuick(true);
    try {
      await toast.promise(
        (async () => {
          await apiFetch("/akahu/sync-defaults", {
            method: "POST",
            body: JSON.stringify({ start, end }),
          });
          const res = await apiFetch("/akahu/sync", {
            method: "POST",
            body: JSON.stringify({}),
          });
          const data = (await res.json()) as {
            imported?: number;
            account_errors?: Record<string, string>;
            detail?: string;
          };
          if (!res.ok) {
            throw new Error(typeof data.detail === "string" ? data.detail : "Sync failed");
          }
          return data;
        })(),
        {
          loading: "Syncing with Akahu…",
          success: (data) => {
            const n = data.imported ?? 0;
            const errs = data.account_errors;
            if (errs && Object.keys(errs).length > 0) {
              return `Imported ${n} new row${n === 1 ? "" : "s"}. Some accounts failed: ${Object.entries(errs)
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ")}`;
            }
            return n === 0
              ? "Sync finished. No new rows (duplicates skipped)."
              : `Imported ${n} new row${n === 1 ? "" : "s"}.`;
          },
          error: errMessage,
        },
      );
    } finally {
      setSyncingQuick(false);
    }
  }

  const connectSection = (
    <div id="akahu" className={cn("scroll-mt-6", accounts.length > 0 && "shrink-0")}>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Connect Akahu</CardTitle>
          <CardDescription>
            Create a personal app and tokens at Akahu, then paste them here. Banks are linked on Akahu’s site.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-app">App ID (X-Akahu-Id)</Label>
            <Input
              id="settings-app"
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-user">User access token</Label>
            <Input
              id="settings-user"
              type="password"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-primary"
              onClick={() => openUrl("https://my.akahu.nz/apps")}
            >
              Open Akahu apps <ExternalLink className="ml-1 inline h-3 w-3" />
            </Button>
          </div>
          <MagicActionButton
            type="button"
            onClick={validate}
            loading={validating}
            loadingLabel="Connecting…"
            disabled={syncing}
          >
            Load accounts
          </MagicActionButton>
        </CardContent>
      </Card>
    </div>
  );

  const syncSection = (
    <div
      id="sync"
      className={cn("scroll-mt-6", accounts.length > 0 && "flex min-h-0 flex-1 flex-col")}
    >
      <Card
        className={cn(
          "rounded-2xl",
          accounts.length > 0 && "flex h-full min-h-0 flex-1 flex-col",
        )}
      >
        <CardHeader>
          <CardTitle>Sync from Akahu</CardTitle>
          <CardDescription>
            Default date range for pulls. Use <strong>Sync now</strong> for a quick fetch, or <strong>Pull and save</strong>{" "}
            to persist account toggles and types first, then import.
          </CardDescription>
        </CardHeader>
        <CardContent
          className={cn(
            accounts.length > 0 ? "flex min-h-0 flex-1 flex-col justify-between gap-4" : "space-y-4",
          )}
        >
          <AkahuSyncDateRange
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
            disabled={validating || syncing}
          />
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <MagicActionButton
              type="button"
              onClick={syncNowQuick}
              loading={syncingQuick}
              loadingLabel="Syncing…"
              disabled={!start || !end || validating || syncingFull}
            >
              Sync now
            </MagicActionButton>
            {accounts.length > 0 ? (
              <MagicActionButton
                type="button"
                variant="secondary"
                onClick={persistAndSync}
                loading={syncingFull}
                loadingLabel="Pulling…"
                disabled={!start || !end || validating || syncingQuick}
              >
                Pull and save accounts
              </MagicActionButton>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const linkedAccountsSection =
    accounts.length > 0 ? (
      <Card className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl">
        <CardHeader>
          <CardTitle>Linked accounts</CardTitle>
          <CardDescription>
            Included in download by default; turn off any you do not want. Set account type so transfers between
            everyday and credit cards can be recognised (card repayments are excluded from double-counted spending).
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-3">
          {accounts.map((a) => (
            <div
              key={a.akahu_account_id}
              className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <InstitutionAvatar institutionName={a.institution_name} logoUrl={a.logo_url} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.institution_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {a.account_name} {a.mask}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <label className="sr-only" htmlFor={`kind-${a.akahu_account_id}`}>
                  Account type
                </label>
                <Select
                  value={a.account_kind ?? "unknown"}
                  onValueChange={(v) => setAccountKind(a.akahu_account_id, v)}
                  disabled={validating || syncing}
                >
                  <SelectTrigger
                    id={`kind-${a.akahu_account_id}`}
                    className="h-10 min-w-[14rem] w-full max-w-xs rounded-xl text-sm"
                  >
                    <SelectValue placeholder="Account type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {ACCOUNT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value} className="rounded-lg">
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground">Include</span>
                  <Switch
                    checked={a.enabled}
                    onCheckedChange={(v) => toggle(a.akahu_account_id, v)}
                    disabled={validating || syncing}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    ) : null;

  return (
    <div
      className={
        accounts.length > 0
          ? "grid gap-6 lg:grid-cols-[3fr_7fr] lg:items-stretch"
          : "flex flex-col gap-6"
      }
    >
      {accounts.length > 0 ? (
        <>
          <div className="flex min-h-0 min-w-0 flex-col gap-6 lg:h-full">
            {connectSection}
            {syncSection}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col lg:h-full">{linkedAccountsSection}</div>
        </>
      ) : (
        <>
          {connectSection}
          {syncSection}
        </>
      )}
    </div>
  );
}
