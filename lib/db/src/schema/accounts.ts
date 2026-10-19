import { pgTable, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const accountsTable = pgTable("scamfind_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  emailAlerts: boolean("email_alerts").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("scamfind_accounts_email_idx").on(table.email)]);

// A durable, single-use bootstrap marker prevents a later login from restoring
// an intentionally revoked admin role or granting it to another account.
export const adminBootstrapTable = pgTable("scamfind_admin_bootstrap", {
  key: text("key").primaryKey(),
  userId: text("user_id").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accountsTable);
export type AccountRecord = typeof accountsTable.$inferSelect;
