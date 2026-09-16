import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry, createRuntime, type Registry, z } from "weftai";
import { messages, NOW, tickets } from "./fixture.js";
import { inboxOperations } from "./operations.js";
import { type InboxContext, Message, Ticket } from "./types.js";

const FixtureFile = z.object({
  now: z.string().default(NOW),
  tickets: z.array(Ticket),
  messages: z.array(Message),
});

export function createContext(
  allTickets: readonly Ticket[] = tickets,
  allMessages: readonly Message[] = messages,
  now: string = NOW,
): InboxContext {
  return { tickets: allTickets, messages: allMessages, now, assignments: {} };
}

export function loadContext(fixturePath?: string): InboxContext {
  if (fixturePath === undefined) return createContext();
  const raw: unknown = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  const parsed = FixtureFile.parse(raw);
  return createContext(parsed.tickets, parsed.messages, parsed.now);
}

export const registry: Registry<InboxContext> = createRegistry({
  operations: inboxOperations(),
});

export function createInboxRuntime(
  allTickets: readonly Ticket[] = tickets,
  allMessages: readonly Message[] = messages,
  now: string = NOW,
) {
  return {
    runtime: createRuntime({ registry }),
    ctx: createContext(allTickets, allMessages, now),
  };
}

const domain = {
  registry,
  createContext: loadContext,
};

export default domain;
