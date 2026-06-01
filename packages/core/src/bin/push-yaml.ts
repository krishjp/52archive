import fs from "fs";
import path from "path";
import yaml from "yaml";
import { YAMLGameDefinitionSchema, GameStateNode, GameTransitionEdge } from "../stateEngine";
import { query, closePool } from "../db";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Error: Please provide the path to a YAML game definition file.");
    console.error("Usage: npx tsx src/bin/push-yaml.ts <path-to-yaml-file>");
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at path: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading YAML definition from: ${filePath}`);
  const fileContent = fs.readFileSync(filePath, "utf-8");

  let parsedYaml: any;
  try {
    parsedYaml = yaml.parse(fileContent);
  } catch (err: any) {
    console.error("Error: Failed to parse YAML file. Details:", err.message);
    process.exit(1);
  }

  // Validate the main structure using Zod
  const validationResult = YAMLGameDefinitionSchema.safeParse(parsedYaml);
  if (!validationResult.success) {
    console.error("Error: YAML validation failed!");
    console.error(JSON.stringify(validationResult.error.format(), null, 2));
    process.exit(1);
  }

  const gameData = validationResult.data;
  console.log(`✓ YAML validation successful for game: "${gameData.title}" (${gameData.id})`);

  // Extract the graph structure if defined in the YAML, otherwise default to a simple structure
  let graphContent = parsedYaml.graph || { nodes: [], edges: [] };

  // If the graph is missing but we have core graph definitions, map them into the format
  if (!graphContent.nodes || graphContent.nodes.length === 0) {
    console.log("No explicit UI layout graph found in YAML. Generating a default rule graph node...");
    graphContent = {
      nodes: [
        {
          id: "setup",
          kind: "setup",
          title: "Setup Table",
          body: gameData.summary,
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    };
  }

  try {
    console.log("Connecting to the database and performing upsert...");

    // 1. Ingest/Upsert into the 'games' table
    const gameUpsertQuery = `
      INSERT INTO games (
        id, title, subtitle, summary, min_players, max_players, 
        play_time_minutes, difficulty, tags, needs_paper_scorekeeping, 
        deck_count, featured, status, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        summary = EXCLUDED.summary,
        min_players = EXCLUDED.min_players,
        max_players = EXCLUDED.max_players,
        play_time_minutes = EXCLUDED.play_time_minutes,
        difficulty = EXCLUDED.difficulty,
        tags = EXCLUDED.tags,
        needs_paper_scorekeeping = EXCLUDED.needs_paper_scorekeeping,
        deck_count = EXCLUDED.deck_count,
        featured = EXCLUDED.featured,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id;
    `;

    const gameParams = [
      gameData.id,
      gameData.title,
      gameData.subtitle || "",
      gameData.summary,
      gameData.minPlayers,
      gameData.maxPlayers,
      gameData.playTimeMinutes,
      gameData.difficulty,
      gameData.tags,
      gameData.needsPaperScorekeeping,
      gameData.deckCount,
      false, // featured
      "draft", // status
    ];

    await query(gameUpsertQuery, gameParams);
    console.log(`✓ Game "${gameData.title}" upserted in 'games' table successfully.`);

    // 2. Fetch the next version number for this game
    const versionQuery = `
      SELECT COALESCE(MAX(version), 0) + 1 as next_version 
      FROM game_versions 
      WHERE game_id = $1;
    `;
    const versionResult = await query(versionQuery, [gameData.id]);
    const nextVersion = versionResult.rows[0].next_version;

    // 3. Insert into the 'game_versions' table
    const versionInsertQuery = `
      INSERT INTO game_versions (game_id, version, graph, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, version;
    `;
    const versionParams = [
      gameData.id,
      nextVersion,
      JSON.stringify(graphContent),
    ];

    const versionInsertResult = await query(versionInsertQuery, versionParams);
    const finalVersion = versionInsertResult.rows[0].version;

    console.log(`✓ Saved version ${finalVersion} of "${gameData.title}" in 'game_versions' successfully.`);
    console.log("=== PUSH COMPLETE ===");
  } catch (err: any) {
    console.error("Database Error during push-yaml execution:", err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
