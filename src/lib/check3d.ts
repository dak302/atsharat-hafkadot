/**
 * וי תלת-ממדי למסך ההצלחה: מטבע ירוק שמסתובב פנימה, ועליו וי לבן שקופץ.
 * נטען רק כשצריך (import דינמי), כדי שהאפליקציה עצמה תישאר קלה.
 */
import {
  AmbientLight,
  CatmullRomCurve3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'

const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** מצייר את המטבע על הקנבס ומחזיר פונקציה שמשחררת את המשאבים */
export function mountCheck3D(canvas: HTMLCanvasElement, size: number): () => void {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.setSize(size, size, false)
  renderer.outputColorSpace = SRGBColorSpace

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 0.1, 50)
  camera.position.set(0, 0, 4.6)

  scene.add(new AmbientLight(0xffffff, 1.1))
  const key = new DirectionalLight(0xffffff, 2.2)
  key.position.set(-2, 3, 4)
  scene.add(key)
  const rim = new DirectionalLight(0xd9ffe6, 1.2)
  rim.position.set(3, -1, -2)
  scene.add(rim)

  const green = new MeshStandardMaterial({ color: 0x15803d, roughness: 0.32, metalness: 0.25 })
  const greenEdge = new MeshStandardMaterial({ color: 0x0f6b32, roughness: 0.25, metalness: 0.4 })
  const white = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.12 })

  const coin = new Group()
  const body = new Mesh(new CylinderGeometry(1, 1, 0.26, 72), green)
  body.rotation.x = Math.PI / 2
  coin.add(body)
  const ring = new Mesh(new TorusGeometry(1, 0.13, 20, 72), greenEdge)
  coin.add(ring)

  // הווי: צינור לבן לאורך שלוש נקודות, עם כדורים בקצוות לפינות מעוגלות
  const pts = [new Vector3(-0.42, 0.02, 0.2), new Vector3(-0.12, -0.3, 0.2), new Vector3(0.46, 0.32, 0.2)]
  const check = new Group()
  const curve = new CatmullRomCurve3([pts[0], pts[1], pts[1].clone().add(new Vector3(0.001, 0.001, 0)), pts[2]], false, 'catmullrom', 0)
  check.add(new Mesh(new TubeGeometry(curve, 48, 0.1, 16, false), white))
  for (const p of pts) {
    const s = new Mesh(new SphereGeometry(0.1, 16, 12), white)
    s.position.copy(p)
    check.add(s)
  }
  check.scale.setScalar(0.001)
  coin.add(check)
  scene.add(coin)

  const start = performance.now()
  let raf = 0
  const frame = (now: number) => {
    const t = (now - start) / 1000
    const spin = clamp01(t / 0.7)
    coin.rotation.y = (1 - easeOutBack(spin)) * -2.8 + Math.sin(t * 2.2) * 0.08 * spin
    coin.rotation.x = Math.sin(t * 1.6) * 0.05 * spin
    coin.scale.setScalar(0.55 + 0.45 * easeOutBack(clamp01(t / 0.5)))
    check.scale.setScalar(Math.max(0.001, easeOutBack(clamp01((t - 0.35) / 0.35))))
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    scene.traverse((o) => {
      const m = o as Mesh
      m.geometry?.dispose()
    })
    green.dispose()
    greenEdge.dispose()
    white.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
