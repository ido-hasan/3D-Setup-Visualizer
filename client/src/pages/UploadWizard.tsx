import { Html } from '@react-three/drei';
import { ArrowLeft, ArrowRight, FlipVertical2, Layers, RotateCw, UploadCloud } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { builtinParts, PART_CATEGORIES, REFERENCE_PART_ID, type BBox, type Part } from '@viz/shared';
import { api } from '../api';
import { applyFix, exportGlb, layFlatRotation, type ModelFix } from '../lib/modelExport';
import { loadModelFiles, MODEL_EXTENSIONS, type LoadedModel } from '../lib/modelLoad';
import { dataUrlToBlob, renderThumbnail } from '../lib/thumbnail';
import { fmt } from '../lib/util';
import { PartModel } from '../three/PartModel';
import { setView, Stage, whenStageReady, type StageBridge } from '../three/Stage';
import { NumberInput } from '../ui';
import { Brand } from './Home';

const UNITS = [
  { id: 'mm', label: 'Millimetres', scale: 1 },
  { id: 'cm', label: 'Centimetres', scale: 10 },
  { id: 'm', label: 'Metres', scale: 1000 },
  { id: 'in', label: 'Inches', scale: 25.4 },
] as const;
type UnitId = (typeof UNITS)[number]['id'];

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function Ruler({ y }: { y: number }) {
  const geometry = useMemo(() => {
    const pts: number[] = [-50, 0, 0, 50, 0, 0];
    for (let i = 0; i <= 10; i++) {
      const x = -50 + i * 10;
      pts.push(x, 0, 0, x, i % 5 === 0 ? -5 : -3, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group position={[0, y, 0.2]}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#1b2330" />
      </lineSegments>
      {[0, 50, 100].map((mm) => (
        <Html key={mm} position={[-50 + mm, -10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="scene-label">{mm} mm</div>
        </Html>
      ))}
    </group>
  );
}

interface FixSceneProps {
  model: LoadedModel;
  fix: ModelFix;
  holderRef: React.MutableRefObject<THREE.Group | null>;
  onBBox: (bbox: BBox) => void;
}

function FixScene({ model, fix, holderRef, onBBox }: FixSceneProps) {
  const [bbox, setBBox] = useState<BBox>({ min: [-10, -10, 0], max: [10, 10, 10] });
  const reference = useMemo(() => builtinParts().find((p) => p.id === REFERENCE_PART_ID)!, []);

  useLayoutEffect(() => {
    if (!holderRef.current) return;
    const next = applyFix(holderRef.current, model.object, model.upAxis, fix);
    setBBox(next);
    onBBox(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, fix]);

  const refX = bbox.min[0] - 14 - reference.bbox.max[0];
  return (
    <>
      <group ref={holderRef}>
        <primitive object={model.object} />
      </group>
      <group position={[refX, 0, 0]}>
        <PartModel part={reference} />
        <Html position={[0, reference.bbox.min[1] - 8, 0]} style={{ pointerEvents: 'none' }}>
          <div className="scene-label">Arduino Uno, for scale</div>
        </Html>
      </group>
      <Ruler y={Math.min(bbox.min[1], reference.bbox.min[1]) - 22} />
    </>
  );
}

export function UploadWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const replaceId = params.get('replace');
  const [replacing, setReplacing] = useState<Part | null>(null);

  const [model, setModel] = useState<LoadedModel | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [unit, setUnit] = useState<UnitId>('mm');
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(() => new THREE.Quaternion());
  const [color, setColor] = useState('#8c97a6');
  const [bbox, setBBox] = useState<BBox>({ min: [0, 0, 0], max: [0, 0, 0] });

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Custom hardware');
  const [logicVoltage, setLogicVoltage] = useState<3.3 | 5>(3.3);
  const [plugs, setPlugs] = useState(false);

  const holderRef = useRef<THREE.Group | null>(null);
  const bridge: StageBridge = useRef(null);

  useEffect(() => {
    document.title = 'Upload a 3D model · 3D Setup Visualizer';
    if (!replaceId) return;
    api
      .listParts()
      .then((parts) => setReplacing(parts.find((p) => p.id === replaceId) ?? null))
      .catch(() => setReplacing(null));
  }, [replaceId]);

  const fix: ModelFix = useMemo(
    () => ({ unitScale: UNITS.find((u) => u.id === unit)!.scale, scale, rotation, color }),
    [unit, scale, rotation, color],
  );

  const readFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError('');
    setBusy('reading');
    try {
      const loaded = await loadModelFiles(files);
      // Guess the unit: glTF is in metres, and a "board" under 2 units long is not in millimetres.
      const size = new THREE.Box3().setFromObject(loaded.object).getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      setUnit(loaded.unit === 'm' || longest < 2 ? 'm' : 'mm');
      setScale(1);
      setRotation(new THREE.Quaternion());
      setName(loaded.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      setModel(loaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  // Frame the model when a file is opened and when its size changes, not on every turn.
  const needsFrame = useRef(true);
  useEffect(() => {
    needsFrame.current = true;
  }, [model, unit, scale]);
  useEffect(() => {
    if (!model || !needsFrame.current || bbox.max[2] === 0) return;
    return whenStageReady(bridge, (state) => {
      needsFrame.current = false;
      // Leave room on the left for the Arduino Uno shown for scale.
      setView(state, 'iso', { min: [bbox.min[0] - 85, Math.min(bbox.min[1], -27), 0], max: [bbox.max[0], Math.max(bbox.max[1], 27), bbox.max[2]] });
    });
  }, [model, bbox]);

  const rotate = (axis: keyof typeof AXES, deg = 90) =>
    setRotation((q) => new THREE.Quaternion().setFromAxisAngle(AXES[axis], (deg * Math.PI) / 180).multiply(q));

  const size = [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]];
  const longest = Math.max(...size);
  const sizeHint =
    longest > 0 && longest < 3
      ? 'This is tiny for a board. The file is probably in another unit: try metres or inches.'
      : longest > 1000
        ? 'This is over a metre long. The file may be in another unit: check against the Arduino Uno beside it.'
        : '';

  const save = async () => {
    const holder = holderRef.current;
    if (!holder || !model) return;
    setBusy('saving');
    setError('');
    try {
      const glb = await exportGlb(holder);
      const thumbUrl = renderThumbnail(holder.clone(true), bbox);
      const [file, thumb] = await Promise.all([api.uploadFile(glb, 'glb'), dataUrlToBlob(thumbUrl).then((b) => api.uploadFile(b, 'png'))]);
      let part: Part;
      if (replacing) {
        part = await api.updatePart({ ...replacing, model: { kind: 'glb', file }, thumb, bbox });
      } else {
        part = await api.createPart({
          name: name.trim() || 'Untitled part',
          category,
          model: { kind: 'glb', file },
          thumb,
          logicVoltage,
          plugsIntoBreadboard: plugs,
          plugDepth: plugs ? 6 : 0,
          bbox,
          pins: [],
          strips: [],
          note: `Uploaded from ${model.fileName}`,
        });
      }
      navigate(`/parts/${encodeURIComponent(part.id)}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void readFiles([...e.dataTransfer.files]);
  };

  const header = (
    <header className="topbar">
      <Link className="btn ghost icon" to={replacing ? `/parts/${encodeURIComponent(replacing.id)}` : '/'} title="Back" aria-label="Back">
        <ArrowLeft />
      </Link>
      <Brand />
      <div className="sep" />
      <strong>{replacing ? `Replace the model of ${replacing.name}` : 'Upload a 3D model'}</strong>
      <div className="spacer" />
      <div className="steps" aria-label="Steps">
        <span className={`step${!model ? ' on' : ''}`}>
          <b>1</b> Choose file
        </span>
        <span className="line" />
        <span className={`step${model ? ' on' : ''}`}>
          <b>2</b> Check size and position
        </span>
        <span className="line" />
        <span className="step">
          <b>3</b> Mark the pins
        </span>
      </div>
    </header>
  );

  if (!model) {
    return (
      <div className="page">
        {header}
        <div className="center-msg solid" style={{ flex: 1, position: 'relative' }}>
          <div
            className={`dropzone${over ? ' over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {busy === 'reading' ? (
              <>
                <div className="spinner" />
                <h2>Reading the model…</h2>
                <p className="hint">STEP files are converted here in the browser. A large one can take a minute.</p>
              </>
            ) : (
              <>
                <UploadCloud />
                <h2>Drop a 3D model here</h2>
                <p className="hint">or click to choose a file</p>
                <div className="formats">
                  {['STEP / STP', 'STL', 'OBJ', 'GLB / glTF'].map((f) => (
                    <span key={f} className="badge">
                      {f}
                    </span>
                  ))}
                </div>
                <p className="hint">For an OBJ with colours, drop its .mtl file together with it.</p>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept={[...MODEL_EXTENSIONS, '.mtl'].join(',')}
              onChange={(e) => void readFiles([...(e.target.files ?? [])])}
            />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {header}
      <div className="workspace">
        <div className="viewport">
          <Stage bridge={bridge} cameraPosition={[120, -220, 170]}>
            <FixScene model={model} fix={fix} holderRef={holderRef} onBBox={setBBox} />
          </Stage>
          <div className="overlay bottom-center">
            <div className="status-pill">The model should lie flat on the bench and look the right size next to the Arduino Uno.</div>
          </div>
        </div>
        <aside className="side right wide">
          <div className="side-section">
            <h3>Size</h3>
            <dl className="kv">
              <dt>File</dt>
              <dd>
                {model.fileName} ({model.triangles.toLocaleString()} triangles)
              </dd>
              <dt>Size now</dt>
              <dd>
                <strong>
                  {fmt(size[0], 1)} × {fmt(size[1], 1)} × {fmt(size[2], 1)} mm
                </strong>
              </dd>
            </dl>
            {sizeHint && <p className="error-text">{sizeHint}</p>}
            <div className="field-row">
              <div className="field">
                <label htmlFor="unit">The file is in</label>
                <select id="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value as UnitId)}>
                  {UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="scale">Extra scale (×)</label>
                <NumberInput id="scale" value={scale} step={0.1} min={0.001} max={1000} digits={4} onCommit={setScale} />
              </div>
            </div>
          </div>
          <div className="side-section">
            <h3>Position</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setRotation(layFlatRotation(model.object, model.upAxis))}>
                <Layers /> Lay flat
              </button>
              <button className="btn" onClick={() => rotate('x', 180)}>
                <FlipVertical2 /> Flip over
              </button>
              <button className="btn" onClick={() => setRotation(new THREE.Quaternion())}>
                Reset
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => rotate('z')} title="Turn on the bench">
                <RotateCw /> Turn 90°
              </button>
              <button className="btn" onClick={() => rotate('x')} title="Tip towards you">
                <RotateCw /> Tip forward
              </button>
              <button className="btn" onClick={() => rotate('y')} title="Tip to the side">
                <RotateCw /> Tip sideways
              </button>
            </div>
            {!model.hasColor && (
              <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <label htmlFor="color">This file has no colours. Colour to use:</label>
                <input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            )}
          </div>
          {!replacing && (
            <div className="side-section">
              <h3>About this part</h3>
              <div className="field">
                <label htmlFor="part-name">Name</label>
                <input id="part-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {PART_CATEGORIES.filter((c) => c !== 'Breadboard').map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="logic">Logic voltage</label>
                  <select id="logic" className="input" value={logicVoltage} onChange={(e) => setLogicVoltage(Number(e.target.value) as 3.3 | 5)}>
                    <option value={3.3}>3.3 V</option>
                    <option value={5}>5 V</option>
                  </select>
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={plugs} onChange={(e) => setPlugs(e.target.checked)} />
                It plugs into a breadboard (pins point down)
              </label>
            </div>
          )}
          <div className="side-section">
            {replacing && <p className="hint">The pins of {replacing.name} are kept. Check afterwards that they still sit in the right places.</p>}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" onClick={() => void save()} disabled={busy !== '' || longest === 0}>
              {busy === 'saving' ? 'Saving…' : replacing ? 'Save new model' : 'Save and mark the pins'} <ArrowRight />
            </button>
            <button className="btn" onClick={() => setModel(null)} disabled={busy !== ''}>
              Choose another file
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
