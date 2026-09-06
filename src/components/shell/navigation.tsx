"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpenText,
  Building2,
  Coins,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  MailPlus,
  MoreHorizontal,
  School,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { NavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";

const navigation = [
  { key: "today", label: "Today", href: "/", icon: LayoutDashboard },
  { key: "family", label: "My children", href: "/parent", icon: HeartHandshake },
  { key: "tenants", label: "Tenants", href: "/platform/tenants", icon: Building2 },
  { key: "invitations", label: "Invitations", href: "/platform/invitations", icon: MailPlus },
  { key: "school_invitations", label: "Invitations", href: "/school/invitations", icon: MailPlus },
  { key: "setup", label: "Academic setup", href: "/school/setup", icon: SlidersHorizontal },
  { key: "school_settings", label: "School settings", href: "/school/settings", icon: School },
  { key: "crc_custody", label: "CRC custody", href: "/school/crc-custody", icon: ShieldCheck },
  { key: "imports", label: "Bulk import", href: "/school/imports", icon: FileSpreadsheet },
  { key: "staff", label: "Staff", href: "/staff", icon: UserRound },
  { key: "learners", label: "Learners", href: "/learners", icon: Users },
  { key: "guardians", label: "Guardians", href: "/school/guardians", icon: HeartHandshake },
  { key: "data_corrections", label: "Data corrections", href: "/school/data-corrections", icon: FilePenLine },
  { key: "timetable", label: "Timetable", href: "/timetable", icon: CalendarClock },
  { key: "attendance", label: "Attendance", href: "/attendance", icon: CalendarCheck2 },
  { key: "late_arrivals", label: "Late arrivals", href: "/late-arrivals", icon: Clock3 },
  { key: "conduct", label: "Conduct", href: "/conduct", icon: HeartHandshake },
  { key: "my_detention", label: "My detention", href: "/my-detention-supervision", icon: ClipboardCheck },
  { key: "teaching", label: "Teaching", href: "/teaching", icon: BookOpenText },
  { key: "assessment", label: "Assessment", href: "/assessment", icon: ClipboardCheck },
  { key: "report_cards", label: "Report cards", href: "/reports/report-cards", icon: FileCheck2 },
  { key: "contributions", label: "Contributions", href: "/school/contributions", icon: Coins },
  { key: "absence_reviews", label: "Absence reviews", href: "/school/absence-reviews", icon: FileText },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const;

const enabledKeysByRole: Record<string, readonly string[]> = {
  platform_admin: ["today", "tenants", "invitations"],
  platform_support: ["today", "tenants"],
  school_admin: ["today", "conduct", "school_invitations", "school_settings", "crc_custody", "setup", "imports", "staff", "learners", "guardians", "data_corrections", "timetable", "attendance", "late_arrivals", "my_detention", "teaching", "assessment", "report_cards", "contributions", "absence_reviews", "calendar"],
  principal: ["today", "conduct", "setup", "school_settings", "crc_custody", "staff", "learners", "guardians", "data_corrections", "timetable", "attendance", "late_arrivals", "my_detention", "teaching", "assessment", "report_cards", "calendar"],
  deputy_principal: ["today", "conduct", "school_settings", "crc_custody", "staff", "learners", "guardians", "data_corrections", "timetable", "attendance", "late_arrivals", "my_detention", "teaching", "assessment", "report_cards", "calendar"],
  hod: ["today", "conduct", "staff", "learners", "guardians", "timetable", "attendance", "my_detention", "teaching", "assessment", "report_cards", "calendar"],
  teacher: ["today", "conduct", "learners", "timetable", "attendance", "my_detention", "teaching", "assessment", "report_cards", "calendar"],
  class_teacher: ["today", "conduct", "learners", "guardians", "timetable", "attendance", "my_detention", "teaching", "assessment", "report_cards", "contributions", "calendar"],
  counsellor: ["today", "conduct", "crc_custody", "learners", "guardians", "data_corrections", "my_detention", "calendar"],
  learner_support: ["today", "crc_custody", "learners", "calendar"],
  social_worker: ["today", "crc_custody", "learners", "calendar"],
  librarian: ["today", "learners", "my_detention"],
  learner: ["today", "teaching", "assessment", "calendar"],
  parent: ["family"],
  board_member: ["today"],
};

function itemsForRole(roleKey?: string) {
  const allowed = roleKey ? enabledKeysByRole[roleKey] ?? ["today"] : ["today"];
  return navigation.filter((item) => allowed.includes(item.key));
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function AttentionBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return <span aria-label={`${count} item${count === 1 ? "" : "s"} need attention`} className={compact ? "absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[color:var(--danger)] px-1 text-[0.56rem] font-bold leading-4 text-white shadow-[var(--shadow-xs)]" : "ml-auto inline-grid min-w-5 place-items-center rounded-full bg-[color:var(--danger)] px-1.5 text-[0.6rem] font-bold leading-5 text-white"}>{label}</span>;
}

export function DesktopNavigation({ roleKey, collapsed = false, attentionCounts = {} }: { roleKey?: string; collapsed?: boolean; attentionCounts?: NavigationAttentionCounts }) {
  const pathname = usePathname();
  const items = itemsForRole(roleKey);
  return <nav aria-label="Primary" className="space-y-1">{items.map((item) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    const count = attentionCounts[item.key] ?? 0;
    const link = <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={collapsed ? `${item.label}${count ? `, ${count} need attention` : ""}` : undefined} className={["relative flex min-h-10 items-center rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-[var(--motion-fast)]", collapsed ? "justify-center px-2" : "gap-3 px-3", active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"].join(" ")}><Icon aria-hidden="true" className="size-[1.05rem] shrink-0" strokeWidth={1.8}/>{collapsed ? <AttentionBadge count={count} compact /> : <><span>{item.label}</span><AttentionBadge count={count} /></>}</Link>;
    return collapsed ? <Tooltip key={item.label} title={`${item.label}${count ? ` · ${count} need attention` : ""}`} side="right">{link}</Tooltip> : <span key={item.label} className="block">{link}</span>;
  })}</nav>;
}

export function MobileNavigation({ roleKey, attentionCounts = {} }: { roleKey?: string; attentionCounts?: NavigationAttentionCounts }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const allItems = itemsForRole(roleKey);
  const primaryItems = allItems.slice(0, 4);
  const overflowItems = allItems.slice(4);
  const showMore = overflowItems.length > 0;
  const overflowCount = overflowItems.reduce((sum, item) => sum + (attentionCounts[item.key] ?? 0), 0);
  return <><nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-[80] border-t border-border-subtle bg-[color:var(--surface)]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"><div className="mx-auto grid max-w-xl gap-1" style={{ gridTemplateColumns: `repeat(${primaryItems.length + (showMore ? 1 : 0)}, minmax(0, 1fr))` }}>{primaryItems.map((item) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    const count = attentionCounts[item.key] ?? 0;
    return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} aria-label={`${item.label}${count ? `, ${count} need attention` : ""}`} className={["relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.68rem] font-medium transition duration-[var(--motion-fast)]", active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"].join(" ")}><span className="relative"><Icon aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.9}/><AttentionBadge count={count} compact /></span><span className="mobile-nav-label max-w-full truncate">{item.label}</span></Link>;
  })}{showMore ? <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-haspopup="dialog" className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.68rem] font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"><span className="relative"><MoreHorizontal aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.9}/><AttentionBadge count={overflowCount} compact /></span><span className="mobile-nav-label">More</span></button> : null}</div></nav>{moreOpen ? <div className="fixed inset-0 z-[140] flex items-end bg-[color:var(--foreground)]/12 backdrop-blur-[1px] lg:hidden" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setMoreOpen(false); }}><div role="dialog" aria-modal="true" aria-label="More navigation" className="w-full rounded-t-[var(--radius-lg)] border border-border-subtle bg-surface-elevated p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-md)]"><div className="mb-3 flex items-center justify-between"><div><p className="scolapro-section-title">More</p><p className="scolapro-section-description">Additional tools for your role.</p></div><button type="button" onClick={() => setMoreOpen(false)} aria-label="Close more navigation" className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"><X className="size-4"/></button></div><div className="grid grid-cols-2 gap-2">{overflowItems.map((item) => {
    const Icon = item.icon;
    const count = attentionCounts[item.key] ?? 0;
    return <Link key={item.label} href={item.href} onClick={() => setMoreOpen(false)} className="relative flex min-h-14 items-center gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-sm font-medium text-foreground shadow-[var(--shadow-xs)]"><Icon className="size-4 text-brand" aria-hidden="true"/><span>{item.label}</span><AttentionBadge count={count} /></Link>;
  })}</div></div></div> : null}</>;
}
