import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Plus, Trash2, KeyRound, Server } from 'lucide-react';
import { Tooltip } from '../../components/ui/Tooltip';
import { extractErrorMessage } from '../../utils/errorHandler';

interface PrintAgent {
  id: string;
  name: string;
  isRevoked: boolean;
  lastHeartbeat: string | null;
  createdAt: string;
}

export const OwnerPrintAgents: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

  const { data: agents = [], isLoading } = useQuery<PrintAgent[]>({
    queryKey: ['print-agents'],
    queryFn: async () => {
      const { data } = await axiosClient.get('/print-agents');
      return data;
    },
  });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const { data } = await axiosClient.post('/print-agents/register', { name: newName });
      setNewToken({ name: data.agent.name, token: data.token });
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['print-agents'] });
      addToast({ type: 'success', title: t('printAgents.registered') });
    } catch (err) {
      addToast({ type: 'error', title: t('printAgents.registerFailed'), message: extractErrorMessage(err) });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(t('printAgents.revokeConfirm', { name }))) return;
    try {
      await axiosClient.post(`/print-agents/${id}/revoke`);
      queryClient.invalidateQueries({ queryKey: ['print-agents'] });
      addToast({ type: 'success', title: t('printAgents.revoked') });
    } catch (err) {
      addToast({ type: 'error', title: t('printAgents.revokeFailed'), message: extractErrorMessage(err) });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 mt-12">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">{t('printAgents.title')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t('printAgents.subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex gap-3 mb-6">
            <Input
              placeholder={t('printAgents.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="max-w-sm"
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || isCreating}>
              <Plus className="w-4 h-4 mr-2" />
              {t('printAgents.register')}
            </Button>
          </div>

          {newToken && (
            <div className="mb-6 p-4 border border-success/30 bg-success/10 rounded-lg">
              <div className="flex gap-2 items-start text-success-foreground">
                <KeyRound className="w-5 h-5 mt-0.5" />
                <div>
                  <h4 className="font-bold">{t('printAgents.tokenGenerated', { name: newToken.name })}</h4>
                  <p className="text-sm mt-1 mb-3">{t('printAgents.tokenHint')} <strong>{t('printAgents.tokenWarning')}</strong></p>
                  <code className="block p-3 bg-black/10 rounded-md font-mono text-sm break-all select-all">
                    {newToken.token}
                  </code>
                  <Button size="sm" variant="outline" className="mt-4" onClick={() => setNewToken(null)}>
                    {t('printAgents.copied')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="h-20 bg-secondary/40 animate-pulse rounded-lg" />
          ) : agents.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              {t('printAgents.empty')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {agents.map((agent) => {
                const isOnline = agent.lastHeartbeat && new Date().getTime() - new Date(agent.lastHeartbeat).getTime() < 30000;
                
                return (
                  <div key={agent.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-secondary rounded-lg">
                        <Server className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{agent.name}</p>
                          {agent.isRevoked ? (
                            <Badge variant="error" className="text-[10px]">{t('printAgents.revokedBadge')}</Badge>
                          ) : isOnline ? (
                            <Badge variant="success" className="text-[10px]">{t('printAgents.onlineBadge')}</Badge>
                          ) : (
                            <Badge variant="neutral" className="text-[10px]">{t('printAgents.offlineBadge')}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('printAgents.lastActive')}: {agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleString() : t('printAgents.never')}
                        </p>
                      </div>
                    </div>
                    {!agent.isRevoked && (
                      <Tooltip label={t('printAgents.revokeTooltip')}>
                        <button
                          onClick={() => handleRevoke(agent.id, agent.name)}
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
