import { AppBackLink } from "@/components/navigation/app-back-link";

export function DocumentBackLink({ href, label }: { href: string; label: string }) {
  return <AppBackLink href={href} label={label} />;
}
