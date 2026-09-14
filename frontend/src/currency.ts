import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";

export type Rates = Record<string, number>;

export const COMMON_CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "PLN", symbol: "zł", name: "Polish Złoty" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "ARS", symbol: "AR$", name: "Argentine Peso" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
];

export function symbolFor(code: string): string {
  return COMMON_CURRENCIES.find((c) => c.code === code)?.symbol || code;
}

export function useRates() {
  return useQuery<{ base: string; rates: Rates }>({
    queryKey: ["exchange-rates", "USD"],
    queryFn: () => api.exchangeRates("USD"),
    staleTime: 6 * 60 * 60 * 1000,
  });
}

// Convert an amount from `from` to `to` currency, using rates keyed to USD.
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Rates | undefined
): number {
  if (!amount) return 0;
  const f = (from || "USD").toUpperCase();
  const t = (to || "USD").toUpperCase();
  if (f === t) return amount;
  if (!rates || !rates[f] || !rates[t]) return amount;
  // rates are USD -> currency, so amount_in_usd = amount / rates[from]
  const usd = amount / rates[f];
  return usd * rates[t];
}

export function formatMoney(amount: number, code: string): string {
  const c = code || "USD";
  const symbol = symbolFor(c);
  const digits = c === "JPY" || c === "KRW" || c === "VND" || c === "IDR" || c === "HUF" ? 0 : 2;
  const formatted = Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${symbol}${formatted}`;
}
