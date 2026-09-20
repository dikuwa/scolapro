import { CloudOff } from "lucide-react";
import { ScolaProWordmark } from "@/components/brand/scolapro-brand";
import { OfflineAttendanceWorkspace } from "@/components/offline/offline-attendance-workspace";

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-3xl rounded-[var(--radius-lg)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <ScolaProWordmark compact />
        <div className="mt-8 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><CloudOff className="size-5" aria-hidden="true" /></span>
          <div>
            <h1 className="scolapro-page-title text-xl">You are offline</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Reconnect to open a page that is not already available on this device. Supported offline school work is saved locally and syncs when the connection returns.</p>
          </div>
        </div>
        <OfflineAttendanceWorkspace />
      </section>
    </main>
  );
}
