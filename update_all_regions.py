import json
import os
from pathlib import Path

models_dir = 'public/models'
p = Path('public/models/regions.json')
js = json.loads(p.read_text())

# Get existing region ids from files
existing_ids = set()
for f in os.listdir(models_dir):
    if f.startswith('region_') and f.endswith('.obj'):
        try:
            id_ = int(f.replace('region_', '').replace('.obj', ''))
            existing_ids.add(id_)
        except:
            pass

print('Existing region ids:', sorted(existing_ids))

# Keep existing entries
entries = {r['id']: r for r in js.get('regions', [])}

# Add new ones
new_regions = []
max_id = max(existing_ids) if existing_ids else 75
for i in range(max_id + 1):
    if i in entries:
        new_regions.append(entries[i])
    elif i in existing_ids:
        new_regions.append({
            'id': i,
            'name': f'Region {i}',
            'color': '#cccccc',
            'file': f'region_{i}.obj',
            'vertices': 0,
            'faces': 0,
        })
    else:
        # Skip if no file
        pass

js['regions'] = new_regions
js['total_regions'] = len(new_regions)
p.write_text(json.dumps(js, indent=2) + '\n')
print('Updated regions.json with', len(new_regions), 'regions')