"use client";
import { useQuery } from "@tanstack/react-query";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { appApi, interviewApi } from "@/services";

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const ivs = useQuery({ queryKey: ["interviews", start.toISOString()], queryFn: () => interviewApi.list({ start: start.toISOString(), end: end.toISOString() }) });
  const apps = useQuery({ queryKey: ["applications", "followups"], queryFn: () => appApi.list({ page_size: 500 }) });
  const days = eachDayOfInterval({ start, end });
  const events = (d: Date) => [
    ...(ivs.data ?? []).filter((i) => isSameDay(new Date(i.scheduled_at), d)).map((i) => ({
      key: `i${i.id}`, href: `/applications/${i.application_id}`, label: `${format(new Date(i.scheduled_at), "HH:mm")} ${i.company_name} · ${i.round_name}`, tone: "bg-primary/15 text-primary" })),
    ...(apps.data?.items ?? []).filter((a) => a.follow_up_date && isSameDay(new Date(`${a.follow_up_date}T00:00:00`), d)).map((a) => ({
      key: `f${a.id}`, href: `/applications/${a.id}`, label: `Follow up: ${a.company_name}`, tone: "bg-warning/15 text-warning" })),
  ];
  return (
    <>
      <PageHeader title="Calendar" description="Interviews and follow-ups. Times shown in your browser's timezone."
        actions={<div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft /></Button>
          <span className="w-32 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
          <Button size="icon" variant="outline" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></Button></div>} />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">{days.map((d) => (
          <div key={d.toISOString()} className={cn("min-h-24 border-b border-r p-1.5 text-xs", !isSameMonth(d, month) && "bg-muted/30 text-muted-foreground")}>
            <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full", isSameDay(d, new Date()) && "bg-primary text-primary-foreground")}>{format(d, "d")}</div>
            <div className="space-y-1">{events(d).map((e) => <Link key={e.key} href={e.href} className={cn("block truncate rounded px-1.5 py-0.5", e.tone)}>{e.label}</Link>)}</div>
          </div>))}</div>
      </Card>
    </>
  );
}
