import * as THREE from 'three'

// Procedural anisotropic-noise normal map. v1 is a DataTexture with random
// per-pixel perturbations biased horizontally — reads as brushed-concrete at
// orbit distance without shipping any image asset. End-of-week-1 steer
// checkpoint: if this reads as "low-quality 3D" rather than "intentional
// sci-fi", swap to a CC0 stylized texture pack (Poly Haven or similar).
export function createConcreteNormalTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const nx = (Math.random() - 0.5) * 0.32
    const ny = (Math.random() - 0.5) * 0.14
    const nz = 1
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    data[i * 4 + 0] = Math.round(((nx / len + 1) / 2) * 255)
    data[i * 4 + 1] = Math.round(((ny / len + 1) / 2) * 255)
    data[i * 4 + 2] = Math.round(((nz / len + 1) / 2) * 255)
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

export type ConcreteOpts = {
  color?: string
  repeat?: [number, number]
  roughness?: number
  metalness?: number
  normalScale?: number
}

export function createConcreteMaterial(opts: ConcreteOpts = {}): THREE.MeshStandardMaterial {
  const normalMap = createConcreteNormalTexture(256)
  if (opts.repeat) normalMap.repeat.set(opts.repeat[0], opts.repeat[1])
  return new THREE.MeshStandardMaterial({
    color: opts.color ?? '#9a9b9d',
    roughness: opts.roughness ?? 0.92,
    metalness: opts.metalness ?? 0.02,
    normalMap,
    normalScale: new THREE.Vector2(opts.normalScale ?? 0.4, opts.normalScale ?? 0.4),
  })
}
