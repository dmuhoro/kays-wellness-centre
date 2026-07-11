export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  KES: { code: "KES", symbol: "KES", locale: "en-KE" },
  USD: { code: "USD", symbol: "$", locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£", locale: "en-GB" },
};

export function getCurrencyConfig(currencyCode?: string | null): CurrencyConfig {
  return CURRENCIES[currencyCode ?? "KES"] || CURRENCIES.KES;
}

export function formatCurrency(
  amount: number,
  currencyCode?: string | null,
): string {
  const cfg = getCurrencyConfig(currencyCode);
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${cfg.symbol} ${amount.toLocaleString()}`;
  }
}

export function formatNumber(
  value: number,
  currencyCode?: string | null,
): string {
  const cfg = getCurrencyConfig(currencyCode);
  try {
    return new Intl.NumberFormat(cfg.locale).format(value);
  } catch {
    return value.toLocaleString();
  }
}

export function formatDate(
  iso: string,
  timeZone?: string,
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "UTC",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

export function parseAmount(value: string): number {
  const cleaned = value.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}
