import type { ComponentType, ReactNode } from 'react';

export interface SettingsItemProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  onClick?: () => void;
  control?: ReactNode;
}

export function SettingsItem({ icon: Icon, label, description, onClick, control }: SettingsItemProps) {
  const content = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-body">{label}</span>
        {description && <span className="mt-0.5 block text-helper">{description}</span>}
      </span>
      {control}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className="as-settings-item w-full text-left">
      {content}
    </button>
  ) : (
    <div className="as-settings-item">{content}</div>
  );
}

export function PreferenceSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="as-switch shrink-0"
      onClick={() => onChange(!checked)}
    />
  );
}
