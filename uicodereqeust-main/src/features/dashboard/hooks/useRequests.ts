import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RequestsService } from "../services/requestsService";
import { useToast } from "@/hooks/use-toast";

export function useRequestsQuery(params: { page: number; rowsPerPage: number; search: string; statusFilter: string; role: string }) {
  return useQuery({
    queryKey: ["requests", params.page, params.search, params.statusFilter, params.rowsPerPage, params.role],
    queryFn: () => RequestsService.getRequests(params),
    enabled: !!params.role,
  });
}

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

export function useHardDeleteRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => RequestsService.hardDeleteRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delete-archive"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "Deleted", description: "Record permanently deleted." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });
}

export function useRequestDeletion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => RequestsService.deleteRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "Deletion Requested", description: "The deletion request has been submitted for approval." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });
}
