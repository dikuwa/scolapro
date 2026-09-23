import { AppShell } from "@/components/shell/app-shell";
import { Spinner } from "@/components/ui/spinner";
export default function ClassListsLoading() { return <AppShell><section aria-busy="true" aria-label="Loading Class Lists" className="grid min-h-[45vh] place-items-center"><Spinner className="size-5 text-brand" /></section></AppShell>; }

