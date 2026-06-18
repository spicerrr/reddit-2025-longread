#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "data/site_data.json"
SOURCES = [
    ROOT / "reddit_posts_2025_balanced_19200.csv",
    ROOT.parent / "reddit_posts_2025_balanced_19200.csv",
    Path("/mnt/data/reddit_posts_2025_balanced_19200.csv"),
    ROOT / "reddit_posts_2025_all_candidates.csv",
    ROOT.parent / "reddit_posts_2025_all_candidates.csv",
    Path("/mnt/data/reddit_posts_2025_all_candidates.csv"),
]

# The centres are only weak thematic priors. Individual anchors are spread widely
# inside each field and bridge posts are shifted toward related fields.
CENTERS = {
    "technology": (1500.0, 1050.0),
    "everyday": (5350.0, 1050.0),
    "power": (1450.0, 3300.0),
    "culture": (3650.0, 3200.0),
    "science": (5750.0, 3220.0),
}
WORLD = (7200.0, 4550.0)
STOP = set(
    "the a an and or but if then else to of in on for from with without at by as is are was were be been being this that these those it its they them their we our you your i me my he she his her who what when where why how can could should would will just about into over under after before more most less very not no yes do does did done have has had having than too also new one two get got make made like people time way use used using still much many really even first last best good great think know want need says said say".split()
)
TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'’-]{2,}")


def thread_id(url: str) -> str:
    match = re.search(r"/comments/([a-z0-9]+)/", str(url), re.I)
    return match.group(1) if match else ""


def source_paths() -> list[Path]:
    found: list[Path] = []
    for path in SOURCES:
        if path.exists() and path not in found:
            found.append(path)
    if not found:
        raise FileNotFoundError("Reddit CSV sources missing")
    return found


def tokens(text: str) -> list[str]:
    return [
        token.lower().replace("’", "'")
        for token in TOKEN_RE.findall(str(text))
        if token.lower() not in STOP
    ]


def robust_weight(values: list[int]) -> np.ndarray:
    array = np.asarray(values, dtype=float)
    cap = max(float(np.quantile(array, 0.99)), 1.0)
    return np.clip(np.log1p(array) / math.log1p(cap), 0.0, 1.0)


def robust_scale(values: np.ndarray, clip: float = 2.4) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    scale = max(mad * 1.4826, float(np.std(values)) * 0.22, 1e-7)
    return np.clip((values - median) / scale, -clip, clip) / clip


def stable_hash(value: str) -> int:
    result = 2166136261
    for character in value:
        result ^= ord(character)
        result = (result * 16777619) & 0xFFFFFFFF
    return result


def cluster_offsets(count: int, radius_x: float = 780.0, radius_y: float = 560.0) -> list[tuple[float, float]]:
    """Sunflower-like cluster centres that form a field instead of one ring."""
    if count <= 1:
        return [(0.0, 0.0)]
    output: list[tuple[float, float]] = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for index in range(count):
        fraction = math.sqrt((index + 0.65) / count)
        angle = index * golden + 0.33
        output.append((math.cos(angle) * radius_x * fraction, math.sin(angle) * radius_y * fraction))
    return output


payload = json.loads(SITE.read_text(encoding="utf-8"))
points = payload["semantic_points"]
ids = [thread_id(point.get("reddit_url", "")) for point in points]

frames = []
for source_file in source_paths():
    frame = pd.read_csv(
        source_file,
        usecols=lambda column: column
        in {"id", "title", "selftext", "document", "num_comments", "score", "date"},
        low_memory=False,
    )
    frames.append(frame)
source = pd.concat(frames, ignore_index=True).drop_duplicates("id", keep="first").set_index("id")

documents: list[str] = []
comments: list[int] = []
scores: list[int] = []
dates: list[str] = []
missing = 0
for point, pid in zip(points, ids):
    if pid in source.index:
        row = source.loc[pid]
        document = row.get("document")
        if not isinstance(document, str) or not document.strip():
            document = f"{row.get('title', '')} {row.get('selftext', '')}"
        documents.append(str(document))
        comments.append(int(row.get("num_comments", 0) if pd.notna(row.get("num_comments", 0)) else 0))
        scores.append(int(row.get("score", 0) if pd.notna(row.get("score", 0)) else 0))
        dates.append(str(row.get("date") or point.get("month", "")))
    else:
        missing += 1
        documents.append(str(point.get("title", "")))
        comments.append(0)
        scores.append(0)
        dates.append(str(point.get("month", "")))

# Keywords for labels, local islands, and semantic links.
token_documents = [tokens(document) for document in documents]
document_frequency = Counter()
for token_document in token_documents:
    document_frequency.update(set(token_document))
count_documents = len(token_documents)
keywords: list[list[str]] = []
for token_document in token_documents:
    counts = Counter(token_document)
    ranked = sorted(
        counts,
        key=lambda token: (
            counts[token] * (math.log((count_documents + 1) / (document_frequency[token] + 1)) + 1),
            counts[token],
            len(token),
        ),
        reverse=True,
    )
    keywords.append(ranked[:6])

# Build a bounded keyword-overlap graph. Each post receives a few local links and
# at most two cross-world links, enough to create visible bridges without hairballs.
inverted: dict[str, list[int]] = defaultdict(list)
for index, terms in enumerate(keywords):
    for term in terms[:5]:
        inverted[term].append(index)

edge_map: dict[tuple[int, int], dict] = {}
for index, terms in enumerate(keywords):
    candidates: Counter[int] = Counter()
    for term in terms[:5]:
        group = inverted[term]
        if len(group) > 300:
            step = max(1, len(group) // 100)
            group = group[stable_hash(ids[index] + term) % step :: step][:100]
        for other in group:
            if other != index:
                candidates[other] += 1

    same_count = 0
    cross_count = 0
    term_set = set(terms)
    for other, overlap in candidates.most_common(40):
        other_terms = set(keywords[other])
        union = len(term_set | other_terms)
        similarity = overlap / max(union, 1)
        same_macro = points[index]["macro"] == points[other]["macro"]
        if same_macro and same_count >= 3:
            continue
        if not same_macro and cross_count >= 2:
            continue
        threshold = 0.085 if same_macro else 0.115
        if similarity < threshold:
            continue
        a, b = sorted((index, other))
        if (a, b) in edge_map:
            continue
        shared = [term for term in terms if term in other_terms][:4]
        edge_map[(a, b)] = {
            "source": a,
            "target": b,
            "similarity": round(float(similarity), 4),
            "cross_macro": not same_macro,
            "shared": shared,
        }
        same_count += int(same_macro)
        cross_count += int(not same_macro)
        if same_count >= 3 and cross_count >= 2:
            break

edge_list = sorted(edge_map.values(), key=lambda edge: edge["similarity"], reverse=True)[:9000]
adjacency: list[list[dict]] = [[] for _ in points]
for edge in edge_list:
    adjacency[edge["source"]].append(edge)
    adjacency[edge["target"]].append(edge)

# Large, airy local fields. Keyword islands define local neighbourhoods; semantic
# coordinates add direction; cross-world links shift bridge posts toward neighbours.
macro_indices: dict[str, list[int]] = defaultdict(list)
for index, point in enumerate(points):
    macro_indices[point["macro"]].append(index)

raw_x = np.array([float(point.get("x", 0.0)) for point in points])
raw_y = np.array([float(point.get("y", 0.0)) for point in points])
global_x = robust_scale(raw_x)
global_y = robust_scale(raw_y)

anchors_x = np.zeros(len(points), dtype=float)
anchors_y = np.zeros(len(points), dtype=float)
cluster_labels = [0] * len(points)
cluster_keywords: dict[str, list[str]] = {}

for macro, indices in macro_indices.items():
    # More islands than v4.7, with centres spread through a large ellipse.
    cluster_count = max(7, min(12, round(math.sqrt(len(indices) / 8))))
    by_lead: dict[str, list[int]] = defaultdict(list)
    for index in indices:
        topic = points[index].get("topic_id", 0)
        lead = keywords[index][0] if keywords[index] else f"topic-{topic}"
        by_lead[f"{topic}:{lead}"].append(index)

    bins: list[list[int]] = [[] for _ in range(cluster_count)]
    loads = [0] * cluster_count
    for _, members in sorted(by_lead.items(), key=lambda pair: len(pair[1]), reverse=True):
        target = min(range(cluster_count), key=lambda candidate: loads[candidate])
        bins[target].extend(members)
        loads[target] += len(members)

    centre_x, centre_y = CENTERS.get(macro, (WORLD[0] / 2, WORLD[1] / 2))
    offsets = cluster_offsets(cluster_count)
    for label, members in enumerate(bins):
        if not members:
            continue
        offset_x, offset_y = offsets[label]
        island_x = centre_x + offset_x
        island_y = centre_y + offset_y
        terms = Counter(term for member in members for term in keywords[member][:4])
        cluster_id = f"{macro}:{label}"
        cluster_keywords[cluster_id] = [term for term, _ in terms.most_common(6)]

        # Deterministic wide sunflower: density grows slowly with group size.
        golden = math.pi * (3.0 - math.sqrt(5.0))
        local_radius = 42.0 * math.sqrt(max(1, len(members)))
        rotation = ((stable_hash(cluster_id) % 10000) / 10000) * math.pi * 2
        for order, index in enumerate(sorted(members, key=lambda item: stable_hash(ids[item]))):
            fraction = math.sqrt((order + 0.7) / len(members))
            angle = order * golden + rotation
            # Wide clouds with irregular edges, not circular balls.
            radial_x = local_radius * fraction * (0.92 + 0.18 * math.sin(angle * 2.3))
            radial_y = local_radius * 0.72 * fraction * (0.92 + 0.16 * math.cos(angle * 1.7))
            jitter_seed = stable_hash(ids[index] + cluster_id)
            jitter_x = (((jitter_seed >> 7) % 1000) / 1000 - 0.5) * 38
            jitter_y = (((jitter_seed >> 18) % 1000) / 1000 - 0.5) * 32
            semantic_dx = global_x[index] * 330
            semantic_dy = global_y[index] * 300
            cluster_labels[index] = label
            anchors_x[index] = island_x + math.cos(angle) * radial_x + semantic_dx + jitter_x
            anchors_y[index] = island_y + math.sin(angle) * radial_y + semantic_dy + jitter_y

# Bridge posts are displaced toward the thematic centres to which their vocabulary connects.
bridge_strengths = np.zeros(len(points), dtype=float)
affiliations: list[list[str]] = [[] for _ in points]
for index, point in enumerate(points):
    cross_edges = [edge for edge in adjacency[index] if edge["cross_macro"]]
    if not cross_edges:
        continue
    weighted_x = 0.0
    weighted_y = 0.0
    total = 0.0
    names: list[str] = []
    for edge in cross_edges:
        other_index = edge["target"] if edge["source"] == index else edge["source"]
        other_macro = points[other_index]["macro"]
        target_x, target_y = CENTERS.get(other_macro, (WORLD[0] / 2, WORLD[1] / 2))
        weight = 0.5 + edge["similarity"] * 2.0
        weighted_x += target_x * weight
        weighted_y += target_y * weight
        total += weight
        names.append(other_macro)
    if total <= 0:
        continue
    target_x = weighted_x / total
    target_y = weighted_y / total
    similarity_sum = sum(edge["similarity"] for edge in cross_edges)
    strength = min(0.42, 0.16 + similarity_sum * 0.42)
    anchors_x[index] += (target_x - anchors_x[index]) * strength
    anchors_y[index] += (target_y - anchors_y[index]) * strength
    bridge_strengths[index] = strength
    affiliations[index] = sorted(set(names))

# Keep all anchors in the navigable world while preserving edge irregularity.
anchors_x = np.clip(anchors_x, 150, WORLD[0] - 150)
anchors_y = np.clip(anchors_y, 150, WORLD[1] - 150)

comment_weight = robust_weight(comments)
score_weight = robust_weight([max(0, score) for score in scores])
degree = Counter()
for edge in edge_list:
    degree[edge["source"]] += 1
    degree[edge["target"]] += 1

for index, point in enumerate(points):
    cluster_id = f"{point['macro']}:{cluster_labels[index]}"
    point.update(
        map_x=round(float(anchors_x[index]), 3),
        map_y=round(float(anchors_y[index]), 3),
        anchor_x=round(float(anchors_x[index]), 3),
        anchor_y=round(float(anchors_y[index]), 3),
        semantic_cluster=cluster_id,
        cluster_keywords=cluster_keywords.get(cluster_id, []),
        keywords=keywords[index],
        num_comments=int(comments[index]),
        score=int(scores[index]),
        date=dates[index],
        engagement=round(float(comment_weight[index]), 4),
        score_weight=round(float(score_weight[index]), 4),
        degree=int(degree[index]),
        bridge_strength=round(float(bridge_strengths[index]), 4),
        affiliated_macros=affiliations[index],
    )

payload["semantic_edges"] = edge_list
payload["semantic_map_meta"] = {
    **payload.get("semantic_map_meta", {}),
    "world_width": WORLD[0],
    "world_height": WORLD[1],
    "physics_version": "4.8",
    "edge_count": len(edge_list),
    "engagement_metric": "num_comments",
    "missing_source_rows": missing,
    "layout": "airy_semantic_clouds_with_cross_macro_bridges",
}
SITE.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

report = {
    "points": len(points),
    "edges": len(edge_list),
    "cross_macro_edges": sum(edge["cross_macro"] for edge in edge_list),
    "clusters": len(set(point["semantic_cluster"] for point in points)),
    "bridge_posts": int(sum(value > 0 for value in bridge_strengths)),
    "max_comments": max(comments),
    "p99_comments": float(np.quantile(comments, 0.99)),
    "missing_source_rows": missing,
    "world": WORLD,
}
(ROOT / "MAP_V4_8_VALIDATION.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(json.dumps(report, ensure_ascii=False, indent=2))
