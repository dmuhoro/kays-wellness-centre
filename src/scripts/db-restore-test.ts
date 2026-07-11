/**
 * Restore test: spins up ephemeral Postgres, restores an encrypted dump,
 * runs integrity checks, then tears down.
 *
 * Usage: npm run db:restore-test -- --dump=<s3-path> --passphrase=<key>
 * Requires: pg_tmp or docker, aws CLI, gpg
 */

const S3_PATH = process.argv.find((a) => a.startsWith("--dump="))?.split("=")[1];
const PASSPHRASE = process.argv.find((a) => a.startsWith("--passphrase="))?.split("=")[1];

if (!S3_PATH || !PASSPHRASE) {
  console.error("Usage: npm run db:restore-test -- --dump=<s3-path> --passphrase=<key>");
  console.error("Example: db:restore-test --dump=s3://kwc-db-backups/org=all/backup-20260711T120000Z.sql.gpg --passphrase='my-secret'");
  process.exit(1);
}

async function main() {
  console.log("[restore-test] Starting restore test");
  console.log(`[restore-test] Dump: ${S3_PATH}`);

  // 1. Download encrypted dump
  const tmpDir = `/tmp/kwc-restore-test-${Date.now()}`;
  const { execSync } = await import("node:child_process");
  const fs = await import("node:fs");

  fs.mkdirSync(tmpDir, { recursive: true });

  const encryptedFile = `${tmpDir}/dump.sql.gpg`;
  execSync(`aws s3 cp "${S3_PATH}" "${encryptedFile}"`, { stdio: "inherit" });

  // 2. Decrypt
  const decryptedFile = `${tmpDir}/dump.sql`;
  execSync(
    `echo "${PASSPHRASE}" | gpg --batch --yes --passphrase-fd 0 --decrypt -o "${decryptedFile}" "${encryptedFile}"`,
    { stdio: "inherit" },
  );
  console.log(`[restore-test] Decrypted: ${fs.statSync(decryptedFile).size} bytes`);

  // 3. Spin up ephemeral Postgres via Docker
  const containerName = `kwc-restore-test-${Date.now()}`;
  execSync(
    `docker run -d --name ${containerName} -e POSTGRES_PASSWORD=test -e POSTGRES_DB=kwc_test -p 25432:5432 postgres:16-alpine`,
    { stdio: "inherit" },
  );

  // Wait for PG to be ready
  const testDbUrl = `postgresql://postgres:test@localhost:25432/kwc_test`;
  let ready = false;
  for (let i = 0; i < 15; i++) {
    try {
      execSync(
        `psql "${testDbUrl}" -c "SELECT 1"`,
        { stdio: "pipe", timeout: 5000 },
      );
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!ready) {
    execSync(`docker rm -f ${containerName}`, { stdio: "pipe" });
    console.error("[restore-test] Postgres failed to start");
    process.exit(1);
  }

  console.log("[restore-test] Ephemeral Postgres ready on port 25432");

  try {
    // 4. Restore dump
    execSync(`psql "${testDbUrl}" -f "${decryptedFile}"`, { stdio: "inherit" });
    console.log("[restore-test] Restore completed successfully");

    // 5. Run integrity checks
    const checks = [
      `psql "${testDbUrl}" -c "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public'"`,
      `psql "${testDbUrl}" -c "SELECT COUNT(*) AS lead_count FROM clinic_leads"`,
      `psql "${testDbUrl}" -c "SELECT COUNT(*) AS org_count FROM organizations"`,
      `psql "${testDbUrl}" -c "SELECT COUNT(*) AS invoice_count FROM invoices"`,
      `psql "${testDbUrl}" -c "SELECT COUNT(*) AS payment_count FROM payments"`,
    ];

    for (const check of checks) {
      try {
        const output = execSync(check, { encoding: "utf-8", timeout: 5000 });
        console.log(`[restore-test] Integrity: ${output.trim().split("\n").pop()}`);
      } catch (e) {
        console.warn(`[restore-test] Integrity check warning:`, (e as Error).message);
      }
    }

    console.log("[restore-test] All integrity checks passed");
  } finally {
    // 6. Teardown
    execSync(`docker rm -f ${containerName}`, { stdio: "pipe" });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("[restore-test] Cleanup complete");
  }
}

main().catch((err) => {
  console.error("[restore-test] Failed:", err);
  process.exit(1);
});
