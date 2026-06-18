from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image
except ModuleNotFoundError as exc:  # pragma: no cover - environment-specific
    raise SystemExit(
        "Pillow не установлен. Установите его командой "
        "`python3 -m pip install Pillow` и запустите optimize_assets.py повторно."
    ) from exc

ROOT = Path(__file__).resolve().parent
TEXT_TARGETS = [
    ROOT / "index.html",
    ROOT / "app.js",
    ROOT / "data" / "site_data.json",
    ROOT / "data" / "asset_registry.json",
    ROOT / "data" / "thread_dossiers.json",
    ROOT / "build_site_data.py",
]


@dataclass(frozen=True)
class AssetRule:
    directory: str
    max_width: int
    max_bytes: int


RULES = (
    AssetRule("assets/photo", 1920, 600 * 1024),
    AssetRule("assets/months", 1200, 300 * 1024),
    AssetRule("assets/fandom-posters", 900, 250 * 1024),
    AssetRule("assets/communities", 900, 250 * 1024),
    AssetRule("assets/community-nav", 900, 250 * 1024),
    AssetRule("assets/thread-previews", 900, 250 * 1024),
)


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def normalized_size(image: Image.Image, max_width: int) -> tuple[int, int]:
    width, height = image.size
    if width <= max_width:
        return width, height
    ratio = max_width / width
    return max_width, max(1, round(height * ratio))


def save_webp(source: Path, target: Path, max_width: int, max_bytes: int) -> None:
    with Image.open(source) as image:
        image = image.convert("RGBA" if image.mode in {"RGBA", "LA", "P"} else "RGB")
        new_size = normalized_size(image, max_width)
        if new_size != image.size:
            image = image.resize(new_size, Image.Resampling.LANCZOS)

        best_payload: bytes | None = None
        for quality in range(92, 57, -4):
            from io import BytesIO

            buffer = BytesIO()
            image.save(buffer, format="WEBP", quality=quality, method=6)
            payload = buffer.getvalue()
            best_payload = payload
            if len(payload) <= max_bytes:
                target.write_bytes(payload)
                return

        if best_payload is None:
            raise RuntimeError(f"Не удалось создать WebP для {source}")
        target.write_bytes(best_payload)


def convert_group(rule: AssetRule) -> dict[str, str]:
    mapping: dict[str, str] = {}
    directory = ROOT / rule.directory
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        target = path.with_suffix(".webp")
        save_webp(path, target, rule.max_width, rule.max_bytes)
        mapping[str(path.relative_to(ROOT))] = str(target.relative_to(ROOT))
    return mapping


def remove_duplicate_cyberpunk() -> None:
    jpg = ROOT / "assets" / "fandom-posters" / "cyberpunk.jpg"
    png = ROOT / "assets" / "fandom-posters" / "cyberpunk.png"
    if not jpg.exists() or not png.exists():
        return
    if file_hash(jpg) == file_hash(png):
        png.unlink()
        return
    if jpg.stat().st_size <= png.stat().st_size:
        png.unlink()
    else:
        jpg.unlink()


def replace_paths(mapping: dict[str, str]) -> None:
    for path in TEXT_TARGETS:
        text = path.read_text(encoding="utf-8")
        updated = text
        for old, new in mapping.items():
            updated = updated.replace(old, new)
        if path.suffix == ".json":
            parsed = json.loads(updated)
            updated = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def delete_sources(mapping: dict[str, str]) -> None:
    for original in mapping:
        path = ROOT / original
        if path.exists():
            path.unlink()


def main() -> int:
    remove_duplicate_cyberpunk()
    mapping: dict[str, str] = {}
    for rule in RULES:
        mapping.update(convert_group(rule))
    replace_paths(mapping)
    delete_sources(mapping)
    total_bytes = sum(path.stat().st_size for path in (ROOT / "assets").rglob("*") if path.is_file())
    print(f"Оптимизация завершена. Текущий вес assets: {total_bytes / (1024 * 1024):.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
