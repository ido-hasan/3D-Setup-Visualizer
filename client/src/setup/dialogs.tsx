import { Check, Copy, Download, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { billOfMaterials, bomCsv, wiringCsv, wiringList } from '@viz/shared';
import { api } from '../api';
import { copyText, downloadText, safeFileName } from '../lib/util';
import { Modal } from '../ui';
import { select, useAnalysis, useEditor } from './store';

function TableActions({ onCsv }: { onCsv: () => void }) {
  return (
    <>
      <button className="btn" onClick={onCsv}>
        <Download /> Download CSV
      </button>
      <button className="btn" onClick={() => window.print()}>
        <Printer /> Print
      </button>
    </>
  );
}

export function WiringDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc);
  const parts = useEditor((s) => s.parts);
  const analysis = useAnalysis();
  const rows = wiringList(doc, parts, analysis.index);
  return (
    <Modal
      title="Wiring list"
      wide
      onClose={onClose}
      footer={<TableActions onCsv={() => downloadText(wiringCsv(rows), `${safeFileName(doc.name)}-wiring.csv`, 'text/csv')} />}
    >
      <div className="printable">
        <h2 style={{ marginBottom: 8 }}>{doc.name}: wiring list</h2>
        {rows.length === 0 ? (
          <p className="hint">There are no cables yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>From</th>
                <th>Pin</th>
                <th>To</th>
                <th>Pin</th>
                <th>Colour</th>
                <th>Label</th>
                <th>Type</th>
                <th className="num">Length</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.cableId}
                  className="clickable"
                  onClick={() => {
                    select({ kind: 'cable', id: r.cableId });
                    onClose();
                  }}
                >
                  <td className="num">{r.n}</td>
                  <td>{r.fromBoard}</td>
                  <td>
                    <strong>{r.fromPin}</strong>
                  </td>
                  <td>{r.toBoard}</td>
                  <td>
                    <strong>{r.toPin}</strong>
                  </td>
                  <td>
                    <span className="dot" style={{ background: r.color, marginRight: 6 }} />
                    {r.color}
                  </td>
                  <td>{r.label}</td>
                  <td>{r.type}</td>
                  <td className="num">{r.lengthMm === null ? '' : `${Math.round(r.lengthMm / 10)} cm`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

export function BomDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc);
  const parts = useEditor((s) => s.parts);
  const analysis = useAnalysis();
  const lines = billOfMaterials(doc, parts, analysis.index);
  return (
    <Modal
      title="Bill of materials"
      wide
      onClose={onClose}
      footer={<TableActions onCsv={() => downloadText(bomCsv(lines), `${safeFileName(doc.name)}-bom.csv`, 'text/csv')} />}
    >
      <div className="printable">
        <h2 style={{ marginBottom: 8 }}>{doc.name}: bill of materials</h2>
        {lines.length === 0 ? (
          <p className="hint">The bench is empty.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Item</th>
                <th className="num">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.kind}:${l.item}`}>
                  <td>{l.kind === 'board' ? 'Board' : 'Cable'}</td>
                  <td>{l.item}</td>
                  <td className="num">{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          Jumper lengths are the shortest standard length that reaches along the drawn route.
        </p>
      </div>
    </Modal>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const token = useEditor((s) => s.setup?.shareToken);
  const [bases, setBases] = useState<string[]>([]);
  const [copied, setCopied] = useState('');
  const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname);

  useEffect(() => {
    // When the app is open on this computer, friends need the network address instead of "localhost".
    if (!local) {
      setBases([window.location.origin]);
      return;
    }
    api
      .info()
      .then((info) => setBases(info.lanUrls.length ? info.lanUrls : [window.location.origin]))
      .catch(() => setBases([window.location.origin]));
  }, [local]);

  return (
    <Modal title="Share a view-only link" onClose={onClose}>
      <p>Anyone on your network who opens this link sees the setup as it was last saved. They cannot change it.</p>
      {bases.map((base) => {
        const url = `${base}/s/${token}`;
        return (
          <div key={base} style={{ display: 'flex', gap: 8 }}>
            <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Share link" />
            <button
              className="btn"
              onClick={async () => {
                if (await copyText(url)) {
                  setCopied(url);
                  setTimeout(() => setCopied(''), 1500);
                }
              }}
            >
              {copied === url ? <Check /> : <Copy />} {copied === url ? 'Copied' : 'Copy'}
            </button>
          </div>
        );
      })}
      {local && bases.every((b) => b === window.location.origin) && (
        <p className="hint">No network address was found, so this link only works on this computer.</p>
      )}
      <p className="hint">The link works while the app is running on the computer that hosts it.</p>
    </Modal>
  );
}
