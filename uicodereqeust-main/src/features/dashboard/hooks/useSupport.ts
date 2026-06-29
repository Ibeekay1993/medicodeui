import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SupportService } from "../services/supportService";
import { useToast } from "@/hooks/use-toast";

export function useSupportConversations() {
  return useQuery({
    queryKey: ["support-conversations"],
    queryFn: () => SupportService.getConversations(),
  });
}

export function useSupportMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["support-messages", conversationId],
    queryFn: () => (conversationId ? SupportService.getMessages(conversationId) : []),
    enabled: !!conversationId,
  });
}

export function useSendSupportMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ conversationId, message, senderId }: { conversationId: string; message: string; senderId: string }) =>
      SupportService.sendMessage(conversationId, message, senderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["support-messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["support-conversations"] });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useUpdateConversationStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => SupportService.updateConversationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-conversations"] });
      toast({ title: "Status Updated", description: "Conversation status changed." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}
