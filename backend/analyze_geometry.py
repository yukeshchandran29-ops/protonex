#!/usr/bin/env python3
import json, os, sys, math, tempfile, zipfile
from pathlib import Path

SUPPORTED = {'.step','.stp','.iges','.igs','.stl','.obj','.3mf'}

def clean(v):
    if v is None or not math.isfinite(float(v)): return None
    return round(float(v), 4)

def result(path, engine, units='mm'):
    return {'ok':True,'engine':engine,'units':units,'file':Path(path).name}

def analyze_cadquery(path):
    import cadquery as cq
    ext=Path(path).suffix.lower()
    if ext in {'.step','.stp'}:
        wp=cq.importers.importStep(path)
    else:
        wp=cq.importers.importStep(path)
    shapes=wp.vals()
    if not shapes: raise ValueError('No CAD solids found')
    volumes=[]; areas=[]; bbs=[]; faces=edges=solids=0
    for s in shapes:
        try: volumes.append(abs(s.Volume()))
        except: pass
        try: areas.append(abs(s.Area()))
        except: pass
        try:
            bb=s.BoundingBox(); bbs.append((bb.xmin,bb.ymin,bb.zmin,bb.xmax,bb.ymax,bb.zmax))
        except: pass
        try: solids += len(s.Solids())
        except: pass
        try: faces += len(s.Faces())
        except: pass
        try: edges += len(s.Edges())
        except: pass
    if not bbs: raise ValueError('Could not calculate bounding box')
    xmin=min(x[0] for x in bbs); ymin=min(x[1] for x in bbs); zmin=min(x[2] for x in bbs)
    xmax=max(x[3] for x in bbs); ymax=max(x[4] for x in bbs); zmax=max(x[5] for x in bbs)
    vol=sum(volumes); area=sum(areas)
    out=result(path,'CadQuery/OpenCascade')
    out.update({'parts':len(shapes),'solids':solids,'faces':faces,'edges':edges,'volumeMm3':clean(vol),'surfaceAreaMm2':clean(area),'bboxMm':[clean(xmax-xmin),clean(ymax-ymin),clean(zmax-zmin)],'bboxVolumeMm3':clean((xmax-xmin)*(ymax-ymin)*(zmax-zmin))})
    return out

def analyze_mesh(path):
    import trimesh
    mesh=trimesh.load(path, force='mesh', process=False)
    if hasattr(mesh,'geometry'):
        meshes=list(mesh.geometry.values())
        if not meshes: raise ValueError('No mesh geometry found')
        mesh=trimesh.util.concatenate(meshes)
    if mesh.is_empty: raise ValueError('Empty mesh')
    ext=Path(path).suffix.lower()
    vol=abs(float(mesh.volume))
    area=float(mesh.area)
    bounds=mesh.bounds
    dims=bounds[1]-bounds[0]
    out=result(path,'Trimesh')
    out.update({'parts':1,'solids':1 if mesh.is_watertight else 0,'faces':int(len(mesh.faces)),'edges':None,'volumeMm3':clean(vol),'surfaceAreaMm2':clean(area),'bboxMm':[clean(x) for x in dims],'bboxVolumeMm3':clean(float(dims[0]*dims[1]*dims[2])),'watertight':bool(mesh.is_watertight)})
    if not mesh.is_watertight:
        out['warning']='Mesh is not watertight; volume may be unreliable. Final price requires DFM review.'
    return out

def analyze_zip(path):
    with zipfile.ZipFile(path) as z:
        names=[n for n in z.namelist() if not n.endswith('/') and Path(n).suffix.lower() in SUPPORTED]
        if not names: raise ValueError('ZIP contains no supported CAD geometry')
        # Extract the largest supported CAD file, which is usually the primary model.
        name=max(names,key=lambda n:z.getinfo(n).file_size)
        with tempfile.TemporaryDirectory() as td:
            target=Path(td)/Path(name).name
            with z.open(name) as src, open(target,'wb') as dst: dst.write(src.read())
            data=analyze(str(target))
            data['file']=Path(path).name
            data['archiveMember']=name
            return data

def analyze(path):
    ext=Path(path).suffix.lower()
    if ext in {'.step','.stp','.iges','.igs'}:
        return analyze_cadquery(path)
    if ext in {'.stl','.obj','.3mf'}:
        return analyze_mesh(path)
    if ext=='.zip': return analyze_zip(path)
    raise ValueError(f'Geometry analysis not available for {ext or "unknown"} files')

def main():
    if len(sys.argv)!=2:
        print(json.dumps({'ok':False,'error':'Usage: analyze_geometry.py <file>'})); sys.exit(2)
    try:
        print(json.dumps(analyze(sys.argv[1]), separators=(',',':')))
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e)}))
        sys.exit(1)
if __name__=='__main__': main()
