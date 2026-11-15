import { builtinParts, type Cable, type Instance, type Part, type PartsById, type SetupDoc } from '../src/index';

export const parts: PartsById = Object.fromEntries(builtinParts().map((p) => [p.id, p]));

export const UNO = 'builtin:arduino-uno';
export const NANO = 'builtin:arduino-nano';
export const PI = 'builtin:raspberry-pi-4b';
export const PILL = 'builtin:stm32-blue-pill';
export const FTDI = 'builtin:ftdi-ft232rl';
export const CH340 = 'builtin:ch340g';
export const BB = 'builtin:breadboard-half';

export function inst(id: string, partId: string, x = 0, y = 0, rotZ = 0, z = 0): Instance {
  return { id, partId, name: id, x, y, z, rotZ };
}

/** Find a pin by its printed name. */
export function pinId(part: Part, name: string, nth = 0): string {
  const all = [...part.pins, ...part.strips.flatMap((s) => Object.entries(s.overrides).map(([i, o]) => ({ id: `${s.id}.${i}`, name: o.name })))];
  const found = all.filter((p) => p.name === name);
  if (!found[nth]) throw new Error(`No pin "${name}" on ${part.name}`);
  return found[nth].id;
}

let n = 0;
export function cable(fromInst: string, fromPart: string, fromPin: string, toInst: string, toPart: string, toPin: string): Cable {
  return {
    id: `c${++n}`,
    from: { instanceId: fromInst, pinId: fromPin.includes('.') || fromPart === BB ? fromPin : pinId(parts[fromPart], fromPin) },
    to: { instanceId: toInst, pinId: toPin.includes('.') || toPart === BB ? toPin : pinId(parts[toPart], toPin) },
    color: '#000000',
    autoColor: true,
    label: '',
    controlPoints: [],
  };
}

export function doc(instances: Instance[], cables: Cable[] = []): SetupDoc {
  return { name: 'test', instances, cables };
}
