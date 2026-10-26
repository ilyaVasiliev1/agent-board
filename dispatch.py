#!/usr/bin/env python3
"""Запускает `claude --cloud` в эмулированном терминале и печатает JSON с ID сессии.

CLI отказывается создавать облачную сессию без TTY, поэтому из процесса панели его
вызывают через pty. Использование: dispatch.py <папка проекта> <промпт> [модель] [усилие]
"""
import json
import os
import pty
import re
import select
import signal
import sys
import time

ANSI = re.compile(rb"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")
TIMEOUT = 150
# После появления ID даём CLI дописать вывод (клонирование, загрузка) и только потом завершаем процесс.
GRACE = 4


def clean(buf: bytes) -> str:
    return ANSI.sub(b"", buf).decode("utf-8", "replace")


def main(cwd: str, prompt: str, model: str = "", effort: str = "") -> dict:
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(cwd)
        args = ["claude"]
        if model:
            args += ["--model", model]
        if effort:
            args += ["--effort", effort]
        os.execvp("claude", [*args, "--cloud", prompt])
    buf = b""
    found_at = None
    deadline = time.time() + TIMEOUT
    result = None
    while time.time() < deadline:
        ready, _, _ = select.select([fd], [], [], 0.5)
        if ready:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
        # TUI местами съедает пробелы, поэтому признаки ищем без них.
        flat = clean(buf).replace(" ", "")
        if "Itrustthisfolder" in flat or "Quicksafetycheck" in flat:
            result = {"ok": False, "error": "trust", "message": "Claude просит подтвердить доверие к папке проекта."}
            break
        match = re.search(r"session_[0-9A-Za-z]+", flat)
        if match:
            found_at = found_at or time.time()
            if time.time() - found_at >= GRACE:
                result = {"ok": True, "session_id": match.group(0)}
                break
        try:
            done, _ = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if done:
            pid = 0
            break
    if result is None:
        flat = clean(buf)
        match = re.search(r"session_[0-9A-Za-z]+", flat.replace(" ", ""))
        result = {"ok": True, "session_id": match.group(0)} if match else {"ok": False, "error": "no-session", "message": flat.strip()[-800:]}
    if pid:
        # TUI может игнорировать SIGTERM, поэтому после паузы завершаем жёстко и не ждём бесконечно.
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.kill(pid, sig)
                end = time.time() + 3
                while time.time() < end:
                    if os.waitpid(pid, os.WNOHANG)[0]:
                        pid = 0
                        break
                    time.sleep(0.1)
            except (ProcessLookupError, ChildProcessError):
                break
            if not pid:
                break
    flat = clean(buf).replace(" ", "")
    if "isnotonGitHub" in flat:
        result["warning"] = "Ветка не на GitHub: сессия стартовала не с вашей ветки."
    # Без Claude GitHub App на репозитории CLI грузит в облако архив папки: там нет origin и пушить некуда.
    if re.search(r"bundl|upload", flat, re.I):
        result["warning"] = "Облако получило архив папки, а не клон с GitHub: пуш не заработает. Установите Claude GitHub App на репозиторий."
    return result


if __name__ == "__main__":
    print(json.dumps(main(*sys.argv[1:5]), ensure_ascii=False))
