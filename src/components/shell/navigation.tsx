"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpenText,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  LayoutDashboard,
  MailPlus,
  MoreHorizontal,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

const navigation = [
  { key: "today", label: "Today", href: "/", icon: LayoutDashboard },
  { key: "tenants", label: "Tenants", href: "/platform/tenants", icon: Building2 },
  { key: "invitations", label: "Invitations", href: "/platform/invitations", icon: MailPlus },
  { key: "setup", label: "Academic setup", href: "/school/setup", icon: SlidersHorizontal },
  { key: "staff", label: "Staff", href: "/staff", icon: UserRound },
  { key: "learners", label: "Learners", href: "/learners", icon: Users },
  { key: "timetable", label: "Timetable", href: "/timetable", icon: CalendarClock },
  { key: "attendance", label: "Attendance", href: "/attendance", icon: CalendarCheck2 },
  { key: "late_arrivals", label: "Late arrivals", href: "/late-arrivals", icon: Clock3 },
  { key: "teaching", label: "Teaching", href: "/teaching", icon: BookOpenText },
  { key: "assessment", label: "Assessment", href: "/assessment", icon: ClipboardCheck },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const;

const enabledKeysByRole: Record<string, readonly string[]> = {
  platform_admin: ["today", "tenants", "invitations"],
  platform_support: ["today", "tenants"],
  school_admin: ["today", "setup", "invitations", "staff", "learners", "timetable", "attendance", "late_arrivals", "calendar"],
  principal: ["today", "staff", "learners", "timetable", "attendance", "late_arrivals", "assessment", "calendar"],
  deputy_principal: ["today", "staff", "learners", "timetable", "attendance", "late_arrivals", "assessment", "calendar"],
  hod: ["today", "staff", "learners", "timetable", "attendance", "teaching", "assessment", "calendar"],
  teacher: ["today", "learners", "timetable", "attendance", "teaching", "assessment", "calendar"],
  class_teacher: ["today", "learners", "timetable", "attendance", "teaching", "assessment", "calendar"],
  counsellor: ["today", "learners", "calendar"],
  librarian: ["today", "learners"],
  learner: ["today", "teaching", "assessment", "calendar"],
  parent: ["today", "learners", "assessment"],
  board_member: ["today"],
};

function itemsForRole(roleKey?: string) {
  if (!roleKey) return navigation;
  const allowed = enabledKeysByRole[roleKey] ?? ["today"];
  return navigation.filter((item) => allowed.includes(item.key));
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNavigation({ roleKey, collapsed = false }: { roleKey?: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const items = itemsForRole(roleKey);
  return <nav aria-label="Primary" className="space-y-1">{items.map((item) => { const Icon=item.icon; const active=isActive(pathname,item.href); const link=<Link href={item.href} aria-current={active?"page":undefined} aria-label={collapsed?item.label:undefined} className={["flex min-h-10 items-center rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-[var(--motion-fast)]",collapsed?"justify-center px-2":"gap-3 px-3",active?"bg-brand-soft text-brand-strong":"text-muted-foreground hover:bg-surface-muted hover:text-foreground"].join(" ")}><Icon aria-hidden="true" className="size-[1.05rem] shrink-0" strokeWidth={1.8}/>{!collapsed?<span>{item.label}</span>:null}</Link>; return collapsed?<Tooltip key={item.label} title={item.label} side="right">{link}</Tooltip>:<span key={item.label} className="block">{link}</span>;})}</nav>;
}

export function MobileNavigation({ roleKey }: { roleKey?: string }) {
  const pathname = usePathname();
  const [moreOpen,setMoreOpen]=useState(false);
  const allItems=itemsForRole(roleKey); const primaryItems=allItems.slice(0,4); const overflowItems=allItems.slice(4); const showMore=overflowItems.length>0;
  return <><nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-[80] border-t border-border-subtle bg-[color:var(--surface)]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"><div className="mx-auto grid max-w-xl gap-1" style={{gridTemplateColumns:`repeat(${primaryItems.length+(showMore?1:0)}, minmax(0, 1fr))`}}>{primaryItems.map((item)=>{const Icon=item.icon; const active=isActive(pathname,item.href); return <Link key={item.label} href={item.href} aria-current={active?"page":undefined} aria-label={item.label} className={["flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.68rem] font-medium transition duration-[var(--motion-fast)]",active?"bg-brand-soft text-brand-strong":"text-muted-foreground hover:bg-surface-muted hover:text-foreground"].join(" ")}><Icon aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.9}/><span className="mobile-nav-label max-w-full truncate">{item.label}</span></Link>})}{showMore?<button type="button" onClick={()=>setMoreOpen(true)} aria-expanded={moreOpen} aria-haspopup="dialog" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.68rem] font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"><MoreHorizontal aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.9}/><span className="mobile-nav-label">More</span></button>:null}</div></nav>{moreOpen?<div className="fixed inset-0 z-[140] flex items-end bg-[color:var(--foreground)]/12 backdrop-blur-[1px] lg:hidden" role="presentation" onMouseDown={(event)=>{if(event.currentTarget===event.target)setMoreOpen(false)}}><div role="dialog" aria-modal="true" aria-label="More navigation" className="w-full rounded-t-[var(--radius-lg)] border border-border-subtle bg-surface-elevated p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-md)]"><div className="mb-3 flex items-center justify-between"><div><p className="scolapro-section-title">More</p><p className="scolapro-section-description">Additional tools for your role.</p></div><button type="button" onClick={()=>setMoreOpen(false)} aria-label="Close more navigation" className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"><X className="size-4"/></button></div><div className="grid grid-cols-2 gap-2">{overflowItems.map((item)=>{const Icon=item.icon; return <Link key={item.label} href={item.href} onClick={()=>setMoreOpen(false)} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-sm font-medium text-foreground shadow-[var(--shadow-xs)]"><Icon className="size-4 text-brand" aria-hidden="true"/><span>{item.label}</span></Link>})}</div></div></div>:null}</>;
}
