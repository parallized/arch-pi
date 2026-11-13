import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
RESOURCES_DIR = REPO_ROOT / "apps" / "desktop" / "resources"
RUNNER = str(RESOURCES_DIR / "agy_hook_runner.exe")
DLL = str(RESOURCES_DIR / "agy_rt_hook.dll")
LOCALAPPDATA = os.environ.get("LOCALAPPDATA", "")
AGY = (
    str(Path(LOCALAPPDATA) / "agy" / "bin" / "agy.exe")
    if LOCALAPPDATA
    else (shutil.which("agy") or "agy")
)

DEFAULT_RT = ""

def run_turn(prompt: str, model: str, refresh_token: str, conversation_id: str | None) -> str | None:
    env = os.environ.copy()
    env.pop("JETSKI_OAUTH_TOKEN", None)
    env["ARCHPI_HOOK_REFRESH_TOKEN"] = refresh_token

    cmd = [
        RUNNER,
        DLL,
        AGY,
        "--model",
        model,
        "--output-format",
        "stream-json",
        f"-p={prompt}",
    ]
    if conversation_id:
        cmd.extend(["--conversation", conversation_id])

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        bufsize=1,
    )

    conv_id = conversation_id
    in_thinking = False
    in_answer = False

    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue
        try:
            evt = json.loads(line)
        except json.JSONDecodeError:
            continue

        if evt.get("conversation_id"):
            conv_id = evt["conversation_id"]

        if evt.get("event") == "step_update":
            su = evt.get("step_update", {})
            thinking_delta = su.get("thinking_delta") or su.get("thinking")
            text_delta = su.get("text_delta")

            if thinking_delta:
                if not in_thinking:
                    print(f"\n[{model} 思考] ", end="", flush=True)
                    in_thinking = True
                print(thinking_delta, end="", flush=True)

            if text_delta:
                if not in_answer:
                    if in_thinking:
                        print()
                    print(f"\n[{model} 回复] ", end="", flush=True)
                    in_answer = True
                print(text_delta, end="", flush=True)

    proc.wait()
    if in_thinking or in_answer:
        print()
    return conv_id


def main() -> None:
    model = sys.argv[1] if len(sys.argv) > 1 else "gemini-3.8-flash-low"
    refresh_token = os.environ.get("ARCHPI_HOOK_REFRESH_TOKEN", DEFAULT_RT)
    conv_id: str | None = None

    # Support scripted turns via args after '--' for non-interactive demo
    if "--" in sys.argv:
        idx = sys.argv.index("--")
        turns = sys.argv[idx + 1 :]
        for prompt in turns:
            print(f"\n[你] {prompt}")
            conv_id = run_turn(prompt, model, refresh_token, conv_id)
        return

    print(f"已进入流式对话（模型: {model}，输入 exit 退出）")
    while True:
        try:
            prompt = input("\n[你] ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not prompt or prompt.lower() in {"exit", "quit"}:
            break
        conv_id = run_turn(prompt, model, refresh_token, conv_id)


if __name__ == "__main__":
    main()
