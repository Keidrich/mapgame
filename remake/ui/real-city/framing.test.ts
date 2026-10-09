import { expect, it } from 'vitest';
import * as THREE from 'three';
import type { RealBuilding } from '@geo/realCity';
import { frameBuilding } from './framing';
import { selectionOutline } from './geometry';
import { visiblePlaces, type ProjectedPlace } from './MapPlaces';
const b: RealBuilding = { id: 'mott', address: '228 Mott Street', kind: 'yes', height: 23.1, heightSource: 'measured', minHeight: 0, center: { x: 0, y: 0 }, rings: [[{ x: -4, y: -10 }, { x: 4, y: -10 }, { x: 4, y: 10 }, { x: -4, y: 10 }]] };
it.each([[390,844],[320,568],[430,932]])('keeps the entire selected building clear of phone chrome at %i × %i', (width,height) => {
  const camera = new THREE.PerspectiveCamera(42,width/height,1,6000), target = new THREE.Vector3();
  camera.position.set(350,560,680);
  const insets = { top: 125, bottom: height * .44 + 40, left: 12, right: 72 };
  frameBuilding(camera,target,b,width,height,insets);
  for (const point of b.rings[0]) for (const y of [0,b.height]) {
    const p = new THREE.Vector3(point.x,y,point.y).project(camera), x = (p.x+1)*width/2, screenY = (1-p.y)*height/2;
    expect(x).toBeGreaterThan(insets.left); expect(x).toBeLessThan(width-insets.right);
    expect(screenY).toBeGreaterThan(insets.top+28); expect(screenY).toBeLessThan(height-insets.bottom);
  }
});
it('outlines four roof edges and four corners without face diagonals', () => {
  const geometry = selectionOutline(b), p = geometry.getAttribute('position');
  expect(p.count).toBe(16);
  for (let i=0;i<p.count;i+=2) expect(Number(p.getX(i)!==p.getX(i+1))+Number(p.getY(i)!==p.getY(i+1))+Number(p.getZ(i)!==p.getZ(i+1))).toBe(1);
  geometry.dispose();
});
it('gives selected markers priority and keeps other touch targets clear of chrome and each other', () => {
  const place = (id:string,x:number,y:number):ProjectedPlace => ({ id,buildingId:id,name:id,type:'bar',pos:{x:0,y:0},here:false,yours:false,travel:1,x,y,visible:true });
  const out = visiblePlaces([place('other',150,220),place('selected',154,222),place('header',100,50),place('sheet',150,750),place('clear',240,340)],'selected',390,844,{top:120,bottom:350,left:12,right:60});
  expect(out.map(p=>p.id)).toEqual(['selected','clear']);
});
