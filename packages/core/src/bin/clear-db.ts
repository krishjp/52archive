import { getCollection, closeDb } from "../db";

async function main() {
  console.log("Connecting to the database and purging custom data...");
  try {
    console.log("Executing delete operations on collections...");
    
    const gameVersionsCol = await getCollection("game_versions");
    const versionsResult = await gameVersionsCol.deleteMany({});
    console.log(`✓ Cleared game_versions (${versionsResult.deletedCount ?? 0} documents deleted).`);
    
    const gamesCol = await getCollection("games");
    const gamesResult = await gamesCol.deleteMany({});
    console.log(`✓ Cleared games (${gamesResult.deletedCount ?? 0} documents deleted).`);
    
    console.log("\n=== DATABASE CLEAR COMPLETE ===");
    console.log("Note: Browser localStorage (52archive_custom_games) must be cleared manually in browser DevTools if needed.");
  } catch (err: any) {
    console.error("Database Error during clear-db execution:", err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
