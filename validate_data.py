from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
TEXT_FILE_SUFFIXES = {".html", ".css", ".js", ".json", ".md", ".py"}
REQUIRED_JSON = ("site_data.json", "asset_registry.json", "thread_dossiers.json")
ASSET_REF_RE = re.compile(r"assets/[A-Za-z0-9_./-]+")
EXTERNAL_IMAGE_RE = re.compile(r"https?://[^\s\"')]+?\.(?:png|jpe?g|webp|svg)", re.I)
THREAD_ID_RE = re.compile(r"/comments/([a-z0-9]+)/", re.I)
MONTH_RE = re.compile(r"^2025-(0[1-9]|1[0-2])$")
DATE_RE = re.compile(r"^2025-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$")
ALLOWED_EXTERNAL_LINK_KEYS = {
    "source_page",
    "original_url",
    "external_url",
    "reddit_url",
    "url",
}
IMAGE_FIELD_HINTS = ("image", "cover", "preview", "icon", "logo", "mark", "art")


def reject_constant(value: str) -> None:
    raise ValueError(f"Недопустимое JSON-значение: {value}")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file, parse_constant=reject_constant)


def collect_text_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*")
        if path.is_file() and path.suffix in TEXT_FILE_SUFFIXES and ".git" not in path.parts
    )


def validate_required_json() -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    payloads: dict[str, Any] = {}
    for name in REQUIRED_JSON:
        path = DATA_DIR / name
        if not path.exists():
            errors.append(f"Нет файла: {path.relative_to(ROOT)}")
            continue
        try:
            payloads[name] = load_json(path)
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    return errors, payloads


def require_fields(item: dict[str, Any], fields: tuple[str, ...], label: str) -> list[str]:
    return [f"{label}: отсутствует поле '{field}'" for field in fields if field not in item]


def validate_site_data(site_data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required_top = (
        "summary",
        "macros",
        "mode_cards",
        "semantic_points",
        "subreddits",
        "months",
        "entities",
        "entity_timeline",
        "fandoms",
        "sources",
        "topic_lenses",
        "threads",
    )
    errors.extend(require_fields(site_data, required_top, "site_data"))

    seen_thread_ids: set[str] = set()
    for idx, item in enumerate(site_data.get("subreddits", [])):
        errors.extend(
            require_fields(
                item,
                ("id", "title", "posts", "top_macro", "external", "question", "text", "icon"),
                f"subreddits[{idx}]",
            )
        )
    for idx, item in enumerate(site_data.get("months", [])):
        errors.extend(
            require_fields(
                item,
                ("month", "month_name", "title", "label", "count", "community_spread", "examples", "art"),
                f"months[{idx}]",
            )
        )
        month = str(item.get("month", ""))
        if month and not MONTH_RE.fullmatch(month):
            errors.append(f"months[{idx}].month: ожидался месяц 2025 года, получено '{month}'")
    for idx, item in enumerate(site_data.get("threads", [])):
        errors.extend(
            require_fields(
                item,
                ("month", "subreddit", "title", "url", "scene"),
                f"threads[{idx}]",
            )
        )
        month = str(item.get("month", ""))
        if month and not MONTH_RE.fullmatch(month):
            errors.append(f"threads[{idx}].month: ожидался месяц 2025 года, получено '{month}'")
        url = str(item.get("url", ""))
        match = THREAD_ID_RE.search(url)
        if match:
            thread_id = match.group(1)
            if thread_id in seen_thread_ids:
                errors.append(f"threads[{idx}]: повторяющийся thread id '{thread_id}'")
            seen_thread_ids.add(thread_id)
    for idx, item in enumerate(site_data.get("fandoms", [])):
        errors.extend(
            require_fields(
                item,
                ("name", "mentions", "community", "peak_month", "reddit_url", "cover"),
                f"fandoms[{idx}]",
            )
        )
        month = str(item.get("peak_month", ""))
        if month and not MONTH_RE.fullmatch(month):
            errors.append(f"fandoms[{idx}].peak_month: ожидался месяц 2025 года, получено '{month}'")
    for idx, item in enumerate(site_data.get("sources", [])):
        errors.extend(
            require_fields(item, ("domain", "posts", "communities", "mark"), f"sources[{idx}]")
        )
    for idx, item in enumerate(site_data.get("semantic_points", [])):
        errors.extend(
            require_fields(
                item,
                ("title", "subreddit", "month", "reddit_url", "map_x", "map_y"),
                f"semantic_points[{idx}]",
            )
        )
        month = str(item.get("month", ""))
        if month and not MONTH_RE.fullmatch(month):
            errors.append(
                f"semantic_points[{idx}].month: ожидался месяц 2025 года, получено '{month}'"
            )
    for idx, item in enumerate(site_data.get("entity_timeline", [])):
        errors.extend(require_fields(item, ("entity", "month", "mentions"), f"entity_timeline[{idx}]"))
        month = str(item.get("month", ""))
        if month and not MONTH_RE.fullmatch(month):
            errors.append(
                f"entity_timeline[{idx}].month: ожидался месяц 2025 года, получено '{month}'"
            )
    return errors


def validate_thread_dossiers(dossiers_payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    dossiers = dossiers_payload.get("dossiers", [])
    if not isinstance(dossiers, list):
        return ["thread_dossiers.json: ключ 'dossiers' должен быть массивом"]

    seen: set[str] = set()
    for idx, dossier in enumerate(dossiers):
        errors.extend(
            require_fields(
                dossier,
                ("id", "title", "subreddit", "month", "date", "preview", "original_url"),
                f"dossiers[{idx}]",
            )
        )
        dossier_id = str(dossier.get("id", ""))
        if dossier_id in seen:
            errors.append(f"dossiers[{idx}]: повторяющийся id '{dossier_id}'")
        if dossier_id:
            seen.add(dossier_id)
        month = str(dossier.get("month", ""))
        if month and not MONTH_RE.fullmatch(month):
            errors.append(f"dossiers[{idx}].month: ожидался месяц 2025 года, получено '{month}'")
        date = str(dossier.get("date", ""))
        if date and not DATE_RE.fullmatch(date):
            errors.append(f"dossiers[{idx}].date: ожидалась дата 2025 года, получено '{date}'")
    return errors


def validate_asset_registry(asset_registry: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    errors.extend(require_fields(asset_registry, ("meta", "hero", "brand_logos", "communities"), "asset_registry"))
    hero = asset_registry.get("hero", {})
    if isinstance(hero, dict):
        errors.extend(require_fields(hero, ("image",), "asset_registry.hero"))
    return errors


def iter_json_strings(node: Any, path: str = ""):
    if isinstance(node, dict):
        for key, value in node.items():
            next_path = f"{path}.{key}" if path else key
            yield from iter_json_strings(value, next_path)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from iter_json_strings(value, f"{path}[{index}]")
    elif isinstance(node, str):
        yield path, node


def validate_asset_refs(text_files: list[Path], payloads: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    refs: set[str] = set()

    for path in text_files:
        if path.name != "index.html":
            continue
        text = path.read_text(encoding="utf-8")
        refs.update(ASSET_REF_RE.findall(text))

    for name, payload in payloads.items():
        for _, value in iter_json_strings(payload, name):
            if value.startswith("assets/"):
                refs.add(value)

    site_data = payloads["site_data.json"]
    for subreddit in site_data.get("subreddits", []):
        slug = str(subreddit.get("id", "")).lower()
        if slug:
            refs.add(f"assets/community-nav/{slug}.webp")
            refs.add(f"assets/community-nav/{slug}.svg")

    for index, thread in enumerate(site_data.get("threads", []), start=1):
        if index <= 12 and not thread.get("preview"):
            refs.add(f"assets/thread-previews/thread_{index:02d}.webp")

    for ref in sorted(refs):
        asset_path = ROOT / ref
        if not asset_path.exists():
            errors.append(f"Отсутствует asset: {ref}")
    return errors


def validate_placeholders(text_files: list[Path]) -> list[str]:
    errors: list[str] = []
    for path in text_files:
        if path.suffix not in {".html", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        if 'href="#"' in text:
            errors.append(f"{path.relative_to(ROOT)}: найден placeholder href=\"#\"")
    return errors


def validate_external_images(text_files: list[Path], payloads: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for path in text_files:
        if path.suffix not in {".html", ".css", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        matches = EXTERNAL_IMAGE_RE.findall(text)
        if matches:
            errors.append(
                f"{path.relative_to(ROOT)}: найден внешний image URL в текстовом файле"
            )

    for name, payload in payloads.items():
        for key_path, value in iter_json_strings(payload, name):
            if not value.startswith(("http://", "https://")):
                continue
            key_name = key_path.rsplit(".", 1)[-1].split("[", 1)[0]
            lower_key = key_name.lower()
            if key_name in ALLOWED_EXTERNAL_LINK_KEYS:
                continue
            if EXTERNAL_IMAGE_RE.fullmatch(value):
                errors.append(f"{key_path}: внешний image URL запрещён: {value}")
                continue
            if any(hint in lower_key for hint in IMAGE_FIELD_HINTS):
                errors.append(f"{key_path}: внешний URL в поле asset-типа запрещён: {value}")
    return errors


def validate() -> list[str]:
    errors, payloads = validate_required_json()
    if errors:
        return errors

    text_files = collect_text_files()
    errors.extend(validate_site_data(payloads["site_data.json"]))
    errors.extend(validate_thread_dossiers(payloads["thread_dossiers.json"]))
    errors.extend(validate_asset_registry(payloads["asset_registry.json"]))
    errors.extend(validate_asset_refs(text_files, payloads))
    errors.extend(validate_placeholders(text_files))
    errors.extend(validate_external_images(text_files, payloads))
    return errors


if __name__ == "__main__":
    problems = validate()
    if problems:
        print("Ошибка проверки данных:")
        for problem in problems:
            print(f"- {problem}")
        sys.exit(1)
    print("Проверка пройдена: JSON, asset-пути, даты и ссылки корректны.")
