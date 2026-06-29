import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UsersService } from "../services/usersService";
import { useToast } from "@/hooks/use-toast";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => UsersService.getUsers(),
  });
}

export function useNameChangeRequests() {
  return useQuery({
    queryKey: ["name-change-requests"],
    queryFn: () => UsersService.getNameChangeRequests(),
  });
}

export function useApproveNameChange() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, newName, userId }: { id: string; newName: string; userId: string }) =>
      UsersService.approveNameChange(id, newName, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["name-change-requests"] });
      toast({ title: "Approved", description: "Name change request approved." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useRejectNameChange() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => UsersService.rejectNameChange(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["name-change-requests"] });
      toast({ title: "Rejected", description: "Name change request rejected." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => UsersService.updateUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Success", description: "User role updated successfully." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useToggleUserAccess() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      UsersService.toggleUserAccess(userId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Success", description: "User access updated." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (userId: string) => UsersService.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Deleted", description: "User successfully removed." });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}
