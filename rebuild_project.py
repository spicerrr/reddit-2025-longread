from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description='Rebuild data and visual assets for the Reddit editorial longread.')
    parser.add_argument('--atlas-dir', type=Path, required=True, help='Path to reddit_content_atlas directory')
    args = parser.parse_args()

    subprocess.run([
        sys.executable,
        str(ROOT / 'build_site_data.py'),
        '--atlas-dir', str(args.atlas_dir),
        '--output', str(ROOT),
    ], check=True)
    subprocess.run([sys.executable, str(ROOT / 'build_visual_assets.py')], check=True)
    print('Rebuild complete:', ROOT)


if __name__ == '__main__':
    main()
