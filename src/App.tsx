import { useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { DashboardPage } from "@/pages/dashboard";
import { TransactionsPage } from "@/pages/transactions";
import { SettingsPage } from "@/pages/settings";
import { CategoriesPage } from "@/pages/categories";
import { CategoryDetailPage } from "@/pages/category-detail";
import { TagAnalyticsPage } from "@/pages/tag-analytics";
import { apiFetch } from "@/lib/api";
import { applyFullThemeFromSaved, type SavedThemePayload } from "@/lib/theme";

function ThemeSyncOnLeaveSettings() {
  const location = useLocation();
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPathname.current;
    prevPathname.current = location.pathname;
    if (prev === "/settings" && location.pathname !== "/settings") {
      void apiFetch("/settings/theme")
        .then((r) => (r.ok ? r.json() : Promise.resolve({})))
        .then((t: SavedThemePayload) => {
          applyFullThemeFromSaved(t);
        })
        .catch(() => {});
    }
  }, [location.pathname]);

  return null;
}

function App() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch("/settings/theme");
        if (!r.ok || cancelled) return;
        const t = (await r.json()) as SavedThemePayload;
        applyFullThemeFromSaved(t);
      } catch {
        /* engine offline or no API */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BrowserRouter>
      <ThemeSyncOnLeaveSettings />
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/explorer" element={<Navigate to="/transactions" replace />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/categories/:key" element={<CategoryDetailPage />} />
          <Route path="/tags" element={<TagAnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<Navigate to="/settings#import" replace />} />
          <Route path="/data" element={<Navigate to="/settings#sync" replace />} />
          <Route path="/onboarding" element={<Navigate to="/settings#akahu" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
