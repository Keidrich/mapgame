"""Download one small OSM map extract for the development fixture, never per player.

Usage: python3 scripts/fetch-real-city.py /tmp/les-osm.json
Then: npx vite-node scripts/import-real-city.ts -- /tmp/les-osm.json
Python standard library only. Public data, no key or player location required.
"""
import datetime
import json
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET

if len(sys.argv) != 2:
    raise SystemExit("Provide an output JSON path.")
url = "https://api.openstreetmap.org/api/0.6/map?bbox=-73.995,40.713,-73.978,40.725"
request = urllib.request.Request(url, headers={
    "User-Agent": "RacketsMapPreview/0.1 (https://github.com/Keidrich/mapgame)",
    "Accept": "application/xml",
})
with urllib.request.urlopen(request, timeout=60) as response:
    root = ET.fromstring(response.read())
nodes = {int(n.attrib["id"]): {"lat": float(n.attrib["lat"]), "lon": float(n.attrib["lon"])} for n in root.findall("node")}
ways = {}
for way in root.findall("way"):
    osm_id = int(way.attrib["id"])
    ways[osm_id] = {"type": "way", "id": osm_id,
                   "tags": {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")},
                   "geometry": [nodes.get(int(n.attrib["ref"])) for n in way.findall("nd")]}
elements = list(ways.values())
for relation in root.findall("relation"):
    tags = {t.attrib["k"]: t.attrib["v"] for t in relation.findall("tag")}
    if not tags.get("building"):
        continue
    elements.append({"type": "relation", "id": int(relation.attrib["id"]), "tags": tags,
                     "members": [dict(m.attrib, ref=int(m.attrib["ref"]),
                                      geometry=ways.get(int(m.attrib["ref"]), {}).get("geometry"))
                                 for m in relation.findall("member")]})
payload = {"elements": elements, "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sourceUrl": url}
pathlib.Path(sys.argv[1]).write_text(json.dumps(payload), encoding="utf-8")
print(f"Saved {len(elements)} map elements to {sys.argv[1]}")
