// Bootstraps the very first ADMIN user on a fresh production database.
// Deliberately separate from prisma/seed.ts, which is dev/demo-only (wipes
// every table, synthetic data, one shared password) and unsafe to run
// against real data — see BACKLOG.md's "Production bootstrap" item.
//
// Additive-only and refuses to run if an ADMIN already exists, so it's
// safe to leave in the repo rather than something you delete after first
// use — running it again after the first admin exists is a no-op error,
// not a second admin or a reset.
//
// Usage:
//   npx tsx scripts/create-admin.ts --email you@company.com --name "Your Name" [--password "..."]
//
// If --password is omitted, a random one is generated and printed once —
// safer than a weak password typed casually into a bootstrap command that
// may end up in shell history.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${key} needs a value`);
    }
    args[key] = value;
    i++;
  }
  return args;
}

function generatePassword(): string {
  // 18 random bytes -> 24-char base64url, no dependency beyond node:crypto.
  return randomBytes(18).toString("base64url");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  const name = args.name?.trim();
  const generatedPassword = args.password ? null : generatePassword();
  const password = args.password ?? generatedPassword!;

  if (!email || !name) {
    console.error(
      'Usage: npx tsx scripts/create-admin.ts --email you@company.com --name "Your Name" [--password "..."]'
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingAdmin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    if (existingAdmin) {
      console.error(
        `An admin already exists (${existingAdmin.name} <${existingAdmin.email}>) — this script only ` +
          "creates the very first one. Use Settings > Users, signed in as that admin, to add more."
      );
      process.exit(1);
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      console.error(`A user with email ${email} already exists (role: ${existingEmail.role}).`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: UserRole.ADMIN },
    });

    console.log(`Created admin ${user.name} <${user.email}>.`);
    if (generatedPassword) {
      console.log(`Password (shown once, save it now): ${generatedPassword}`);
    }
    console.log("Sign in at /login, then use Settings > Users to add the rest of the team.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
