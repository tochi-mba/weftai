import { z } from "weftai";

export const Ticket = z.object({
  id: z.string(),
  subject: z.string(),
  customer: z.string(),
  priority: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  openedAt: z.string(),
  /** ISO timestamp of the newest message on the ticket, whoever sent it. */
  lastActivityAt: z.string(),
  /** ISO timestamp of the newest agent reply; absent when the customer is still waiting. */
  lastAgentReplyAt: z.string().optional(),
  assignee: z.string().optional(),
});
export type Ticket = z.infer<typeof Ticket>;

export const Message = z.object({
  id: z.string(),
  ticketId: z.string(),
  from: z.string(),
  author: z.string(),
  body: z.string(),
  sentAt: z.string(),
});
export type Message = z.infer<typeof Message>;

export interface InboxContext {
  readonly tickets: readonly Ticket[];
  readonly messages: readonly Message[];
  /** ISO timestamp the domain treats as now, so SLA math is deterministic in tests. */
  readonly now: string;
  /** Assignments made through `tickets.assign`, keyed by ticket id. */
  assignments: Record<string, string>;
}
