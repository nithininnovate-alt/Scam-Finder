import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Sensitive case content is stored only inside the authenticated encryption envelope.
export const scansTable = pgTable("scamfind_scans", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  encrypted: text("encrypted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("scamfind_scans_owner_idx").on(table.owner)]);

export const insertScanSchema = createInsertSchema(scansTable);
export type ScanRecord = typeof scansTable.$inferSelect;
export type InsertScanRecord = typeof scansTable.$inferInsert;
