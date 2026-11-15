import { describe, expect, it } from 'vitest';
import { analyse, type IssueRule } from '../src/index';
import { BB, FTDI, NANO, PI, PILL, UNO, cable, doc, inst, parts } from './helpers';

const rules = (d: ReturnType<typeof doc>): IssueRule[] => analyse(d, parts).issues.map((i) => i.rule).sort();

const boards = [inst('u', UNO), inst('p', PI, 150), inst('bb', BB, 0, 100)];
const commonGround = () => cable('u', UNO, 'GND', 'p', PI, 'GND (pin 6)');

describe('validation', () => {
  it('passes a clean setup', () => {
    // Pi TX (3.3 V) into the Uno RX is fine; the grounds are shared.
    const d = doc(boards, [commonGround(), cable('p', PI, 'GPIO14 TXD (pin 8)', 'u', UNO, 'D0/RX')]);
    expect(rules(d)).toEqual(['voltage-mismatch']); // D0 is a 5 V logic pin, so the app still warns
    const safe = doc(boards, [commonGround(), cable('u', UNO, '3V3', 'p', PI, '3V3 (pin 1)')]);
    expect(rules(safe)).toEqual([]);
  });

  it('flags 5 V wired straight to ground', () => {
    const d = doc(boards, [cable('u', UNO, '5V', 'u', UNO, 'GND')]);
    const issues = analyse(d, parts).issues;
    expect(issues.map((i) => i.rule)).toEqual(['power-short']);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].cableIds).toHaveLength(1);
  });

  it('flags a short made through a breadboard column', () => {
    const d = doc(boards, [cable('u', UNO, '5V', 'bb', BB, 'a3'), cable('u', UNO, 'GND', 'bb', BB, 'c3')]);
    expect(rules(d)).toEqual(['power-short']);
    const apart = doc(boards, [cable('u', UNO, '5V', 'bb', BB, 'a3'), cable('u', UNO, 'GND', 'bb', BB, 'f3')]);
    expect(rules(apart)).toEqual([]);
  });

  it('flags 5 V tied to 3.3 V', () => {
    const d = doc(boards, [commonGround(), cable('u', UNO, '5V', 'p', PI, '3V3 (pin 1)')]);
    expect(rules(d)).toEqual(['supply-conflict']);
  });

  it('flags a 5 V supply or a 5 V logic pin reaching a 3.3 V-only pin', () => {
    const supply = doc(boards, [commonGround(), cable('u', UNO, '5V', 'p', PI, 'GPIO17 (pin 11)')]);
    expect(rules(supply)).toEqual(['voltage-mismatch']);
    const logic = doc(boards, [commonGround(), cable('u', UNO, 'D1/TX', 'p', PI, 'GPIO15 RXD (pin 10)')]);
    const issue = analyse(logic, parts).issues[0];
    expect(issue.rule).toBe('voltage-mismatch');
    expect(issue.severity).toBe('warning');
    expect(issue.message).toContain('GPIO15 RXD');
  });

  it('respects 5 V tolerant pins', () => {
    const b = [inst('u', UNO), inst('s', PILL, 150)];
    const ground = cable('u', UNO, 'GND', 's', PILL, 'GND');
    expect(rules(doc(b, [ground, cable('u', UNO, 'D1/TX', 's', PILL, 'PA10/RX1')]))).toEqual([]);
    expect(rules(doc(b, [ground, cable('u', UNO, 'D2', 's', PILL, 'PA0')]))).toEqual(['voltage-mismatch']);
  });

  it('flags boards wired together without a common ground', () => {
    const d = doc(boards, [cable('u', UNO, '3V3', 'p', PI, '3V3 (pin 1)')]);
    expect(rules(d)).toEqual(['no-ground', 'no-ground']);
    expect(rules(doc(boards, [commonGround()]))).toEqual([]);
  });

  it('flags a board with no USB port and no power connection', () => {
    const sensor = {
      ...parts[FTDI],
      id: 'sensor',
      name: 'Sensor',
      pins: [],
      strips: parts[FTDI].strips,
    };
    const all = { ...parts, sensor };
    const s = inst('s', 'sensor', 100);
    const pin = (name: string) => `SERIAL.${['DTR', 'RX', 'TX', 'VCC (5V)', 'CTS', 'GND'].indexOf(name)}`;
    const wire = (from: string, to: string) => ({ ...cable('u', UNO, from, 'u', UNO, 'D2'), to: { instanceId: 's', pinId: pin(to) } });
    const noPower = { name: 't', instances: [inst('u', UNO), s], cables: [wire('GND', 'GND'), wire('D3', 'RX')] };
    expect(analyse(noPower, all).issues.map((i) => i.rule)).toEqual(['no-power']);
    const powered = { ...noPower, cables: [...noPower.cables, wire('5V', 'VCC (5V)')] };
    expect(analyse(powered, all).issues).toEqual([]);
  });

  it('says nothing about a board that is not wired to anything', () => {
    expect(rules(doc([inst('u', UNO), inst('n', NANO, 100)]))).toEqual([]);
  });
});
