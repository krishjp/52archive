import { query, closePool } from "../db";

async function main() {
  console.log("Connecting to the database and purging custom data...");
  try {
    // Delete all records from game_versions and games. 
    // Foreign key constraint cascade delete is active, but we clean both to be thorough.
    console.log("Executing delete queries...");
    const versionsResult = await query("DELETE FROM game_versions;");
    console.log(`✓ Cleared game_versions (${versionsResult.rowCount ?? 0} rows deleted).`);
    
    const gamesResult = await query("DELETE FROM games;");
    console.log(`✓ Cleared games (${gamesResult.rowCount ?? 0} rows deleted).`);
    
    console.log("\n=== DATABASE CLEAR COMPLETE ===");
    console.log("Note: Browser localStorage (52archive_custom_games) must be cleared manually in browser DevTools if needed.");
  } catch (err: any) {
    console.error("Database Error during clear-db execution:", err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
