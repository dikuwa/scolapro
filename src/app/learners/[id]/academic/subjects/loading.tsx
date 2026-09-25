import { AppShell } from "@/components/shell/app-shell";
import { Spinner } from "@/components/ui/spinner";

export default function LoadingLearnerSubjects() {
  return <AppShell><div className="grid min-h-[45vh] place-items-center" aria-label="Loading learner subjects"><Spinner className="size-6" /></div></AppShell>;
}
