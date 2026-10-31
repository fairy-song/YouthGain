// Set REACT_APP_DAILY_FUNDS_BREAKDOWN=false and rebuild to restore the original card.
export const DAILY_FUNDS_BREAKDOWN_ENABLED = process.env.REACT_APP_DAILY_FUNDS_BREAKDOWN !== 'false';
// Independent switch for spending visuals; it never changes accounting data.
export const SPENDING_MONEY_VISUAL_ENABLED = process.env.REACT_APP_SPENDING_MONEY_VISUAL !== 'false';
