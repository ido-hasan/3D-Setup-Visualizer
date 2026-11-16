import type { PinType, RfConnector } from '@viz/shared';

/** Marker colour for each pin type. */
export const PIN_COLORS: Record<PinType, string> = {
  '5V': '#e0362c',
  '3V3': '#f08a24',
  VIN: '#b0271f',
  GND: '#1f2328',
  GPIO: '#22a15a',
  ANALOG: '#12a3a8',
  I2C_SDA: '#8d4bc4',
  I2C_SCL: '#a86ad6',
  UART_TX: '#2f6fd6',
  UART_RX: '#5b93ea',
  SPI_MOSI: '#b0791c',
  SPI_MISO: '#c9952f',
  SPI_SCK: '#8a6417',
  SPI_CS: '#a98a4f',
  USB: '#5d6673',
  RF: '#d9a514',
  OTHER: '#98a2b3',
};

export const PIN_TYPE_LABELS: Record<PinType, string> = {
  '5V': '5 V',
  '3V3': '3.3 V',
  VIN: 'VIN (supply in)',
  GND: 'Ground',
  GPIO: 'Digital I/O',
  ANALOG: 'Analog',
  I2C_SDA: 'I2C SDA',
  I2C_SCL: 'I2C SCL',
  UART_TX: 'UART TX',
  UART_RX: 'UART RX',
  SPI_MOSI: 'SPI MOSI',
  SPI_MISO: 'SPI MISO',
  SPI_SCK: 'SPI SCK',
  SPI_CS: 'SPI CS',
  USB: 'USB',
  RF: 'RF port (coax)',
  OTHER: 'Other',
};

export const RF_CONNECTOR_LABELS: Record<RfConnector, string> = { SMA: 'SMA', BNC: 'BNC', N: 'N', UFL: 'U.FL' };
