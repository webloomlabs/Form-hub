import path from "node:path";
import dotenv from "dotenv";

/**
 * Side-effect module: loads .env.local before anything else is imported.
 * Next does this automatically; a standalone Node process does not, and
 * lib/prisma.ts throws at import time if DATABASE_URL is missing.
 *
 * In Docker the environment is supplied by compose, and `override: false`
 * keeps real env vars winning over any file that happens to be present.
 */
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });
