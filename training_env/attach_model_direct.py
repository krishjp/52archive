import argparse
import base64
import datetime
import os
import sys
from pymongo import MongoClient

def main():
    parser = argparse.ArgumentParser(description="Directly attach trained PyTorch model weights to MongoDB")
    parser.add_argument("--game_id", type=str, default="custom-judgement-1780684581162", help="ID of the game entry in the database")
    parser.add_argument("--model_path", type=str, default="model_lstm_ep750_lr0.001_h128_zero_sum_g1_1780954495.pt", help="Path to the trained PyTorch .pt model file")
    parser.add_argument("--arch", type=str, default="lstm", choices=["mlp", "lstm", "gnn"], help="Neural network architecture")
    parser.add_argument("--hidden_dim", type=int, default=128, help="Hidden dimensions of the neural network")
    parser.add_argument("--mongo_uri", type=str, default="mongodb://localhost:27017/", help="MongoDB connection string")

    args = parser.parse_args()

    if not os.path.exists(args.model_path):
        print(f"Error: Model file not found at path: {args.model_path}")
        sys.exit(1)

    print(f"Reading model weights from: {args.model_path}")
    with open(args.model_path, "rb") as f:
        model_bytes = f.read()

    weights_base64 = base64.b64encode(model_bytes).decode("utf-8")
    print("[OK] Encoded model weights successfully in base64.")

    print(f"Connecting to database at {args.mongo_uri}...")
    try:
        client = MongoClient(args.mongo_uri)
        db = client["52archive"]
        games_col = db["games"]

        print(f"Attaching model to game ID: {args.game_id}...")
        result = games_col.update_one(
            {"_id": args.game_id},
            {
                "$set": {
                    "model": {
                        "arch": args.arch,
                        "hidden_dim": args.hidden_dim,
                        "weights_base64": weights_base64,
                        "uploaded_at": datetime.datetime.now(datetime.timezone.utc)
                    }
                }
            }
        )

        if result.modified_count > 0 or result.matched_count > 0:
            print(f"[OK] Success: Model successfully attached directly to game '{args.game_id}'.")
        else:
            print("Warning: Document matched but no changes were made.")
    except Exception as e:
        print(f"Error: Database update failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
