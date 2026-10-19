import { pgTable, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";

export const integrationSettingsTable = pgTable("scamfind_integration_settings", {
  id: text("id").primaryKey(),
  senderEmail: text("sender_email").notNull().default(""),
  senderName: text("sender_name").notNull().default("ScamFind"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailDeliveriesTable = pgTable("scamfind_email_deliveries", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["test", "case_update"] }).notNull(),
  caseId: text("case_id").notNull().default(""),
  caseStatus: text("case_status").notNull().default(""),
  noteChanged: boolean("note_changed").notNull().default(false),
  status: text("status", { enum: ["queued", "sending", "sent", "failed", "cancelled"] }).notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error").notNull().default(""),
  providerId: text("provider_id").notNull().default(""),
  recipient: text("recipient").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("scamfind_email_queue_idx").on(table.status, table.nextAttemptAt)]);

export const integrationUsageTable = pgTable("scamfind_integration_usage", {
  key: text("key").primaryKey(),
  used: integer("used").notNull().default(1),
});
