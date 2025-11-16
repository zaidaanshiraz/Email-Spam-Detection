'use client';

import * as React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

import type { InboxEmail, SummarizationState, EmailRiskLevel, UserSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Archive, Bot, Clock, Loader2, Mail as MailIcon, Reply, Trash, FileText, ShieldCheck, ShieldAlert, Star, Flag } from 'lucide-react';
import { useDashboardState } from '@/hooks/use-dashboard-state';
import { summarizeEmailAction, analyzeUrlAction, analyzeEmailAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useEmailState } from '@/hooks/use-email-state';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { RiskTag } from './risk-tag';

// Helper component to render the row of tags, just like the screenshot
const EmailInfoTags = ({ email }: { email: InboxEmail }) => {
  if (!email.riskLevel || email.riskLevel === 'unknown' || email.riskLevel === 'analyzing') {
    return <RiskTag riskLevel={email.riskLevel || 'unknown'} />;
  }

  const tags: React.ReactNode[] = [];
  let mainTag: EmailRiskLevel = 'safe';
  
  if (email.riskLevel === 'high' || email.riskLevel === 'spam') {
    mainTag = 'spam';
    tags.push(<RiskTag key="detail" riskLevel="suspicious" />);
  } else if (email.riskLevel === 'medium' || email.riskLevel === 'suspicious') {
    mainTag = 'suspicious';
    tags.push(<RiskTag key="detail" riskLevel="safe" />);
  } else {
    mainTag = 'safe';
    tags.push(<RiskTag key="detail" riskLevel="safe" />);
  }

  const vpnTag = email.vpn ? (
    <div key="vpn" className="text-xs font-semibold text-white bg-blue-500 px-2 py-0.5 rounded-full">
      VPN: {email.vpn}
    </div>
  ) : (
    <div key="vpn" className="text-xs font-semibold text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
      No VPN
    </div>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <RiskTag riskLevel={mainTag} />
      {tags}
      {vpnTag}
    </div>
  );
};

export function Inbox() {
  const { inboxEmails, setInboxEmails } = useEmailState();
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [activeEmailId, setActiveEmailId] = useState<string | null>(inboxEmails.find(e => e.status === 'inbox')?.id || null);

  // RESTORED: State for summarization
  const [summarizationState, setSummarizationState] = useState<SummarizationState>({ status: 'idle', result: null, error: null });
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);

  const { setAnalyzeEmailFromInbox } = useDashboardState();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'ai');
  }, [firestore, user]);

  const { data: userSettings } = useDoc<UserSettings>(settingsDocRef);

  const activeEmail = useMemo(() => inboxEmails.find(email => email.id === activeEmailId), [inboxEmails, activeEmailId]);
  const inboxViewEmails = useMemo(() => inboxEmails.filter(e => e.status === 'inbox'), [inboxEmails]);
  
  // RESTORED: Handler functions
  const toggleSelection = (emailId: string) => {
    setSelectedEmailIds(prev => {
      const newSet = new Set(prev);
      newSet.has(emailId) ? newSet.delete(emailId) : newSet.add(emailId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEmailIds.size === inboxViewEmails.length) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(inboxViewEmails.map(e => e.id)));
    }
  };

  const toggleStarred = (e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    setInboxEmails(emails => emails.map(email => 
      email.id === emailId ? { ...email, starred: !email.starred } : email
    ));
  };

  const moveSelectedToTrash = () => {
    setInboxEmails(emails => emails.map(email => 
      selectedEmailIds.has(email.id) ? { ...email, status: 'trash' } : email
    ));
    const newActiveEmail = inboxEmails.find(e => e.status === 'inbox' && !selectedEmailIds.has(e.id));
    setActiveEmailId(newActiveEmail?.id || null);
    setSelectedEmailIds(new Set());
    toast({ title: `${selectedEmailIds.size} conversation(s) moved to the bin.`});
  };

  const handleAnalyzeClick = () => {
    if (activeEmail) {
      const urlRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g;
      const urls = Array.from(activeEmail.body.matchAll(urlRegex), m => m[2]);
      
      const emailDataForAnalysis = {
        emailSubject: activeEmail.subject,
        senderDomain: activeEmail.from.email.split('@')[1] || 'unknown.com',
        senderIp: activeEmail.ip || undefined,
        emailBody: activeEmail.body,
        urlList: urls,
        sensitivity: userSettings ? userSettings.sensitivity / 100 : 0.5,
      };

      setAnalyzeEmailFromInbox(emailDataForAnalysis);
      router.push('/');
    }
  };

  const handleSummarizeClick = async () => {
    if (!activeEmail) return;

    setSummarizationState({ status: 'loading', result: null, error: null });
    setIsSummaryDialogOpen(true);

    const { data, error } = await summarizeEmailAction({ emailBody: activeEmail.body });

    if (error) {
      setSummarizationState({ status: 'error', result: null, error });
    } else {
      setSummarizationState({ status: 'success', result: data, error: null });
    }
  };

  const runBulkAnalysis = useCallback(async () => {
    const emailsToAnalyze = inboxEmails.filter(e => e.status === 'inbox' && !e.riskLevel);
    if (emailsToAnalyze.length === 0) return;

    setInboxEmails(currentEmails =>
      currentEmails.map(e => emailsToAnalyze.find(a => a.id === e.id) ? { ...e, riskLevel: 'analyzing' } : e)
    );

    const sensitivity = userSettings ? userSettings.sensitivity / 100 : 0.5;

    const analysisPromises = emailsToAnalyze.map(async (email) => {
      const urlRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g;
      const urls = Array.from(email.body.matchAll(urlRegex), m => m[2]);

      const { data, error } = await analyzeEmailAction({
        emailSubject: email.subject,
        senderDomain: email.from.email.split('@')[1] || 'unknown.com',
        emailBody: email.body,
        urlList: urls,
        sensitivity: sensitivity,
      });

      let riskLevel: EmailRiskLevel = 'safe';
      if (error) {
        riskLevel = 'unknown';
      } else if (data) {
        if (data.isPhishing) {
           riskLevel = data.phishingScore > 0.8 ? 'spam' : data.phishingScore > 0.6 ? 'suspicious' : 'safe';
        }
      }
      
      return {
        id: email.id,
        riskLevel,
        ip: data?.senderIp,
        score: data ? Math.round(data.phishingScore * 100) : 0,
        vpn: data?.vpnProvider,
      };
    });

    const results = await Promise.all(analysisPromises);
    
    setInboxEmails(currentEmails =>
      currentEmails.map(e => {
        const result = results.find(r => r.id === e.id);
        return result ? { ...e, riskLevel: result.riskLevel, ip: result.ip, score: result.score, vpn: result.vpn } : e;
      })
    );
  }, [inboxEmails, setInboxEmails, userSettings]);

  useEffect(() => {
    runBulkAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSettings]); 

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold font-headline">Inbox</h1>
            <p className="text-muted-foreground">You have {inboxViewEmails.filter(e => e.unread).length} unread messages.</p>
          </div>
          {selectedEmailIds.size > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={moveSelectedToTrash}>
                  <Trash className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 overflow-hidden">
          <div className="col-span-1 border-r flex flex-col">
            <div className="p-2 border-b">
              <div className="flex items-center gap-2 p-2">
                <Checkbox
                  id="select-all"
                  checked={selectedEmailIds.size === inboxViewEmails.length && inboxViewEmails.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
                <label htmlFor="select-all" className="text-sm font-medium">Select All</label>
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col">
                {inboxViewEmails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => setActiveEmailId(email.id)}
                    className={cn(
                      'flex items-start gap-2 p-3 text-left text-sm transition-colors cursor-pointer border-b',
                      'hover:bg-accent/50 hover:text-foreground',
                      activeEmailId === email.id && 'bg-accent',
                      email.unread && 'bg-primary/5'
                    )}
                  >
                    <div className="flex items-center gap-3 pt-1">
                      <Checkbox
                        checked={selectedEmailIds.has(email.id)}
                        onCheckedChange={() => toggleSelection(email.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select email from ${email.from.name}`}
                      />
                      <button onClick={(e) => toggleStarred(e, email.id)}>
                        <Star className={cn("size-4", email.starred ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground')} />
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Flag 
                            className={cn("size-5", 
                              email.riskLevel === 'safe' || email.riskLevel === 'low' ? 'text-green-500' : 
                              email.riskLevel === 'suspicious' || email.riskLevel === 'medium' ? 'text-yellow-500' : 
                              email.riskLevel === 'spam' || email.riskLevel === 'high' ? 'text-red-500' : 
                              'text-gray-400'
                            )} 
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {email.riskLevel === 'safe' || email.riskLevel === 'low'
                            ? 'Green flag: Safe/Low risk'
                            : email.riskLevel === 'suspicious' || email.riskLevel === 'medium'
                            ? 'Yellow flag: Caution/Medium risk'
                            : email.riskLevel === 'spam' || email.riskLevel === 'high'
                            ? 'Red flag: High risk/Spam'
                            : 'Gray flag: Risk unknown or analyzing'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <p className={cn("font-semibold truncate", email.unread && "font-bold")}>
                            {email.from.name}
                          </p>
                          <p className={cn("text-xs text-muted-foreground", email.unread && "font-bold text-foreground")}>
                            {format(new Date(email.date), 'PP')}
                          </p>
                        </div>
                        <p className={cn("text-sm truncate font-bold")}>{email.subject}</p>
                        {email.riskLevel && email.riskLevel !== 'analyzing' && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <span>IP: {email.ip || 'N/A'}</span>
                            <span>|</span>
                            <span>Score: {email.score ?? 'N/A'}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-1">{email.snippet}</p>
                        <div className="mt-2">
                          <EmailInfoTags email={email} />
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col">
            {activeEmail ? (
              <>
                {/* RESTORED: Header with AI buttons */}
                <div className="flex items-center p-4 border-b gap-2 flex-wrap">
                  <Button onClick={handleAnalyzeClick}><Bot className="mr-2 size-4" /> Analyze with AI</Button>
                  <Button onClick={handleSummarizeClick} variant="outline" disabled={summarizationState.status === 'loading'}><FileText className="mr-2 size-4" /> Summarize</Button>
                  <Separator orientation="vertical" className="h-6 mx-2 hidden md:block" />
                  <Button variant="ghost" size="icon"><Reply /><span className="sr-only">Reply</span></Button>
                  <Button variant="ghost" size="icon"><Archive /><span className="sr-only">Archive</span></Button>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
                    <Clock className="size-4" />
                    <span>{format(new Date(activeEmail.date), 'PPP p')}</span>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-4 md:p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-bold font-headline">{activeEmail.subject}</h2>
                  </div>
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="size-10">
                      <AvatarImage src={activeEmail.from.avatar} alt={activeEmail.from.name} />
                      <AvatarFallback>{activeEmail.from.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{activeEmail.from.name}</p>
                      <p className="text-sm text-muted-foreground">{activeEmail.from.email}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="prose prose-sm dark:prose-invert max-w-none mt-6" dangerouslySetInnerHTML={{ __html: activeEmail.body }} />
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MailIcon className="size-16 text-muted-foreground/50" />
                <h2 className="mt-4 text-xl font-semibold">No Email Selected</h2>
                <p className="mt-2 text-sm text-muted-foreground">{inboxViewEmails.length > 0 ? "Please select an email to view its content." : "Your inbox is empty."}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* RESTORED: Summary Dialog */}
      <AlertDialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileText /> Email Summary
            </AlertDialogTitle>
            <AlertDialogDescription>
              AI-generated summary of the selected email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {summarizationState.status === 'loading' && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            )}
            {summarizationState.status === 'error' && (
              <p className="text-destructive">{summarizationState.error}</p>
            )}
            {summarizationState.status === 'success' && summarizationState.result && (
              <div
                className="prose prose-sm dark:prose-invert"
                dangerouslySetInnerHTML={{
                  __html: summarizationState.result.summary.replace(/•/g, '<li>'),
                }}
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}