export interface DeriveClientConfig {
  baseUrl?: string;
  timeout?: number;
}

export interface GetAllInstrumentsParams {
  expired: boolean;
  instrument_type: 'erc20' | 'option' | 'perp';
  currency?: string;
  page?: number;
  page_size?: number;
}

export interface GetInstrumentParams {
  instrument_name: string;
}

export interface GetCurrencyParams {
  currency: string;
}

export interface GetTickerParams {
  instrument_name: string;
}

export interface GetTickersParams {
  instrument_type: 'erc20' | 'option' | 'perp';
  currency?: string;
  expiry_date?: string;
}

export interface GetSpotFeedHistoryParams {
  currency: string;
  start_timestamp: number;
  end_timestamp: number;
  period: number;
}

export interface GetSpotFeedHistoryCandlesParams {
  currency: string;
  start_timestamp: number;
  end_timestamp: number;
  period: number;
}

export interface GetFundingRateHistoryParams {
  instrument_name: string;
  start_timestamp?: number;
  end_timestamp?: number;
  period?: 900 | 3600 | 14400 | 28800 | 86400;
}

export interface GetInterestRateHistoryParams {
  from_timestamp_sec: number;
  to_timestamp_sec: number;
  page?: number;
  page_size?: number;
}

export interface GetOptionSettlementHistoryParams {
  page?: number;
  page_size?: number;
  subaccount_id?: number;
}

export interface GetLatestSignedFeedsParams {
  currency?: string;
  expiry?: number;
}

export interface GetLiquidationHistoryParams {
  start_timestamp?: number;
  end_timestamp?: number;
  page?: number;
  page_size?: number;
}

export interface SimulatedCollateral {
  amount: string;
  asset_name: string;
}

export interface SimulatedPosition {
  amount: string;
  instrument_name: string;
  entry_price?: string;
}

export interface GetMarginParams {
  margin_type: 'PM' | 'PM2' | 'SM';
  simulated_collaterals: SimulatedCollateral[];
  simulated_positions: SimulatedPosition[];
  market?: string;
}

export interface GetStatisticsParams {
  instrument_name: string;
  currency?: string;
  end_time?: number;
}

export interface Metrics {
  requests: number;
  errors: Record<number, number>;
  uptime_seconds: number;
}
