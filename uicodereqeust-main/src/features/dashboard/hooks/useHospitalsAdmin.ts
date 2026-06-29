import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HospitalsAdminService } from "../services/hospitalsAdminService";
import { useToast } from "@/hooks/use-toast";

export function useHospitalsPaged() {
  return useQuery({
    queryKey: ["hospitals-admin"],
    queryFn: () => HospitalsAdminService.getHospitalsPaged(),
  });
}

export function useHospitalUsers() {
  return useQuery({
    queryKey: ["hospital-users"],
    queryFn: () => HospitalsAdminService.getHospitalUsers(),
  });
}

export function useCreateHospital() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: any) => HospitalsAdminService.createHospital(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospitals-admin"] });
      toast({ title: "Success", description: "Hospital registered successfully." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useUpdateHospital() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => HospitalsAdminService.updateHospital(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospitals-admin"] });
      toast({ title: "Success", description: "Hospital updated successfully." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useToggleHospitalActive() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      HospitalsAdminService.toggleHospitalActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospitals-admin"] });
      toast({ title: "Updated", description: "Status updated successfully." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useDeleteHospital() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => HospitalsAdminService.deleteHospital(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospitals-admin"] });
      toast({ title: "Deleted", description: "Hospital removed." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useLinkUserToHospital() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ userId, hospitalId }: { userId: string; hospitalId: string }) =>
      HospitalsAdminService.linkUserToHospital(userId, hospitalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital-users"] });
      toast({ title: "Linked", description: "User successfully linked to hospital." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}
