import { useNavigate } from 'react-router-dom';
import { SettingsPanel } from '@/components/settings-panel';

export default function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-hidden">
      <SettingsPanel onClose={() => navigate('/')} isOverlay={false} />
    </div>
  );
}
