import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RequestsService } from "../services/requestsService";
import { useToast } from "@/hooks/use-toast";

export function useDeleteQueue() {
  return useQuery({
    queryKey: ["delete-queue"],
    queryFn: () => RequestsService.getDeleteQueue(),
  });
}

export function useDeleteArchive() {
  return useQuery({
    queryKey: ["delete-archive"],
    queryFn: () => RequestsService.getDeleteArchive(),
  });
}

export function useResolveDeleteRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approved" | "rejected" }) =>
      RequestsService.resolveDeleteRequest(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delete-queue"] });
      queryClient.invalidateQueries({ queryKey: ["delete-archive"] });
      toast({ title: "Success", description: "Request resolved successfully." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });
}

