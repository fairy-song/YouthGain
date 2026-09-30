import React, { useRef, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Stars } from '@react-three/drei';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';

const FEATURES = [
  { path: '/admin/stats', title: '平台概览', desc: '数据总览', color: '#63B995', pos: [2.2, 1.2, 0.5] },
  { path: '/admin/users', title: '用户管理', desc: '账号钻取', color: '#5488C4', pos: [-2.3, 0.6, 0.8] },
  { path: '/admin/knowledge', title: '知识库', desc: '内容维护', color: '#E88A6E', pos: [0.5, -1.6, 2.2] },
  { path: '/admin/coach', title: 'AI 教练', desc: '人设配置', color: '#B57EDC', pos: [-0.8, 1.8, -1.8] },
];

function WireSphereOrb({ exploding, explodeStart }) {
  const group = useRef();
  const pointsRef = useRef();

  const { verts, dirs } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2, 4);
    const pos = geo.attributes.position;
    const seen = new Map();
    const v = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        v.push(x, y, z);
      }
    }
    const verts = new Float32Array(v);
    const n = verts.length / 3;
    const dirs = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const len = Math.sqrt(verts[i*3]**2 + verts[i*3+1]**2 + verts[i*3+2]**2) || 1;
      dirs[i*3] = verts[i*3]/len;
      dirs[i*3+1] = verts[i*3+1]/len;
      dirs[i*3+2] = verts[i*3+2]/len;
    }
    return { verts, dirs, count: n };
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const t0 = exploding ? state.clock.elapsedTime - explodeStart : 0;
    const spread = 1 + t0 * 4;
    const fade = exploding ? Math.max(0, 1 - t0 * 1.2) : 1;

    group.current.rotation.y += delta * (exploding ? 0.5 : 0.15);

    if (pointsRef.current) {
      const pos = pointsRef.current.geometry.attributes.position;
      for (let i = 0; i < verts.length / 3; i++) {
        pos.array[i*3] = dirs[i*3] * 2 * spread;
        pos.array[i*3+1] = dirs[i*3+1] * 2 * spread;
        pos.array[i*3+2] = dirs[i*3+2] * 2 * spread;
      }
      pos.needsUpdate = true;
      pointsRef.current.material.opacity = fade;
    }
    group.current.traverse((c) => {
      if (c.material && c !== pointsRef.current?.material) {
        c.material.opacity = (c.type === 'PointsMaterial' ? 0.7 : 0.4) * fade;
      }
    });
  });

  return (
    <group ref={group}>
      {/* 线框 */}
      <mesh>
        <icosahedronGeometry args={[2, 4]} />
        <meshBasicMaterial color="#63B995" wireframe transparent opacity={0.18} />
      </mesh>
      {/* 顶点粒子 */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={verts.length/3} array={verts.slice()} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.065} color="#63B995" transparent opacity={0.9} sizeAttenuation />
      </points>
    </group>
  );
}

function FeatureNode({ feature, onEnter, disabled }) {
  const [hover, setHover] = useState(false);
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.scale.set(hover ? 1.4 : 1, hover ? 1.4 : 1, hover ? 1.4 : 1);
      ref.current.position.y = feature.pos[1] + Math.sin(state.clock.elapsedTime * 1.5 + feature.pos[0]) * 0.08;
    }
  });
  return (
    <mesh ref={ref} position={feature.pos}
      onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onEnter(feature.path); }}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshBasicMaterial color={feature.color} />
      <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div style={{
          transform: 'translate(-50%, -150%)',
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
          borderRadius: 12, padding: '5px 10px', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(31,74,56,0.15)',
          cursor: disabled ? 'default' : 'pointer',
          border: `1.5px solid ${feature.color}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#1F4A38' }}>{feature.title}</div>
          <div style={{ fontSize: 9, color: '#888' }}>{feature.desc}</div>
        </div>
      </Html>
    </mesh>
  );
}

export default function AdminOrb() {
  const navigate = useNavigate();
  const [exploding, setExploding] = useState(false);
  const [explodeStart, setExplodeStart] = useState(0);

  const enter = (path) => {
    if (exploding) return;
    setExploding(true);
    setExplodeStart(performance.now() / 1000);
    setTimeout(() => navigate(path), 900);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 50% 40%, #f0f7f3 0%, #d4ebe0 100%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <Stars radius={100} depth={40} count={800} factor={2} fade speed={0.5} color="#95d5b2" />
        <Suspense fallback={null}>
          <WireSphereOrb exploding={exploding} explodeStart={explodeStart} />
          {FEATURES.map((f) => <FeatureNode key={f.path} feature={f} onEnter={enter} disabled={exploding} />)}
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={!exploding} autoRotateSpeed={0.6} />
      </Canvas>
      </div>
      <div style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', color: '#1F4A38', pointerEvents: 'none' }}>
        <div style={{ fontSize: 13, letterSpacing: 4, opacity: 0.7 }}>YOUTHGAIN · ADMIN CORE</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>青盈管理中枢</div>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>拖拽旋转球体 · 点击光点进入功能</div>
      </div>
    </div>
  );
}