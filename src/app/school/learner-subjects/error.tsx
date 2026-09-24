"use client";

import { Button } from "@/components/ui/button";

export default function LearnerSubjectsError({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-xl rounded-[var(--radius-md)] bg-surface p-5 text-center shadow-[var(--shadow-xs)]"><h2 className="scolapro-section-title">Subject assignments could not load</h2><p className="scolapro-section-description">Your current school scope may have changed. Retry or return to Learners.</p><Button className="mt-4" onClick={reset}>Retry</Button></div>;
}
