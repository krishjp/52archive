import fs from "fs";
import path from "path";
import yaml from "yaml";
import { YAMLGameDefinitionSchema, GameStateNode, GameTransitionEdge } from "../stateEngine";
import { getCollection, closeDb } from "../db";

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

    const gamesCol = await getCollection("games");
    const gameVersionsCol = await getCollection("game_versions");

    // 1. Ingest/Upsert into the 'games' collection
    await gamesCol.updateOne(
      { _id: gameData.id },
      {
        $set: {
          title: gameData.title,
          subtitle: gameData.subtitle || "",
          summary: gameData.summary,
          min_players: gameData.minPlayers,
          max_players: gameData.maxPlayers,
          play_time_minutes: gameData.playTimeMinutes,
          difficulty: gameData.difficulty,
          tags: gameData.tags,
          needs_paper_scorekeeping: gameData.needsPaperScorekeeping,
          deck_count: gameData.deckCount,
          featured: false,
          status: "draft",
          updated_at: new Date(),
        }
      },
      { upsert: true }
    );
    console.log(`✓ Game "${gameData.title}" upserted in 'games' collection successfully.`);

    // 2. Fetch the next version number for this game
    const versions = await gameVersionsCol.find({ game_id: gameData.id }).toArray();
    let nextVersion = 1;
    if (versions.length > 0) {
      const maxVersion = Math.max(...versions.map(v => v.version));
      nextVersion = maxVersion + 1;
    }

    // 3. Insert into the 'game_versions' collection
    const versionDoc = {
      game_id: gameData.id,
      version: nextVersion,
      graph: graphContent,
      created_at: new Date()
    };

    await gameVersionsCol.insertOne(versionDoc);

    console.log(`✓ Saved version ${nextVersion} of "${gameData.title}" in 'game_versions' successfully.`);
    console.log("=== PUSH COMPLETE ===");
  } catch (err: any) {
    console.error("Database Error during push-yaml execution:", err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
