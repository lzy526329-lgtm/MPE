#!/usr/bin/env python3
"""Resize and copy game art into website/assets for the promo site."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_FARM = ROOT / "public" / "farm"
SRC_FOOD = ROOT / "public" / "foods"
SRC_ICON = ROOT / "build" / "icon.png"
SRC_DONGHUA = ROOT / "donghua"
OUT = Path(__file__).resolve().parent / "assets"
CHAR_OUT = OUT / "characters"


def trim_alpha(im: Image.Image) -> Image.Image:
    if im.mode != "RGBA":
        return im
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def save_resized(src: Path, dest: Path, max_size: int, quality: int = 82) -> None:
    im = Image.open(src).convert("RGBA")
    if dest.name not in {"farm-bg.webp", "icon.png"}:
        im = trim_alpha(im)
    w, h = im.size
    scale = min(1.0, max_size / max(w, h))
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.suffix == ".webp":
        im.save(dest, "WEBP", quality=quality, method=4)
    else:
        im.save(dest, optimize=True)
    print(f"{dest.relative_to(OUT.parent)}  {im.size[0]}x{im.size[1]}  {dest.stat().st_size / 1024:.0f} KB")


JOBS = [
    (SRC_FARM / "farm-bg.png", OUT / "farm-bg.webp", 1600, 78),
    (SRC_FARM / "dikuai1.png", OUT / "plot.webp", 280, 80),
    (SRC_FARM / "room-cutout.png", OUT / "room.webp", 640, 82),
    (SRC_FARM / "大风车-cutout.png", OUT / "windmill.webp", 420, 82),
    (SRC_FARM / "稻草人-cutout.png", OUT / "scarecrow.webp", 360, 82),
    (SRC_FARM / "花丛1-cutout.png", OUT / "flowers.webp", 360, 82),
    (SRC_FARM / "pond.png", OUT / "pond.webp", 480, 80),
    (SRC_FARM / "蘑菇-cutout.png", OUT / "mushroom.webp", 280, 82),
    (SRC_FARM / "邮箱-cutout.png", OUT / "mailbox.webp", 280, 82),
    (SRC_FARM / "长椅-cutout.png", OUT / "bench.webp", 360, 82),
    (SRC_FARM / "caoduo-cutout.png", OUT / "hay.webp", 360, 82),
    (SRC_FARM / "水壶-cutout.png", OUT / "can.webp", 280, 82),
    (SRC_FARM / "镰刀-cutout.png", OUT / "sickle.webp", 280, 82),
    (SRC_FARM / "种子袋-cutout.png", OUT / "seeds.webp", 280, 82),
    (SRC_FARM / "小麦" / "3-cutout.png", OUT / "wheat.webp", 280, 82),
    (SRC_FARM / "苹果" / "3-cutout.png", OUT / "apple.webp", 320, 82),
    (SRC_FARM / "玉米" / "3-cutout.png", OUT / "corn.webp", 280, 82),
    (SRC_FARM / "香蕉" / "3-cutout.png", OUT / "banana.webp", 280, 82),
    (SRC_FARM / "小麦" / "shopImg-cutout.png", OUT / "wheat-seed.webp", 220, 82),
    (SRC_FARM / "苹果" / "shopImg-cutout.png", OUT / "apple-seed.webp", 220, 82),
    (SRC_FOOD / "草莓牛奶.png", OUT / "food-milk.webp", 280, 82),
    (SRC_FOOD / "奶油面包.png", OUT / "food-bread.webp", 280, 82),
    (SRC_FOOD / "饼干.png", OUT / "food-cookie.webp", 280, 82),
    (SRC_FOOD / "巧克力.png", OUT / "food-choco.webp", 280, 82),
    (SRC_ICON, OUT / "icon.png", 256, 90),
]


def copy_characters() -> None:
    if not SRC_DONGHUA.is_dir():
        raise FileNotFoundError(SRC_DONGHUA)
    CHAR_OUT.mkdir(parents=True, exist_ok=True)
    for folder in sorted(SRC_DONGHUA.iterdir()):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        files = list(folder.glob("*"))
        has_skel = any(item.suffix == ".skel" for item in files)
        has_atlas = any(item.suffix == ".atlas" for item in files)
        if not (has_skel and has_atlas):
            continue
        dest = CHAR_OUT / folder.name
        dest.mkdir(parents=True, exist_ok=True)
        for item in files:
            if item.suffix.lower() in {".skel", ".atlas", ".png", ".webp", ".json"}:
                target = dest / item.name
                target.write_bytes(item.read_bytes())
                print(f"characters/{folder.name}/{item.name}  {target.stat().st_size / 1024:.0f} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src, dest, size, quality in JOBS:
        if not src.exists():
            raise FileNotFoundError(src)
        save_resized(src, dest, size, quality)
    copy_characters()


if __name__ == "__main__":
    main()
