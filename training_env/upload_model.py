import argparse
import base64
import json
import os
import sys
import urllib.request

def main():
    print("WARNING: upload_model.py is DEPRECATED. Use direct database connection updates instead.", file=sys.stderr)
    parser = argparse.ArgumentParser(description="[DEPRECATED] Upload trained PyTorch model weights to 52Archive database")
    parser.add_argument("--game_id", type=str, required=True, help="ID of the game entry in the database")
    parser.add_argument("--model_path", type=str, required=True, help="Path to the trained PyTorch .pt model file")
    parser.add_argument("--arch", type=str, default="mlp", choices=["mlp", "lstm", "gnn"], help="Neural network architecture")
    parser.add_argument("--hidden_dim", type=int, default=128, help="Hidden dimensions of the neural network")
    parser.add_argument("--api_url", type=str, default="http://localhost:4000", help="Root URL of the Express API backend server")

    args = parser.parse_args()

    if not os.path.exists(args.model_path):
        print(f"Error: Model file not found at path: {args.model_path}")
        sys.exit(1)

    print(f"Reading model weights from: {args.model_path}")
    with open(args.model_path, "rb") as f:
        model_bytes = f.read()

    weights_base64 = base64.b64encode(model_bytes).decode("utf-8")
    print("[OK] Encoded model weights successfully in base64.")

    payload = {
        "arch": args.arch,
        "hiddenDim": args.hidden_dim,
        "weightsBase64": weights_base64
    }

    url = f"{args.api_url}/api/games/{args.game_id}/model"
    headers = {
        "Content-Type": "application/json"
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    print(f"Uploading model to {url}...")
    try:
        with urllib.request.urlopen(req) as res:
            res_data = res.read().decode("utf-8")
            parsed = json.loads(res_data)
            if parsed.get("ok"):
                print(f"[OK] Success: Model successfully uploaded and associated with game '{args.game_id}'.")
            else:
                print(f"Error: Upload failed. Server response: {res_data}")
    except Exception as e:
        print(f"Error: Network request failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
