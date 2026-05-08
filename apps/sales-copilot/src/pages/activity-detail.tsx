import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Phone,
  Calendar,
  CheckSquare,
  Mail,
  MapPin,
  Clock,
  Building2,
  Target,
  FileText,
  ArrowRight,
  Edit,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActivityList, useUpdateActivity, useDeleteActivity } from '@/generated/hooks/use-activity';
import { ActivityTypekeyToLabel, ActivityDraftstatuskeyToLabel, ActivityOutcomekeyToLabel } from '@/generated/models/activity-model';
import type { Activity as DataverseActivity, ActivityDraftstatuskey } from '@/generated/models/activity-model';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getLocale } from '@/lib/i18n';

const activityIcons: Record<string, typeof Phone> = {
  visit: MapPin,
  call: Phone,
  meeting: Calendar,
  email: Mail,
  other: CheckSquare,
};

const activityColors: Record<string, string> = {
  visit: 'bg-primary',
  call: 'bg-[#0D8F8C]',
  meeting: 'bg-[#6366F1]',
  email: 'bg-[#10B981]',
  other: 'bg-muted-foreground',
};

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { data: activities = [], isLoading } = useActivityList();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const locale = getLocale();

  const activity = useMemo(() => {
    return activities.find((a: DataverseActivity) => a.id === id);
  }, [activities, id]);

  const handleMarkComplete = async () => {
    if (!activity) return;
    try {
      await updateActivity.mutateAsync({
        id: activity.id,
        changedFields: {
          draftstatusKey: 'Draftstatuskey2' as ActivityDraftstatuskey,
        },
      });
      toast.success('Activity marked as completed');
    } catch (error: unknown) {
      toast.error('Failed to update activity');
    }
  };

  const handleDelete = async () => {
    if (!activity) return;
    try {
      await deleteActivity.mutateAsync(activity.id);
      toast.success('Activity deleted');
      navigate('/activities');
    } catch (error: unknown) {
      toast.error('Failed to delete activity');
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="Activity">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  if (!activity) {
    return (
      <MobileLayout title="Activity">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="text-muted-foreground">Activity not found</div>
          <Button onClick={() => navigate('/activities')}>Back to Activities</Button>
        </div>
      </MobileLayout>
    );
  }

  const typeLabel = ActivityTypekeyToLabel[activity.typeKey];
  const Icon = activityIcons[typeLabel] || CheckSquare;
  const color = activityColors[typeLabel] || 'bg-muted';
  const statusLabel = ActivityDraftstatuskeyToLabel[activity.draftstatusKey];
  const isCompleted = statusLabel === 'completed';
  const outcomeLabel = activity.outcomeKey ? ActivityOutcomekeyToLabel[activity.outcomeKey] : undefined;

  const deleteButton = (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogTrigger asChild>
        <button
          className="p-2 rounded-full hover:bg-destructive/10 transition-colors"
          aria-label="Delete activity"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Activity</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this activity? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <MobileLayout title="Activity Details" hideVoiceButton headerRight={deleteButton}>
      {/* Main scrollable content - add padding bottom for fixed action bar */}
      <motion.div
        className="py-4 space-y-4 pb-48"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' as const }}
      >
        {/* Header Card */}
        <GlassCard className="space-y-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center flex-shrink-0`}
            >
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground mb-1">
                {activity.title}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={isCompleted ? 'secondary' : 'default'}
                  className="capitalize"
                >
                  {statusLabel}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {typeLabel}
                </Badge>
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {formatDate(activity.scheduleddate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(activity.scheduleddate)}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Details Card */}
        <GlassCard className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Details
          </h2>

          {/* Account */}
          {activity.account && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/clients/${activity.account?.id}`)}
            >
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="text-sm font-medium text-foreground">
                  {activity.account.name1}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}

          {/* Opportunity */}
          {activity.opportunity && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/opportunities/${activity.opportunity?.id}`)}
            >
              <Target className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Opportunity</p>
                <p className="text-sm font-medium text-foreground">
                  {activity.opportunity.name1}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}

          {/* Outcome */}
          {outcomeLabel && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Outcome</p>
                <p className="text-sm font-medium text-foreground">
                  {outcomeLabel}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {activity.notes && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Notes</p>
              </div>
              <p className="text-sm text-foreground leading-relaxed pl-6">
                {activity.notes}
              </p>
            </div>
          )}
        </GlassCard>

        {/* Metadata */}
        {activity.createdon && (
          <div className="text-xs text-muted-foreground text-center">
            <p>Created: {formatDateTime(activity.createdon)}</p>
          </div>
        )}
      </motion.div>

      {/* Quick Actions - positioned above global copilot */}
      <div className="fixed bottom-20 left-0 right-0 z-40 safe-area-bottom pointer-events-none" style={{ background: 'linear-gradient(to top, var(--background) 40%, transparent)' }}>
        <div className="flex items-center justify-center gap-2 px-4 pointer-events-auto">
          {!isCompleted && (
            <button
              onClick={handleMarkComplete}
              disabled={updateActivity.isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5',
                'rounded-full glass-card-hover',
                'text-xs font-medium text-foreground',
                'active:scale-95 transition-transform',
                'disabled:opacity-50'
              )}
            >
              <CheckCircle className="w-4 h-4 text-primary" />
              <span>{locale === 'zh-Hans' ? '完成' : 'Complete'}</span>
            </button>
          )}
          <button
            onClick={() => navigate(`/activity-capture?edit=${activity.id}`)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5',
              'rounded-full glass-card-hover',
              'text-xs font-medium text-foreground',
              'active:scale-95 transition-transform'
            )}
          >
            <Edit className="w-4 h-4 text-primary" />
            <span>{locale === 'zh-Hans' ? '编辑' : 'Edit'}</span>
          </button>
        </div>
      </div>
    </MobileLayout>
  );
}
