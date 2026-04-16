import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const paginationParams = {
  page: {
    type: 'integer' as const,
    description: 'Page number (default 1)',
    minimum: 1,
  },
  page_size: {
    type: 'integer' as const,
    description: 'Results per page (default 100, max 1000)',
    minimum: 1,
    maximum: 1000,
  },
};

const INSTRUMENT_TYPE_ENUM = ['erc20', 'option', 'perp'] as const;
const MARGIN_TYPE_ENUM = ['PM', 'PM2', 'SM'] as const;
const PERIOD_ENUM = [900, 3600, 14400, 28800, 86400] as const;

export const tools: Tool[] = [
  {
    name: 'get_all_currencies',
    description: 'Get all available currencies on Derive',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_currency',
    description: 'Get details for a specific currency',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Currency symbol, e.g. ETH, BTC' },
      },
      required: ['currency'],
    },
  },
  {
    name: 'get_all_instruments',
    description: 'Get all available instruments (options, perps, or ERC20 tokens)',
    inputSchema: {
      type: 'object',
      properties: {
        expired: { type: 'boolean', description: 'If true, include expired instruments' },
        instrument_type: { type: 'string', enum: INSTRUMENT_TYPE_ENUM, description: 'Instrument type' },
        currency: { type: 'string', description: 'Filter by currency, e.g. ETH, BTC' },
        ...paginationParams,
      },
      required: ['expired', 'instrument_type'],
    },
  },
  {
    name: 'get_instrument',
    description: 'Get details for a specific instrument by name',
    inputSchema: {
      type: 'object',
      properties: {
        instrument_name: { type: 'string', description: 'Instrument name, e.g. ETH-PERP, BTC-20260328-50000-C' },
      },
      required: ['instrument_name'],
    },
  },
  {
    name: 'get_ticker',
    description: 'Get current price, volume, bid/ask for an instrument',
    inputSchema: {
      type: 'object',
      properties: {
        instrument_name: { type: 'string', description: 'Instrument name, e.g. ETH-PERP' },
      },
      required: ['instrument_name'],
    },
  },
  {
    name: 'get_tickers',
    description: 'Get tickers for all instruments of a given type',
    inputSchema: {
      type: 'object',
      properties: {
        instrument_type: { type: 'string', enum: INSTRUMENT_TYPE_ENUM, description: 'Instrument type' },
        currency: { type: 'string', description: 'Currency filter (required for options)' },
        expiry_date: { type: 'string', description: 'Expiry date filter for options (YYYYMMDD format)' },
      },
      required: ['instrument_type'],
    },
  },
  {
    name: 'get_spot_feed_history',
    description: 'Get historical spot price data for a currency',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Currency, e.g. ETH, BTC' },
        start_timestamp: { type: 'integer', description: 'Start timestamp in seconds' },
        end_timestamp: { type: 'integer', description: 'End timestamp in seconds' },
        period: { type: 'integer', description: 'Time interval between data points in seconds' },
      },
      required: ['currency', 'start_timestamp', 'end_timestamp', 'period'],
    },
  },
  {
    name: 'get_spot_feed_history_candles',
    description: 'Get OHLC candlestick data for spot prices',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Currency, e.g. ETH, BTC' },
        start_timestamp: { type: 'integer', description: 'Start timestamp in seconds' },
        end_timestamp: { type: 'integer', description: 'End timestamp in seconds' },
        period: { type: 'integer', description: 'Candle period in seconds: 60, 300, 900, 1800, 3600, 14400, 28800, 86400, or 604800' },
      },
      required: ['currency', 'start_timestamp', 'end_timestamp', 'period'],
    },
  },
  {
    name: 'get_funding_rate_history',
    description: 'Get historical funding rates for a perpetual instrument',
    inputSchema: {
      type: 'object',
      properties: {
        instrument_name: { type: 'string', description: 'Perp instrument name, e.g. ETH-PERP' },
        start_timestamp: { type: 'integer', description: 'Start timestamp in seconds (default 0, max 30 days ago)' },
        end_timestamp: { type: 'integer', description: 'End timestamp in seconds (default now)' },
        period: { type: 'integer', enum: PERIOD_ENUM, description: 'Period in seconds' },
      },
      required: ['instrument_name'],
    },
  },
  {
    name: 'get_interest_rate_history',
    description: 'Get historical borrowing interest rates',
    inputSchema: {
      type: 'object',
      properties: {
        from_timestamp_sec: { type: 'integer', description: 'Start timestamp in seconds' },
        to_timestamp_sec: { type: 'integer', description: 'End timestamp in seconds' },
        ...paginationParams,
      },
      required: ['from_timestamp_sec', 'to_timestamp_sec'],
    },
  },
  {
    name: 'get_option_settlement_history',
    description: 'Get historical option settlement data',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationParams,
        subaccount_id: { type: 'integer', description: 'Filter by subaccount ID' },
      },
    },
  },
  {
    name: 'get_latest_signed_feeds',
    description: 'Get current oracle price feeds',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Currency filter (defaults to all)' },
        expiry: { type: 'integer', description: 'Expiry filter (0 for spot/perp only, defaults to all)' },
      },
    },
  },
  {
    name: 'get_liquidation_history',
    description: 'Get historical liquidation events',
    inputSchema: {
      type: 'object',
      properties: {
        start_timestamp: { type: 'integer', description: 'Start timestamp in seconds (default 0)' },
        end_timestamp: { type: 'integer', description: 'End timestamp in seconds (default now)' },
        ...paginationParams,
      },
    },
  },
  {
    name: 'get_margin',
    description: 'Simulate margin requirements for a hypothetical portfolio',
    inputSchema: {
      type: 'object',
      properties: {
        margin_type: { type: 'string', enum: MARGIN_TYPE_ENUM, description: 'Margin type: PM (Portfolio), PM2, or SM (Standard)' },
        simulated_collaterals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'string', description: 'Collateral amount' },
              asset_name: { type: 'string', description: 'Asset name, e.g. USDC' },
            },
            required: ['amount', 'asset_name'],
          },
          description: 'List of simulated collaterals',
        },
        simulated_positions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'string', description: 'Position size' },
              instrument_name: { type: 'string', description: 'Instrument name' },
              entry_price: { type: 'string', description: 'Entry price' },
            },
            required: ['amount', 'instrument_name'],
          },
          description: 'List of simulated positions',
        },
        market: { type: 'string', description: 'Market (required for Portfolio Margin)' },
      },
      required: ['margin_type', 'simulated_collaterals', 'simulated_positions'],
    },
  },
  {
    name: 'get_statistics',
    description: 'Get aggregate platform statistics (volume, open interest, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        instrument_name: { type: 'string', description: "Instrument name or 'ALL', 'OPTION', 'PERP', 'SPOT'" },
        currency: { type: 'string', description: 'Currency filter' },
        end_time: { type: 'integer', description: 'End time in milliseconds' },
      },
      required: ['instrument_name'],
    },
  },
];
