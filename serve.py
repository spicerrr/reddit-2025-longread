from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
import threading
import webbrowser
from pathlib import Path

from validate_data import validate_json_files

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"


class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        # Local development must always show the newest JSON and JavaScript files.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((HOST, port)) != 0


def choose_port(preferred: int) -> int:
    if preferred == 0:
        return 0
    if port_is_free(preferred):
        return preferred
    for port in range(preferred + 1, preferred + 101):
        if port_is_free(port):
            return port
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Reddit longread locally.")
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Preferred port. If occupied, the launcher selects the next free port.",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the browser automatically.",
    )
    args = parser.parse_args()

    data_errors = validate_json_files()
    if data_errors:
        print("\nСайт не запущен: повреждены файлы данных.")
        for error in data_errors:
            print(f"- {error}")
        print("\nРаспакуйте архив заново или запустите: python3 validate_data.py\n")
        raise SystemExit(1)

    selected = choose_port(args.port)
    with ReusableThreadingTCPServer((HOST, selected), Handler) as server:
        actual_port = int(server.server_address[1])
        url = f"http://{HOST}:{actual_port}"
        print("\nReddit longread is running")
        print(f"Folder: {ROOT}")
        print(f"Open:   {url}")
        print("Stop:   Control + C\n")

        if not args.no_browser:
            threading.Timer(0.7, lambda: webbrowser.open(url)).start()

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
