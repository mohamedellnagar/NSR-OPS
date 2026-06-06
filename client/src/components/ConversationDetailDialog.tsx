import { useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Sparkles, User, Bot } from "lucide-react";

interface Props {
  conversationId: number | null;
  source?: "wa" | "wh";
  onClose: () => void;
  ar?: boolean;
}

const sentimentConfig: Record<string, { label: string; arLabel: string; color: string }> = {
  positive: { label: "Positive", arLabel: "إيجابي", color: "bg-green-100 text-green-700" },
  negative: { label: "Negative", arLabel: "سلبي", color: "bg-red-100 text-red-700" },
  neutral:  { label: "Neutral",  arLabel: "محايد",  color: "bg-slate-100 text-slate-600" },
  mixed:    { label: "Mixed",    arLabel: "مختلط",  color: "bg-amber-100 text-amber-700" },
};

const urgencyConfig: Record<string, { label: string; arLabel: string; color: string }> = {
  critical: { label: "Critical", arLabel: "حرج",     color: "bg-red-100 text-red-700" },
  high:     { label: "High",     arLabel: "عالي",    color: "bg-orange-100 text-orange-700" },
  medium:   { label: "Medium",   arLabel: "متوسط",   color: "bg-amber-100 text-amber-700" },
  low:      { label: "Low",      arLabel: "منخفض",   color: "bg-slate-100 text-slate-500" },
};

export function ConversationDetailDialog({ conversationId, source, onClose, ar = true }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.waBatch.getConversationDetail.useQuery(
    { conversationId: conversationId!, source },
    { enabled: conversationId !== null, staleTime: 30_000 }
  );

  useEffect(() => {
    if (data?.messages) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [data?.messages]);

  const conv = data?.conversation as Record<string, unknown> | undefined;
  const messages = (data?.messages ?? []) as Array<Record<string, unknown>>;
  const analysis = data?.analysis as Record<string, unknown> | null | undefined;

  const sentLabel = analysis?.sentiment
    ? (ar ? (sentimentConfig[analysis.sentiment as string]?.arLabel ?? analysis.sentiment) : (sentimentConfig[analysis.sentiment as string]?.label ?? analysis.sentiment))
    : null;
  const sentColor = sentimentConfig[analysis?.sentiment as string]?.color ?? "bg-slate-100 text-slate-500";

  const urgLabel = analysis?.urgencyLevel
    ? (ar ? (urgencyConfig[analysis.urgencyLevel as string]?.arLabel ?? analysis.urgencyLevel) : (urgencyConfig[analysis.urgencyLevel as string]?.label ?? analysis.urgencyLevel))
    : null;
  const urgColor = urgencyConfig[analysis?.urgencyLevel as string]?.color ?? "bg-slate-100 text-slate-500";

  const keyTopics = Array.isArray(analysis?.keyTopics) ? (analysis!.keyTopics as string[]) : [];

  return (
    <Dialog open={conversationId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-full h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b bg-white flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {String(conv?.contactLabel ?? "?")[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-semibold text-slate-800 leading-tight">
                {String(conv?.contactLabel || conv?.contactPhone || "...")}
              </p>
              <p className="text-xs text-slate-400 font-normal">{String(conv?.contactPhone ?? "")}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
              {sentLabel && <Badge className={`text-xs px-2 py-0.5 rounded-full border-0 ${sentColor}`}>{sentLabel}</Badge>}
              {urgLabel && urgLabel !== (ar ? "منخفض" : "Low") && <Badge className={`text-xs px-2 py-0.5 rounded-full border-0 ${urgColor}`}>{urgLabel}</Badge>}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* AI Analysis Panel */}
        {analysis && (
          <div className="px-5 py-3 bg-purple-50 border-b flex-shrink-0">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="text-purple-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-purple-700 mb-1">{ar ? "تحليل الذكاء الاصطناعي" : "AI Analysis"}</p>
                {Boolean(analysis.impressionSummary) && (
                  <p className="text-xs text-slate-600 mb-1.5 leading-relaxed">{String(analysis.impressionSummary)}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {keyTopics.map((t, i) => (
                    <span key={i} className="text-xs bg-white border border-purple-200 text-purple-600 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
                {Boolean(analysis.suggestedReply) && (
                  <div className="mt-2 p-2 bg-white rounded-lg border border-purple-200">
                    <p className="text-xs text-slate-400 mb-0.5">{ar ? "الرد المقترح:" : "Suggested reply:"}</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{String(analysis.suggestedReply)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-50 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <MessageCircle size={32} className="mb-2 opacity-40" />
              <p className="text-sm">{ar ? "لا توجد رسائل محفوظة" : "No messages stored"}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = Boolean(msg.fromMe);
              const body = (msg.body as string) || (msg.caption as string) || "";
              const ts = msg.timestamp ? new Date(Number(msg.timestamp) * (Number(msg.timestamp) < 1e12 ? 1000 : 1)) : null;
              return (
                <div key={msg.id as number} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isMe ? "bg-blue-500" : "bg-slate-300"}`}>
                    {isMe ? <Bot size={13} className="text-white" /> : <User size={13} className="text-slate-600" />}
                  </div>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${isMe ? "bg-blue-500 text-white rounded-br-sm" : "bg-white text-slate-800 rounded-bl-sm border border-slate-100"}`}>
                    {body ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{body}</p>
                    ) : (
                      <p className="text-xs italic opacity-60">[{msg.messageType as string}]</p>
                    )}
                    {ts && (
                      <p className={`text-xs mt-1 opacity-60 ${isMe ? "text-right" : "text-left"}`}>
                        {ts.toLocaleTimeString(ar ? "ar-AE" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
