import 'server-only';
import { neon } from '@neondatabase/serverless';

/* The protein target, and where it is allowed to come from.
 *
 * HealthOS owns every number about his body. The standing rule in HOODII/CLAUDE.md is blunt about
 * it: read what HealthOS publishes, never restate a figure anywhere else, and never type a derived
 * target, because it is computed from lean mass and moves on its own when he is measured again.
 * Every copy is a number that goes stale silently, and one already produced a cross-agent
 * discrepancy on 2026-08-01.
 *
 * The obvious implementation, reading HealthOS/current.json off the disk, is wrong for one reason
 * that only shows up in production: Vercel has no HealthOS directory. It would work on the laptop
 * and return nothing on the phone, which is the only place this page is ever opened.
 *
 * So the target travels the same way the weight does: HealthOS computes it, content/health/sync.mjs
 * copies the published figure into `health_target`, and this reads the newest row. One computation,
 * in the project that owns the body, and everything downstream is a reader.
 */
export interface ProteinTarget {
  grams: number;
  floorGrams: number | null;
  basis: string | null;
  measuredOn: string | null;
  /** HealthOS's own opinion about whether the measurement behind this is too old to present. */
  stale: boolean;
  generatedAt: string;
}

const sql = neon(
  process.env.HEALTH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL || '',
);

export async function getProteinTarget(): Promise<ProteinTarget | null> {
  try {
    const rows = await sql`
      select generated_at, protein_g, protein_floor_g, basis, measured_date, measured_stale
      from health_target order by generated_at desc limit 1
    `;
    const r = rows[0] as
      | {
          generated_at: string;
          protein_g: number | null;
          protein_floor_g: number | null;
          basis: string | null;
          measured_date: string | null;
          measured_stale: boolean | null;
        }
      | undefined;
    if (!r || r.protein_g == null) return null;
    return {
      grams: r.protein_g,
      floorGrams: r.protein_floor_g,
      basis: r.basis,
      measuredOn: r.measured_date,
      stale: r.measured_stale === true,
      generatedAt: r.generated_at,
    };
  } catch {
    /* A target nobody can read is better than a target somebody invented. The caller says it does
       not know rather than printing a number. */
    return null;
  }
}
