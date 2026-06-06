/**
 * useWaRealtime
 * Subscribes to the /api/sse/wa-events endpoint and calls the provided
 * callbacks when real-time events arrive.
 *
 * Usage:
 *   useWaRealtime({
 *     onNewMessage: () => { refetchConversations(); refetchInsights(); }
 *   });
 */

import { useEffect, useRef } from "react";

interface WaRealtimeOptions {
  /** Called when a new WhatsApp message is stored */
  onNewMessage?: (data: { conversationId: number; messageId: number; instanceId?: number }) => void;
  /** Called when AI analysis completes for a conversation */
  onAnalysisDone?: (data: { conversationId: number }) => void;
  /** Whether to enable the subscription (default: true) */
  enabled?: boolean;
}

export function useWaRealtime(options: WaRealtimeOptions = {}) {
  const { onNewMessage, onAnalysisDone, enabled = true } = options;
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      // Clean up any existing connection
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const es = new EventSource("/api/sse/wa-events");
      esRef.current = es;

      es.addEventListener("connected", () => {
        // Reset reconnect delay on successful connection
        reconnectDelay.current = 1000;
      });

      es.addEventListener("new_message", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onNewMessage?.(data);
        } catch { /* ignore parse errors */ }
      });

      es.addEventListener("analysis_done", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onAnalysisDone?.(data);
        } catch { /* ignore parse errors */ }
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential backoff: 1s → 2s → 4s → 8s → max 30s
        const delay = Math.min(reconnectDelay.current, 30_000);
        reconnectDelay.current = Math.min(delay * 2, 30_000);
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
