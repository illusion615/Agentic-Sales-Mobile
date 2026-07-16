import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLocale, t } from '@/lib/i18n';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { currentQuarter, targetKey, DEFAULT_RISK_THRESHOLD, type BusinessSettings } from '@/lib/business-settings';

/**
 * Per-user opportunity business settings panel: quarterly sales targets, the AI
 * summary generation toggle, and the at-risk confidence threshold. Opened from
 * the gear icon in the opportunity review header.
 */
export function OpportunitySettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = getLocale();
  const { settings, save, isSaving } = useBusinessSettings();
  const thisYear = currentQuarter().year;

  const [year, setYear] = useState<number>(thisYear);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true);
  const [riskThreshold, setRiskThreshold] = useState<number>(DEFAULT_RISK_THRESHOLD);

  // Seed the editable copy from stored settings each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTargets({ ...settings.targets });
    setAiSummaryEnabled(settings.aiSummaryEnabled);
    setRiskThreshold(settings.riskThreshold);
    setYear(thisYear);
    // Intentionally seed only when `open` flips true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const years = useMemo(() => [thisYear, thisYear + 1], [thisYear]);

  const setQuarter = (q: number, value: string) => {
    const num = Number(value.replace(/[^0-9]/g, ''));
    setTargets((prev) => ({ ...prev, [targetKey(year, q)]: Number.isFinite(num) ? num : 0 }));
  };
  const quarterValue = (q: number): string => {
    const v = targets[targetKey(year, q)];
    // Group with thousands separators for quick reading (e.g. 500,000). setQuarter
    // strips non-digits on input, so the separators are display-only.
    return v ? v.toLocaleString('en-US') : '';
  };

  const handleSave = async () => {
    const next: BusinessSettings = { targets, aiSummaryEnabled, riskThreshold };
    await save(next);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('businessSettings', locale)}</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-2 space-y-5">
          {/* Quarterly targets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('quarterlyTargets', locale)}</Label>
              <Select value={String(year)} onValueChange={(v: string) => setYear(Number(v))}>
                <SelectTrigger className="h-8 w-auto gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((q) => (
                <div key={q} className="space-y-1">
                  <span className="text-xs text-muted-foreground">Q{q}</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      inputMode="numeric"
                      value={quarterValue(q)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuarter(q, e.target.value)}
                      className="pl-6 h-9"
                      placeholder="0"
                      aria-label={`Q${q} ${t('quarterlyTargets', locale)}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI summary generation */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label>{t('aiSummaryGeneration', locale)}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('aiSummaryGenerationDesc', locale)}</p>
            </div>
            <Switch checked={aiSummaryEnabled} onCheckedChange={setAiSummaryEnabled} />
          </div>

          {/* Risk threshold */}
          <div className="space-y-1">
            <Label>{t('riskThreshold', locale)}</Label>
            <p className="text-xs text-muted-foreground">{t('riskThresholdDesc', locale)}</p>
            <div className="relative w-28">
              <Input
                inputMode="numeric"
                value={String(riskThreshold)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const n = Number(e.target.value.replace(/[^0-9]/g, ''));
                  setRiskThreshold(Math.max(1, Math.min(99, Number.isFinite(n) && n > 0 ? n : DEFAULT_RISK_THRESHOLD)));
                }}
                className="pr-7 h-9"
                aria-label={t('riskThreshold', locale)}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
            </div>
          </div>
        </div>

        <SheetFooter className="px-4 pb-4">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {t('save', locale)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
