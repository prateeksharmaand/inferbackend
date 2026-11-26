'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { dateTime } from '@/lib/format';

export interface Ticket { id: string; subject: string; status: string; priority: string; createdAt: string; updatedAt: string; organizationId: string; messages: { authorName: string; body: string; at: string; staff: boolean }[] }

export function Thread({ t, onReply }: { t: Ticket; onReply?: (body: string) => void }) {
  const [reply, setReply] = useState('');
  return (
    <div className="space-y-3">
      <ol className="space-y-2">{t.messages.map((m, i) => <li key={i} className={`rounded-lg p-3 text-sm ${m.staff ? 'bg-primary/5' : 'bg-muted'}`}><p className="text-xs text-muted-foreground">{m.authorName} · {dateTime(m.at)}</p><p className="whitespace-pre-line">{m.body}</p></li>)}</ol>
      {onReply && t.status !== 'CLOSED' && <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onReply(reply); setReply(''); }}><Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" /><Button size="sm" type="submit" disabled={!reply.trim()}>Send reply</Button></form>}
    </div>
  );
}

