import fs from "fs";
import path from "path";
import { getCollection, closeDb } from "../db";

async function main() {
  const gameId = "custom-judgement-1780684581162";
  const modelPath = path.resolve(process.cwd(), "training_env/model_lstm_ep750_lr0.001_h128_zero_sum_g1_1780954495.pt");

  if (!fs.existsSync(modelPath)) {
    console.error(`Error: Model file not found at path: ${modelPath}`);
    process.exit(1);
  }

  console.log(`Reading model file from: ${modelPath}`);
  const fileBuffer = fs.readFileSync(modelPath);
  const weightsBase64 = fileBuffer.toString("base64");
  console.log(`Successfully read and base64 encoded the model file (length: ${weightsBase64.length} characters).`);

  try {
    const gamesCol = await getCollection("games");
    const game = await gamesCol.findOne({ _id: gameId });

    if (!game) {
      console.warn(`Warning: Game with ID "${gameId}" was not found. Creating a placeholder game to associate the model.`);
      await gamesCol.insertOne({
        _id: gameId,
        title: "Custom Judgement",
        subtitle: "",
        summary: "Custom Judgement Game with LSTM Model",
        min_players: 2,
        max_players: 4,
        play_time_minutes: 30,
        difficulty: "medium",
        tags: ["Judgement"],
        needs_paper_scorekeeping: false,
        deck_count: 1,
        featured: false,
        status: "draft",
        updated_at: new Date()
      });
    }

    console.log(`Updating game "${gameId}" with model weights...`);
    const result = await gamesCol.updateOne(
      { _id: gameId },
      {
        $set: {
          model: {
            arch: "lstm",
            hidden_dim: 128,
            weights_base64: weightsBase64,
            uploaded_at: new Date()
          }
        }
      }
    );

    if (result.modifiedCount > 0 || result.upsertedCount > 0) {
      console.log(`[SUCCESS] Model successfully attached to game "${gameId}".`);
    } else {
      console.log(`[INFO] No changes made (model might already be identical).`);
    }
  } catch (err: any) {
    console.error("Database Error:", err.message);
  } finally {
    await closeDb();
  }
}

main();
