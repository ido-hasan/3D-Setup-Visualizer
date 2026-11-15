import type { Part } from '../types';
import { BoardBuilder, typeFromName, type PinDef } from './builder';

const IN = 25.4;
const SILVER = '#c9ccd1';
const CHIP = '#232326';

const pin = (name: string, type: NonNullable<Exclude<PinDef, string>['type']>, limit?: 3.3 | 5): PinDef => ({ name, type, limit });

/** Header layout shared by the Uno and the Mega. Coordinates come from the Arduino board drawings (inches). */
function arduinoShieldHeaders(b: BoardBuilder): void {
  b.header({
    name: 'DIGITAL-H',
    at: [0.74 * IN, 2.0 * IN],
    dir: '+x',
    style: 'socket',
    pins: ['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'],
  });
  b.header({
    name: 'DIGITAL-L',
    at: [1.8 * IN, 2.0 * IN],
    dir: '+x',
    style: 'socket',
    pins: ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', pin('D1/TX', 'UART_TX'), pin('D0/RX', 'UART_RX')],
  });
  b.header({
    name: 'POWER',
    at: [1.1 * IN, 0.1 * IN],
    dir: '+x',
    style: 'socket',
    pins: ['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN'],
  });
}

function arduinoPowerAndUsb(b: BoardBuilder): void {
  // USB-B socket and barrel jack overhang the left edge.
  b.box(1.6, 1.5 * IN, 16, 12, 10.9, SILVER);
  b.usb('USB', -6.4, 1.5 * IN, 5.5, '-x');
  b.box(4.9, 0.3 * IN, 13.6, 9, 11, CHIP);
  // Reset button.
  b.box(6.2, 50.3, 6, 6, 2, SILVER).cyl(6.2, 50.3, 3, 1, '#b3372b', { lift: 2 });
  // Regulator, crystal, USB bridge chip.
  b.box(14, 7.5, 6.5, 6, 2.3, CHIP).box(12.5, 30, 11, 4.6, 3.5, SILVER).box(18.5, 39, 7, 7, 1.2, CHIP, { rot: 45 });
}

function arduinoUno(): Part {
  const b = new BoardBuilder(2.7 * IN, 2.1 * IN, '#0b7f8a');
  arduinoShieldHeaders(b);
  b.header({
    name: 'ANALOG',
    at: [2.0 * IN, 0.1 * IN],
    dir: '+x',
    style: 'socket',
    pins: ['A0', 'A1', 'A2', 'A3', pin('A4/SDA', 'ANALOG'), pin('A5/SCL', 'ANALOG')],
  });
  b.header({
    name: 'ICSP',
    at: [63.64, 30.48],
    dir: '-y',
    rows: 2,
    style: 'up',
    pins: [pin('ICSP MISO', 'SPI_MISO'), pin('ICSP 5V', '5V'), pin('ICSP SCK', 'SPI_SCK'), pin('ICSP MOSI', 'SPI_MOSI'), pin('ICSP RESET', 'OTHER'), pin('ICSP GND', 'GND')],
  });
  arduinoPowerAndUsb(b);
  // ATmega328P in its DIP socket.
  b.box(46, 17.5, 37, 9.5, 3, '#3a3a3d').box(46, 17.5, 35.5, 7.2, 3.6, CHIP, { lift: 3 });
  b.hole(0.55 * IN, 0.1 * IN).hole(2.6 * IN, 0.3 * IN).hole(2.6 * IN, 1.4 * IN).hole(0.6 * IN, 2.0 * IN);
  return b.build({
    id: 'builtin:arduino-uno',
    name: 'Arduino Uno R3',
    category: 'Microcontroller',
    logicVoltage: 5,
    note: 'Simplified model drawn by the app. Header positions follow the Arduino board drawing.',
  });
}

function arduinoMega(): Part {
  const b = new BoardBuilder(4.0 * IN, 2.1 * IN, '#0b7f8a');
  arduinoShieldHeaders(b);
  b.header({
    name: 'ANALOG-L',
    at: [2.0 * IN, 0.1 * IN],
    dir: '+x',
    style: 'socket',
    pins: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
  });
  b.header({
    name: 'ANALOG-H',
    at: [2.9 * IN, 0.1 * IN],
    dir: '+x',
    style: 'socket',
    pins: ['A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15'],
  });
  b.header({
    name: 'COMM',
    at: [2.7 * IN, 2.0 * IN],
    dir: '+x',
    style: 'socket',
    pins: [
      pin('D14/TX3', 'UART_TX'),
      pin('D15/RX3', 'UART_RX'),
      pin('D16/TX2', 'UART_TX'),
      pin('D17/RX2', 'UART_RX'),
      pin('D18/TX1', 'UART_TX'),
      pin('D19/RX1', 'UART_RX'),
      pin('D20/SDA', 'I2C_SDA'),
      pin('D21/SCL', 'I2C_SCL'),
    ],
  });
  const dbl: PinDef[] = ['5V', '5V'];
  for (let d = 22; d <= 53; d++) {
    if (d === 50) dbl.push(pin('D50/MISO', 'GPIO'));
    else if (d === 51) dbl.push(pin('D51/MOSI', 'GPIO'));
    else if (d === 52) dbl.push(pin('D52/SCK', 'GPIO'));
    else if (d === 53) dbl.push(pin('D53/SS', 'GPIO'));
    else dbl.push(`D${d}`);
  }
  dbl.push('GND', 'GND');
  b.header({ name: 'DIGITAL-2X18', at: [3.7 * IN, 1.9 * IN], dir: '-y', rows: 2, style: 'socket', pins: dbl });
  b.header({
    name: 'ICSP',
    at: [63.64, 30.48],
    dir: '-y',
    rows: 2,
    style: 'up',
    pins: [pin('ICSP MISO', 'SPI_MISO'), pin('ICSP 5V', '5V'), pin('ICSP SCK', 'SPI_SCK'), pin('ICSP MOSI', 'SPI_MOSI'), pin('ICSP RESET', 'OTHER'), pin('ICSP GND', 'GND')],
  });
  arduinoPowerAndUsb(b);
  // ATmega2560.
  b.box(49, 26, 14, 14, 1.4, CHIP, { rot: 45 });
  b.hole(0.55 * IN, 0.1 * IN).hole(3.55 * IN, 0.1 * IN).hole(0.6 * IN, 2.0 * IN).hole(3.55 * IN, 2.0 * IN);
  return b.build({
    id: 'builtin:arduino-mega',
    name: 'Arduino Mega 2560',
    category: 'Microcontroller',
    logicVoltage: 5,
    note: 'Simplified model drawn by the app. Header positions follow the Arduino board drawing.',
  });
}

function arduinoNano(): Part {
  // Pins go down through the board, so it stands 8.5 mm above the bench on its pins.
  const b = new BoardBuilder(43.18, 17.78, '#0b7f8a', { pcbZ: 8.5 });
  b.header({
    name: 'TOP',
    at: [3.81, 16.51],
    dir: '+x',
    style: 'down',
    pins: ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND', 'RST', pin('RX0', 'UART_RX'), pin('TX1', 'UART_TX')],
  });
  b.header({
    name: 'BOTTOM',
    at: [3.81, 1.27],
    dir: '+x',
    style: 'down',
    pins: ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', pin('A4/SDA', 'ANALOG'), pin('A5/SCL', 'ANALOG'), 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'],
  });
  b.box(3, 8.89, 9, 7.7, 3.9, SILVER);
  b.usb('USB', -1.5, 8.89, 2, '-x');
  b.box(22, 8.89, 7, 7, 1.2, CHIP, { rot: 45 });
  b.box(31, 8.89, 3.5, 4.5, 1.6, SILVER).cyl(31, 8.89, 1.6, 0.6, '#e9e9e9', { lift: 1.6 });
  // ICSP pins at the far end (drawn only).
  b.box(38.4, 8.89, 5.08, 7.62, 2.5, '#1b1b1d');
  for (const x of [37.13, 39.67]) for (const y of [6.35, 8.89, 11.43]) b.box(x, y, 0.64, 0.64, 6, '#c9a13b', { lift: 2.5 });
  return b.build({
    id: 'builtin:arduino-nano',
    name: 'Arduino Nano',
    category: 'Microcontroller',
    logicVoltage: 5,
    plugsIntoBreadboard: true,
    plugDepth: 6,
    note: 'Simplified model drawn by the app. Plugs into a breadboard.',
  });
}

function raspberryPi4(): Part {
  const b = new BoardBuilder(85, 56, '#2e7d46');
  const g = (n: number, extra = '', type: 'GPIO' | 'I2C_SDA' | 'I2C_SCL' | 'UART_TX' | 'UART_RX' = 'GPIO'): PinDef =>
    pin(`GPIO${n}${extra}`, type, 3.3);
  const GND: PinDef = 'GND';
  const V5: PinDef = '5V';
  const V3: PinDef = '3V3';
  const layout: PinDef[] = [
    V3, V5,
    g(2, ' SDA', 'I2C_SDA'), V5,
    g(3, ' SCL', 'I2C_SCL'), GND,
    g(4), g(14, ' TXD', 'UART_TX'),
    GND, g(15, ' RXD', 'UART_RX'),
    g(17), g(18),
    g(27), GND,
    g(22), g(23),
    V3, g(24),
    g(10, ' MOSI'), GND,
    g(9, ' MISO'), g(25),
    g(11, ' SCLK'), g(8, ' CE0'),
    GND, g(7, ' CE1'),
    g(0, ' ID_SD'), g(1, ' ID_SC'),
    g(5), GND,
    g(6), g(12),
    g(13), GND,
    g(19), g(16),
    g(26), g(20),
    GND, g(21),
  ];
  // Add the physical pin number, which is how the header is usually read.
  const numbered = layout.map((d, i): PinDef => {
    const def = typeof d === 'string' ? { name: d, type: typeFromName(d) } : d;
    return { ...def, name: `${def.name} (pin ${i + 1})` };
  });
  b.header({ name: 'GPIO', at: [8.37, 51.23], dir: '+x', rows: 2, style: 'up', pins: numbered });
  // Bottom edge: USB-C power, two micro-HDMI, audio jack.
  b.box(11.2, 2.6, 9, 7.4, 3.2, SILVER);
  b.usb('USB-C power', 11.2, -1.1, 1.6, '-y');
  b.box(26, 2.3, 6.5, 7.6, 3, SILVER).box(39.5, 2.3, 6.5, 7.6, 3, SILVER);
  b.box(54, 5, 7, 12.5, 6, CHIP).cyl(54, -2.2, 5.6, 2.5, CHIP, { lift: 0.2, axis: 'y' });
  // Right edge: USB 2, USB 3, Ethernet.
  b.box(79.2, 9, 17.5, 13.2, 15.6, SILVER).box(79.2, 27, 17.5, 13.2, 15.6, SILVER).box(77.4, 45.75, 21.2, 16, 13.5, SILVER);
  b.box(87.9, 27, 0.4, 11.5, 13, '#2f6fd6');
  b.usb('USB 2 (top)', 88, 9, 11.5, '+x').usb('USB 2 (bottom)', 88, 9, 4.5, '+x');
  b.usb('USB 3 (top)', 88, 27, 11.5, '+x').usb('USB 3 (bottom)', 88, 27, 4.5, '+x');
  // SoC, RAM, USB controller, camera and display sockets.
  b.box(29, 32.5, 15, 15, 2.4, '#aeb3b9').box(43.5, 32.5, 10, 12, 1.2, CHIP).box(58, 32, 6, 6, 1, CHIP);
  b.box(4, 28, 2.6, 22, 5.5, '#e9e6dc').box(45, 11.5, 2.6, 22, 5.5, '#e9e6dc');
  b.hole(3.5, 3.5, 6).hole(61.5, 3.5, 6).hole(3.5, 52.5, 6).hole(61.5, 52.5, 6);
  return b.build({
    id: 'builtin:raspberry-pi-4b',
    name: 'Raspberry Pi 4 Model B',
    category: 'Single-board computer',
    logicVoltage: 3.3,
    note: 'Simplified model drawn by the app. GPIO pins are 3.3 V only.',
  });
}

function bluePill(): Part {
  const b = new BoardBuilder(53.34, 22.86, '#1f3f95', { pcbZ: 8.5 });
  // 5 V tolerant pins on the STM32F103C8.
  const ft = (name: string, type: 'GPIO' | 'I2C_SDA' | 'I2C_SCL' | 'UART_TX' | 'UART_RX' = 'GPIO'): PinDef => pin(name, type, 5);
  const io = (name: string, type: 'GPIO' | 'ANALOG' = 'GPIO'): PinDef => pin(name, type, 3.3);
  b.header({
    name: 'TOP',
    at: [2.54, 19.05],
    dir: '+x',
    style: 'down',
    pins: [
      'GND', 'GND', '3V3', 'NRST',
      ft('PB11'), ft('PB10'), io('PB1', 'ANALOG'), io('PB0', 'ANALOG'),
      io('PA7', 'ANALOG'), io('PA6', 'ANALOG'), io('PA5', 'ANALOG'), io('PA4', 'ANALOG'),
      io('PA3', 'ANALOG'), io('PA2', 'ANALOG'), io('PA1', 'ANALOG'), io('PA0', 'ANALOG'),
      io('PC15'), io('PC14'), io('PC13'), 'VBAT',
    ],
  });
  b.header({
    name: 'BOTTOM',
    at: [2.54, 3.81],
    dir: '+x',
    style: 'down',
    pins: [
      ft('PB12'), ft('PB13'), ft('PB14'), ft('PB15'),
      ft('PA8'), ft('PA9/TX1', 'UART_TX'), ft('PA10/RX1', 'UART_RX'), ft('PA11'),
      ft('PA12'), ft('PA15'), ft('PB3'), ft('PB4'),
      io('PB5'), ft('PB6/SCL', 'I2C_SCL'), ft('PB7/SDA', 'I2C_SDA'), ft('PB8'),
      ft('PB9'), '5V', 'GND', '3V3',
    ],
  });
  b.box(1.8, 11.43, 5.6, 7.6, 2.6, SILVER);
  b.usb('USB', -1, 11.43, 1.3, '-x');
  b.box(32, 11.43, 7, 7, 1.4, CHIP, { rot: 45 });
  // Boot jumpers, reset button, crystal, SWD pins (drawn only).
  b.box(13.5, 11.43, 7.62, 5.08, 2.5, '#1b1b1d').box(12.2, 10.16, 5, 2.4, 6, '#e8c62f', { lift: 2.5 }).box(12.2, 12.7, 5, 2.4, 6, '#e8c62f', { lift: 2.5 });
  b.box(21.5, 11.43, 3.5, 6, 1.6, SILVER).box(25.5, 6.5, 4.6, 11, 3.4, SILVER, { rot: 90 });
  b.box(51.4, 11.43, 2.54, 10.16, 2.54, '#1b1b1d');
  for (const y of [7.62, 10.16, 12.7, 15.24]) b.box(55.5, y, 6, 0.64, 0.64, '#c9a13b', { lift: 0.95 });
  return b.build({
    id: 'builtin:stm32-blue-pill',
    name: 'STM32 Blue Pill (F103C8)',
    category: 'Microcontroller',
    logicVoltage: 3.3,
    plugsIntoBreadboard: true,
    plugDepth: 6,
    note: 'Simplified model drawn by the app. Plugs into a breadboard. Analog-capable pins are 3.3 V only.',
  });
}

function stm32f4Discovery(): Part {
  const b = new BoardBuilder(66, 97, '#2c7a55');
  const p1 = [
    'GND', 'GND', 'VDD', 'VDD', 'GND', 'NRST', 'PC1', 'PC0', 'PC3', 'PC2',
    'PA1', 'PA0', 'PA3', 'PA2', 'PA5', 'PA4', 'PA7', 'PA6', 'PC5', 'PC4',
    'PB1', 'PB0', 'GND', 'PB2', 'PE7', 'PE8', 'PE9', 'PE10', 'PE11', 'PE12',
    'PE13', 'PE14', 'PE15', 'PB10', 'PB11', 'PB12', 'PB13', 'PB14', 'PB15', 'PD8',
    'PD9', 'PD10', 'PD11', 'PD12', 'PD13', 'PD14', 'PD15', 'NC', 'GND', 'GND',
  ];
  const p2 = [
    'GND', 'GND', '5V', '5V', '3V', '3V', 'PH0', 'PH1', 'PC14', 'PC15',
    'PE6', 'PC13', 'PE4', 'PE5', 'PE2', 'PE3', 'PE0', 'PE1', 'PB8', 'PB9',
    'BOOT0', 'VDD', 'PB6', 'PB7', 'PB4', 'PB5', 'PD7', 'PB3', 'PD5', 'PD6',
    'PD3', 'PD4', 'PD1', 'PD2', 'PC12', 'PD0', 'PC10', 'PC11', 'PA14', 'PA15',
    'PA10', 'PA13', 'PA8', 'PA9', 'PC8', 'PC9', 'PC6', 'PC7', 'GND', 'GND',
  ];
  // Repeated names (GND, VDD, 5V, 3V) are told apart by the header and pin number.
  const defs = (header: string, names: string[]): PinDef[] =>
    names.map((n, i) => {
      const isPort = /^P[A-H]\d+$/.test(n);
      if (isPort) return pin(n, 'GPIO', 3.3);
      const type = n === 'GND' ? 'GND' : n === '5V' ? '5V' : n === '3V' || n === 'VDD' ? '3V3' : 'OTHER';
      return pin(`${n} (${header}-${i + 1})`, type);
    });
  b.header({ name: 'P1', at: [3.79, 68.5], dir: '-y', rows: 2, style: 'up', pins: defs('P1', p1) });
  b.header({ name: 'P2', at: [59.67, 68.5], dir: '-y', rows: 2, style: 'up', pins: defs('P2', p2) });
  // ST-LINK USB at the top, user USB and audio jack at the bottom.
  b.box(33, 93.5, 7.7, 9, 3.9, SILVER);
  b.usb('USB ST-LINK', 33, 98, 2, '+y');
  b.box(33, 2.6, 7.6, 5.6, 2.6, SILVER);
  b.usb('USB user', 33, -0.2, 1.3, '-y');
  b.box(47, 6, 6, 12, 5, CHIP);
  // Main MCU, ST-LINK MCU, buttons, LEDs.
  b.box(33, 42, 14, 14, 1.4, CHIP, { rot: 45 }).box(33, 80, 7, 7, 1.4, CHIP, { rot: 45 });
  b.box(17, 30, 6, 6, 3.5, SILVER).cyl(17, 30, 3.4, 1.2, '#2f6fd6', { lift: 3.5 });
  b.box(49, 30, 6, 6, 3.5, SILVER).cyl(49, 30, 3.4, 1.2, '#222', { lift: 3.5 });
  b.box(33, 26, 2, 1.2, 0.8, '#3fbf4f').box(33, 16, 2, 1.2, 0.8, '#2f6fd6').box(27, 21, 1.2, 2, 0.8, '#f08a24').box(39, 21, 1.2, 2, 0.8, '#d6392c');
  b.hole(4, 93, 3).hole(62, 93, 3).hole(4, 3, 3).hole(62, 3, 3);
  return b.build({
    id: 'builtin:stm32f4-discovery',
    name: 'STM32F4 Discovery (F407)',
    category: 'Microcontroller',
    logicVoltage: 3.3,
    note: 'Simplified model drawn by the app. Pin names follow the P1 and P2 tables in the ST user manual. Header spacing is approximate.',
  });
}

function ftdiAdapter(): Part {
  const b = new BoardBuilder(36, 18, '#b3261e');
  b.header({
    name: 'SERIAL',
    at: [34.2, 15.35],
    dir: '-y',
    style: 'side',
    out: '+x',
    pins: ['DTR', pin('RX', 'UART_RX'), pin('TX', 'UART_TX'), pin('VCC (5V)', '5V'), 'CTS', 'GND'],
  });
  b.box(3, 9, 9, 7.7, 3.9, SILVER);
  b.usb('USB', -1.5, 9, 2, '-x');
  b.box(18, 9, 10.2, 5.3, 1.7, CHIP);
  b.box(27, 4, 5, 2.4, 6, '#e8c62f');
  return b.build({
    id: 'builtin:ftdi-ft232rl',
    name: 'FTDI FT232RL USB-serial adapter',
    category: 'USB adapter',
    logicVoltage: 5,
    note: 'Simplified model drawn by the app. Logic level assumes the jumper is on 5 V.',
  });
}

function ch340Adapter(): Part {
  const b = new BoardBuilder(33, 15, '#1d2a4d');
  b.header({
    name: 'SERIAL',
    at: [31.2, 13.85],
    dir: '-y',
    style: 'side',
    out: '+x',
    pins: ['5V', pin('VCC', 'OTHER'), '3V3', pin('TXD', 'UART_TX'), pin('RXD', 'UART_RX'), 'GND'],
  });
  // USB-A plug overhangs the left edge.
  b.box(-6.5, 7.5, 19, 12, 4.5, SILVER, { lift: -1 });
  b.usb('USB plug', -16, 7.5, 1.2, '-x', 'male');
  b.box(15, 7.5, 9.9, 3.9, 1.6, CHIP);
  b.box(25.5, 4.5, 4.6, 11, 3.4, SILVER, { rot: 90 });
  return b.build({
    id: 'builtin:ch340g',
    name: 'CH340G USB-serial adapter',
    category: 'USB adapter',
    logicVoltage: 5,
    note: 'Simplified model drawn by the app. Logic level assumes the VCC jumper is on 5 V.',
  });
}

let cache: Part[] | undefined;

export function builtinBoards(): Part[] {
  cache ??= [
    arduinoUno(),
    arduinoNano(),
    arduinoMega(),
    raspberryPi4(),
    bluePill(),
    stm32f4Discovery(),
    ftdiAdapter(),
    ch340Adapter(),
  ];
  return cache;
}
