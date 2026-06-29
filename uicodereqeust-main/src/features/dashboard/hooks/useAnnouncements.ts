import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnnouncementsService } from "../services/announcementsService";
import { useToast } from "@/hooks/use-toast";

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: () => AnnouncementsService.getAnnouncements(),
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { title: string; content: string; priority: string; is_active: boolean }) =>
      AnnouncementsService.createAnnouncement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Success", description: "Announcement created." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { title: string; content: string; priority: string; is_active: boolean } }) =>
      AnnouncementsService.updateAnnouncement(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Success", description: "Announcement updated." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => AnnouncementsService.deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Deleted", description: "Announcement removed." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}
