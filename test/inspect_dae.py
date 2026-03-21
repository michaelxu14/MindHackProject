import xml.etree.ElementTree as ET
tree = ET.parse('brain.dae')
root = tree.getroot()
ns = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}
geometries = root.findall('.//c:geometry', ns)
print(f"Found {len(geometries)} geometries")
for g in geometries[:10]:
    print(g.attrib.get('id'), g.attrib.get('name'))
nodes = root.findall('.//c:node', ns)
print(f"Found {len(nodes)} nodes")
