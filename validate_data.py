from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
REQUIRED = (
    "site_data.json",
    "asset_registry.json",
    "thread_dossiers.json",
)


def reject_constant(value: str):
    raise ValueError(f"Недопустимое JSON-значение: {value}")


def validate_json_files() -> list[str]:
    errors: list[str] = []
    for name in REQUIRED:
        path = DATA / name
        if not path.exists():
            errors.append(f"Нет файла: {path}")
            continue
        try:
            with path.open("r", encoding="utf-8") as file:
                json.load(file, parse_constant=reject_constant)
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    return errors


if __name__ == "__main__":
    problems = validate_json_files()
    if problems:
        print("Ошибка проверки данных:")
        for problem in problems:
            print(f"- {problem}")
        raise SystemExit(1)
    print("JSON-файлы корректны.")
