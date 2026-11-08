// Set REACT_APP_DAILY_FUNDS_BREAKDOWN=false and rebuild to restore the original card.
export const DAILY_FUNDS_BREAKDOWN_ENABLED = process.env.REACT_APP_DAILY_FUNDS_BREAKDOWN !== 'false';
// Independent switch for spending visuals; it never changes accounting data.
export const SPENDING_MONEY_VISUAL_ENABLED = process.env.REACT_APP_SPENDING_MONEY_VISUAL !== 'false';
// Restore the previous home flow without changing saved data.
export const SPENDING_JOURNEY_ENABLED = process.env.REACT_APP_SPENDING_JOURNEY !== 'false';
export const PRODUCT_GUIDE_ENABLED = process.env.REACT_APP_PRODUCT_GUIDE !== 'false';
const stressTestSetting = process.env.REACT_APP_LIVING_FUNDS_STRESS_TEST;
export const LIVING_FUNDS_STRESS_TEST_ENABLED = stressTestSetting === 'true' ||
  (process.env.NODE_ENV === 'development' && stressTestSetting !== 'false');
