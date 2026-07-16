import { useQuery } from '@tanstack/react-query';
import { TransactioncurrenciesService } from '@/generated/services/TransactioncurrenciesService';
import { setCurrencyCatalog, type CurrencyInfo } from '@/lib/base-currency';

/**
 * Loads the Dataverse transaction-currency catalog once and populates the
 * base-currency module, so the app displays amounts in the environment base
 * currency symbol dynamically (never hardcoded). Mount once at the app root.
 */
export function useCurrencyCatalog() {
  return useQuery({
    queryKey: ['transactioncurrencies'],
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async (): Promise<CurrencyInfo[]> => {
      const result = await TransactioncurrenciesService.getAll();
      const rows = result.success ? (result.data ?? []) : [];
      const list: CurrencyInfo[] = rows.map((c) => ({
        id: c.transactioncurrencyid,
        symbol: c.currencysymbol,
        iso: c.isocurrencycode,
        name: c.currencyname,
        rate: c.exchangerate,
      }));
      setCurrencyCatalog(list);
      return list;
    },
  });
}
