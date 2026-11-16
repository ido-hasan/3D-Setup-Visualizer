import { makeBreadboard } from '../breadboard';
import type { Part } from '../types';
import { builtinBoards } from './boards';
import { builtinRfParts } from './rf';

let cache: Part[] | undefined;

/** Parts that ship with the app. They need no server and no network. */
export function builtinParts(): Part[] {
  cache ??= [makeBreadboard('half'), makeBreadboard('full'), makeBreadboard('mini'), ...builtinBoards(), ...builtinRfParts()];
  return cache;
}

export const REFERENCE_PART_ID = 'builtin:arduino-uno';
