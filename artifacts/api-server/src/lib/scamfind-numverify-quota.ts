import { db, integrationSettingsTable, integrationUsageTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { NumverifyUsage, NumverifyLimitsInput } from "@workspace/api-zod";

// Additive and idempotent: run before serving requests so existing deployments
// cannot start quota reads against the old settings schema. Never reset values.
export async function ensureNumverifyQuotaSchema(): Promise<void> {
  await db.execute(sql`
    alter table scamfind_integration_settings
      add column if not exists numverify_daily_limit integer not null default 100,
      add column if not exists numverify_monthly_limit integer not null default 3100
  `);
}

// Every instance locks this same row before reading limits or reserving usage.
// Derive the month from existing daily counters, including pre-configuration use.
async function withQuota<T>(action: (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  usage: NumverifyUsage,
  dayKey: string,
) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.insert(integrationSettingsTable).values({ id: "main" }).onConflictDoNothing();
    const [settings] = await tx.select().from(integrationSettingsTable)
      .where(eq(integrationSettingsTable.id, "main")).for("update");
    // Read the database clock after acquiring the lock (not transaction start).
    const clock = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const now = new Date(clock.rows[0].now);
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const dayKey = `numverify:${day}`;
    const [counts] = await tx.select({
      daily: sql<number>`coalesce(sum(case when ${integrationUsageTable.key} = ${dayKey} then ${integrationUsageTable.used} else 0 end), 0)::int`,
      monthly: sql<number>`coalesce(sum(${integrationUsageTable.used}), 0)::bigint`,
    }).from(integrationUsageTable).where(sql`${integrationUsageTable.key} like ${`numverify:${month}-%`}`);
    const dailyUsed = Number(counts.daily);
    const monthlyUsed = Number(counts.monthly);
    const usage: NumverifyUsage = {
      dailyLimit: settings.numverifyDailyLimit, monthlyLimit: settings.numverifyMonthlyLimit,
      dailyUsed, monthlyUsed,
      dailyRemaining: Math.max(0, settings.numverifyDailyLimit - dailyUsed),
      monthlyRemaining: Math.max(0, settings.numverifyMonthlyLimit - monthlyUsed),
      dailyResetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
      monthlyResetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
    return action(tx, usage, dayKey);
  });
}

export function numverifyUsage(): Promise<NumverifyUsage> {
  return withQuota(async (_tx, usage) => usage);
}

export function updateNumverifyLimits(limits: NumverifyLimitsInput): Promise<NumverifyUsage> {
  return withQuota(async (tx, usage) => {
    await tx.update(integrationSettingsTable).set({
      numverifyDailyLimit: limits.dailyLimit,
      numverifyMonthlyLimit: limits.monthlyLimit,
      updatedAt: new Date(),
    }).where(eq(integrationSettingsTable.id, "main"));
    return {
      ...usage, ...limits,
      dailyRemaining: Math.max(0, limits.dailyLimit - usage.dailyUsed),
      monthlyRemaining: Math.max(0, limits.monthlyLimit - usage.monthlyUsed),
    };
  });
}

export function reserveNumverifyLookup(): Promise<boolean> {
  return withQuota(async (tx, usage, dayKey) => {
    if (usage.dailyRemaining === 0 || usage.monthlyRemaining === 0) return false;
    await tx.insert(integrationUsageTable).values({ key: dayKey, used: 1 })
      .onConflictDoUpdate({
        target: integrationUsageTable.key,
        set: { used: sql`${integrationUsageTable.used} + 1` },
      });
    // Commit before contacting the provider. Failed attempts remain reserved:
    // a timeout does not mean the provider did not charge for the lookup.
    return true;
  });
}
