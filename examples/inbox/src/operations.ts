import {
  collection,
  defineOperationFor,
  FILTER_OPS,
  matchesFilter,
  ref,
  resolveField,
  StepExecutionError,
  standardOperations,
  z,
} from "weftai";
import { type InboxContext, Message, Ticket } from "./types.js";

const FilterClause = z.object({
  field: z.string(),
  op: z.enum(FILTER_OPS).default("eq"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const Tickets = collection("tickets", Ticket, {
  label: (t) => t.subject,
  key: (t) => t.id,
  fields: () => [
    { name: "subject", aliases: ["title"], get: (t) => t.subject },
    { name: "customer", aliases: ["company"], get: (t) => t.customer },
    { name: "priority", get: (t) => t.priority },
    { name: "status", get: (t) => t.status },
    { name: "assignee", aliases: ["owner"], get: (t) => t.assignee },
    { name: "tags", get: (t) => (t.tags.length === 0 ? undefined : t.tags.join(", ")) },
  ],
  description: "Support tickets with their customer, priority, status and tags.",
});

export const Messages = collection("messages", Message, {
  label: (m) => `${m.author}: ${m.body}`,
  key: (m) => m.id,
  fields: () => [
    { name: "author", get: (m) => m.author },
    { name: "from", aliases: ["role"], get: (m) => m.from },
    { name: "body", aliases: ["text"], get: (m) => m.body },
    { name: "sentAt", aliases: ["sent"], get: (m) => m.sentAt },
  ],
  description: "Messages on a ticket, oldest first, from customers and agents.",
});

const define = defineOperationFor<InboxContext>();

export const search = define({
  name: "tickets.search",
  description:
    "Find tickets by subject, customer, priority, status, assignee or tags. Use this as the first step; fuzzy matching tolerates casing.",
  input: z.object({ filters: z.array(FilterClause).default([]) }),
  output: Tickets,
  examples: [{ input: { filters: [{ field: "customer", op: "fuzzy", value: "Acme" }] } }],
  run: ({ input, ctx, step }) =>
    ctx.tickets.filter((ticket) =>
      input.filters.every((filter) => {
        const resolved = resolveField(Tickets, filter.field, ctx);
        if (!resolved.ok) throw new StepExecutionError(step.id, "tickets.search", resolved.message);
        return matchesFilter(resolved.field.get(ticket), filter);
      }),
    ),
});

export const waiting = define({
  name: "tickets.waiting",
  description:
    "Open tickets where the customer has waited more than N hours for an agent reply, as of a timestamp (defaults to now). Longest wait first.",
  input: z.object({
    hours: z.int().min(0),
    asOf: z.string().optional(),
  }),
  output: Tickets,
  examples: [{ input: { hours: 24 } }],
  run: ({ input, ctx }) => {
    const now = parseInstant(input.asOf ?? ctx.now);
    return ctx.tickets
      .filter((ticket) => ticket.status === "open")
      .map((ticket) => ({ ticket, since: waitingSince(ticket) }))
      .filter(({ since }) => since !== undefined && now - since > input.hours * 3_600_000)
      .sort((a, b) => (a.since ?? 0) - (b.since ?? 0))
      .map(({ ticket }) => ticket);
  },
});

export const ticketMessages = define({
  name: "tickets.messages",
  description: "Every message on the given tickets, oldest first.",
  input: z.object({ from: ref(Tickets) }),
  output: Messages,
  examples: [{ input: { from: "$acme" } }],
  run: ({ input, ctx }) => {
    const ids = new Set(input.from.items.map((ticket) => ticket.id));
    return [...ctx.messages]
      .filter((message) => ids.has(message.ticketId))
      .sort((a, b) => parseInstant(a.sentAt) - parseInstant(b.sentAt));
  },
});

export const assign = define({
  name: "tickets.assign",
  description:
    "Assign the given tickets to an agent. Takes references to earlier results; duplicates are removed. This changes application state.",
  input: z.object({ refs: z.array(ref(Tickets)).min(1), assignee: z.string().min(1) }),
  output: Tickets,
  effects: "write",
  examples: [{ input: { refs: ["$waiting"], assignee: "Priya" } }],
  run: ({ input, ctx }) => {
    const seen = new Set<string>();
    const items = input.refs
      .flatMap((collection) => [...collection.items])
      .filter((ticket) => {
        if (seen.has(ticket.id)) return false;
        seen.add(ticket.id);
        return true;
      });
    for (const ticket of items) ctx.assignments[ticket.id] = input.assignee;
    return items.map((ticket) => ({ ...ticket, assignee: input.assignee }));
  },
});

export function inboxOperations() {
  return [
    search,
    waiting,
    ticketMessages,
    assign,
    ...standardOperations(Tickets),
    ...standardOperations(Messages, { include: ["filter", "count", "countBy", "first", "pick"] }),
  ];
}

/** When the customer started waiting: the newest message, unless an agent replied after it. */
export function waitingSince(ticket: Ticket): number | undefined {
  const activity = parseInstant(ticket.lastActivityAt);
  if (ticket.lastAgentReplyAt === undefined) return activity;
  return parseInstant(ticket.lastAgentReplyAt) < activity ? activity : undefined;
}

export function parseInstant(iso: string): number {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) {
    throw new Error(`'${iso}' is not an ISO timestamp.`);
  }
  return value;
}
